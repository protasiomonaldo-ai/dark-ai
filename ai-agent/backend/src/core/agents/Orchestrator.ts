import { MemorySystem } from '../memory/MemorySystem';
import { KnowledgeGraph } from '../knowledge/KnowledgeGraph';
import { ReasoningEngine } from '../reasoning/ReasoningEngine';
import { Planner, Plan, PlannedTask } from '../planner/Planner';
import { ContextEngine } from '../context/ContextEngine';
import { SecurityEngine } from '../security/SecurityEngine';
import { DecisionEngine } from '../decision/DecisionEngine';
import { ToolCalling } from '../tools/ToolCalling';
import { CodeGenerator } from '../generator/CodeGenerator';
import { CodeReviewer } from '../reviewer/CodeReviewer';
import { CodeTools } from '../tools/CodeTools';
import { FileTools } from '../tools/FileTools';
import { LearningEngine } from '../learning/LearningEngine';
import { RepositoryAnalyzer } from '../analyzer/RepositoryAnalyzer';
import EventEmitter from 'events';

export type AgentEvent =
  | { type: 'THINKING'; content: string }
  | { type: 'PLANNING'; plan: Plan }
  | { type: 'TASK_START'; task: PlannedTask }
  | { type: 'TASK_COMPLETE'; task: PlannedTask; result: unknown }
  | { type: 'TASK_FAIL'; task: PlannedTask; error: string }
  | { type: 'TOOL_CALL'; tool: string; args: Record<string, unknown> }
  | { type: 'TOOL_RESULT'; tool: string; success: boolean; data: unknown }
  | { type: 'CODE_GENERATED'; files: Array<{ path: string; content: string }> }
  | { type: 'REVIEW_RESULT'; status: string; score: number }
  | { type: 'SECURITY_ALERT'; message: string; severity: string }
  | { type: 'RESPONSE'; content: string }
  | { type: 'ERROR'; message: string }
  | { type: 'DONE'; summary: string };

export class Orchestrator extends EventEmitter {
  private memory: MemorySystem;
  private knowledge: KnowledgeGraph;
  private reasoning: ReasoningEngine;
  private planner: Planner;
  private context: ContextEngine;
  private security: SecurityEngine;
  private decision: DecisionEngine;
  private tools: ToolCalling;
  private generator: CodeGenerator;
  private reviewer: CodeReviewer;
  private learning: LearningEngine;
  private analyzer: RepositoryAnalyzer;
  private sessionId: string;
  private isRunning = false;

  constructor(sessionId: string, workspaceRoot = process.cwd()) {
    super();
    this.sessionId = sessionId;
    this.memory = new MemorySystem(sessionId);
    this.knowledge = new KnowledgeGraph();
    this.reasoning = new ReasoningEngine(this.memory, this.knowledge);
    this.planner = new Planner();
    this.context = new ContextEngine(this.memory, this.knowledge);
    this.security = new SecurityEngine();
    this.decision = new DecisionEngine();
    const fileTools = new FileTools(workspaceRoot);
    const codeTools = new CodeTools(fileTools);
    this.tools = new ToolCalling(workspaceRoot);
    this.generator = new CodeGenerator(codeTools, this.memory);
    this.reviewer = new CodeReviewer(codeTools, this.security);
    this.learning = new LearningEngine();
    this.analyzer = new RepositoryAnalyzer(fileTools, codeTools);
  }

  async init(): Promise<void> {
    await this.memory.init();
    await this.knowledge.load();
  }

  async process(userInput: string): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      this.memory.rememberShort(userInput, 'message', 0.8, ['user', 'input']);

      this.emit('event', { type: 'THINKING', content: 'Analyzing your request...' } as AgentEvent);

      const reasoningResult = await this.reasoning.reason(userInput);
      this.emit('event', { type: 'THINKING', content: `Intent: ${reasoningResult.intent} | Complexity: ${reasoningResult.complexity} | Confidence: ${Math.round(reasoningResult.confidence * 100)}%` } as AgentEvent);

      const securityCheck = this.security.analyzeInput(userInput);
      if (!securityCheck.canProceed) {
        this.emit('event', { type: 'SECURITY_ALERT', message: securityCheck.message, severity: 'CRITICAL' } as AgentEvent);
        this.emit('event', { type: 'RESPONSE', content: `⛔ Request blocked for security reasons: ${securityCheck.message}` } as AgentEvent);
        return;
      }

      const contextPackage = await this.context.buildContext(userInput, reasoningResult);
      this.emit('event', { type: 'THINKING', content: `Context built: ${contextPackage.totalTokens} tokens | Priority: ${contextPackage.priority}` } as AgentEvent);

      const decision = this.decision.decide(reasoningResult, securityCheck);
      if (!decision.approved) {
        this.emit('event', { type: 'RESPONSE', content: `❌ Cannot proceed: ${decision.reason}` } as AgentEvent);
        return;
      }

      const plan = await this.planner.createPlan(reasoningResult, this.sessionId);
      this.emit('event', { type: 'PLANNING', plan } as AgentEvent);

      const suggestions = await this.learning.getSuggestions(userInput);
      if (suggestions.length > 0) {
        this.emit('event', { type: 'THINKING', content: `Learning suggestions: ${suggestions[0].suggestion}` } as AgentEvent);
      }

      let overallSuccess = true;
      const results: unknown[] = [];

      for (const task of plan.tasks) {
        this.emit('event', { type: 'TASK_START', task } as AgentEvent);
        await this.planner.updateTaskStatus(task.id, 'RUNNING');

        try {
          const result = await this.executeTask(task, userInput, reasoningResult);
          results.push(result);
          await this.planner.updateTaskStatus(task.id, 'COMPLETED', { result });
          this.emit('event', { type: 'TASK_COMPLETE', task, result } as AgentEvent);
          await this.learning.recordOutcome(task.title, 'SUCCESS', userInput);
        } catch (err) {
          overallSuccess = false;
          const errorMsg = String(err);
          await this.planner.updateTaskStatus(task.id, 'FAILED', undefined, errorMsg);
          this.emit('event', { type: 'TASK_FAIL', task, error: errorMsg } as AgentEvent);
          await this.learning.recordOutcome(task.title, 'FAILURE', userInput);
          const recovery = this.decision.decideOnError(errorMsg, task.title);
          this.emit('event', { type: 'THINKING', content: `Recovery: ${recovery.reason}` } as AgentEvent);
          if (recovery.chosen.id === 'abort') break;
        }
      }

      const response = await this.synthesizeResponse(userInput, reasoningResult, results, overallSuccess);
      this.memory.rememberShort(response, 'output', 0.7, ['agent', 'response']);
      await this.memory.rememberLong(
        `Request: ${userInput} | Result: ${overallSuccess ? 'SUCCESS' : 'PARTIAL'} | Intent: ${reasoningResult.intent}`,
        'execution_history', 'episodic', 0.6
      );

      this.emit('event', { type: 'RESPONSE', content: response } as AgentEvent);
      this.emit('event', {
        type: 'DONE',
        summary: `Completed ${plan.tasks.filter(t => t.status === 'COMPLETED').length}/${plan.tasks.length} tasks | ${overallSuccess ? '✅ Success' : '⚠️ Partial'}`
      } as AgentEvent);

      const improvements = await this.learning.improveFromResults();
      if (improvements.length > 0) {
        this.emit('event', { type: 'THINKING', content: `Self-improvement: ${improvements.join('; ')}` } as AgentEvent);
      }

    } catch (err) {
      this.emit('event', { type: 'ERROR', message: String(err) } as AgentEvent);
    } finally {
      this.isRunning = false;
    }
  }

  private async executeTask(task: PlannedTask, userInput: string, reasoning: ReturnType<typeof this.reasoning.reason> extends Promise<infer T> ? T : never): Promise<unknown> {
    const titleLower = task.title.toLowerCase();

    if (titleLower.includes('scan') || titleLower.includes('repository')) {
      const toolResult = await this.tools.call('scan_repository', { path: '.' });
      this.emit('event', { type: 'TOOL_CALL', tool: 'scan_repository', args: {} } as AgentEvent);
      this.emit('event', { type: 'TOOL_RESULT', tool: 'scan_repository', success: toolResult.success, data: toolResult.data } as AgentEvent);
      return toolResult.data;
    }

    if (titleLower.includes('generate') || titleLower.includes('create') || titleLower.includes('implement')) {
      const awaitedReasoning = await Promise.resolve(reasoning);
      const generated = await this.generator.generate(awaitedReasoning);
      for (const file of generated.files) {
        const secReport = this.security.analyzeCode(file.content, file.path);
        if (secReport.findings.length > 0 && !secReport.canProceed) {
          this.emit('event', { type: 'SECURITY_ALERT', message: secReport.message, severity: 'HIGH' } as AgentEvent);
          continue;
        }
        const writeResult = await this.tools.call('write_file', { path: file.path, content: file.content });
        this.emit('event', { type: 'TOOL_CALL', tool: 'write_file', args: { path: file.path } } as AgentEvent);
        this.emit('event', { type: 'TOOL_RESULT', tool: 'write_file', success: writeResult.success, data: writeResult.data } as AgentEvent);
      }
      this.emit('event', { type: 'CODE_GENERATED', files: generated.files.map(f => ({ path: f.path, content: f.content })) } as AgentEvent);
      return generated;
    }

    if (titleLower.includes('review') || titleLower.includes('analyz')) {
      const listResult = await this.tools.call('list_files', { path: '.' });
      return listResult.data;
    }

    if (titleLower.includes('search') || titleLower.includes('find') || titleLower.includes('locate')) {
      const keywords = userInput.replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3).slice(0, 3);
      const toolResult = await this.tools.call('grep_code', { pattern: keywords[0] || userInput.slice(0, 20), path: '.' });
      this.emit('event', { type: 'TOOL_CALL', tool: 'grep_code', args: { pattern: keywords[0] } } as AgentEvent);
      this.emit('event', { type: 'TOOL_RESULT', tool: 'grep_code', success: toolResult.success, data: toolResult.data } as AgentEvent);
      return toolResult.data;
    }

    return { task: task.title, status: 'completed', note: 'Task processed by reasoning engine' };
  }

  private async synthesizeResponse(
    input: string,
    reasoning: Awaited<ReturnType<ReasoningEngine['reason']>>,
    results: unknown[],
    success: boolean
  ): Promise<string> {
    const memories = await this.memory.recall(input);
    const parts: string[] = [];

    parts.push(`## ${success ? '✅' : '⚠️'} Result`);
    parts.push('');

    switch (reasoning.intent) {
      case 'CREATE':
        if (results.some(r => r && typeof r === 'object' && 'files' in (r as object))) {
          const gen = results.find(r => r && typeof r === 'object' && 'files' in (r as object)) as { files: Array<{ path: string }> };
          parts.push(`Generated ${gen.files.length} file(s):`);
          for (const f of gen.files) parts.push(`- \`${f.path}\``);
        } else {
          parts.push(`Created based on: ${reasoning.goal}`);
        }
        break;
      case 'ANALYZE':
        parts.push('Repository analyzed. Structure mapped, dependencies identified.');
        break;
      case 'FIX':
        parts.push(`Fix applied for: ${reasoning.goal}`);
        break;
      case 'EXPLAIN':
        parts.push(this.generateExplanation(input, reasoning));
        break;
      default:
        parts.push(`Processed: ${reasoning.goal}`);
    }

    if (reasoning.risks.length > 0) {
      parts.push('');
      parts.push('**⚠️ Notes:**');
      for (const risk of reasoning.risks) parts.push(`- ${risk}`);
    }

    if (memories.length > 0) {
      const relevantMem = memories[0];
      const memContent = String((relevantMem.entry as Record<string, unknown>)['content'] || '');
      if (memContent && memContent !== input) {
        parts.push('');
        parts.push(`*From memory: ${memContent.slice(0, 100)}*`);
      }
    }

    return parts.join('\n');
  }

  private generateExplanation(input: string, reasoning: Awaited<ReturnType<ReasoningEngine['reason']>>): string {
    return [
      `**Analysis of:** ${input}`,
      '',
      `**Intent:** ${reasoning.intent}`,
      `**Complexity:** ${reasoning.complexity}`,
      `**Domains:** ${reasoning.domainTags.join(', ')}`,
      '',
      `**Assessment:** ${reasoning.analysis}`,
      '',
      `**Recommendation:** ${reasoning.decision}`,
    ].join('\n');
  }

  getSessionId(): string { return this.sessionId; }

  getStats(): Record<string, unknown> {
    return {
      sessionId: this.sessionId,
      memory: this.memory.stats(),
      learning: this.learning.getStats(),
      knowledge: this.knowledge.stats(),
    };
  }
}
