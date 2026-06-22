import { MemorySystem } from '../memory/MemorySystem';
import { KnowledgeGraph } from '../knowledge/KnowledgeGraph';
import { ReasoningResult } from '../reasoning/ReasoningEngine';

export interface ContextPackage {
  id: string;
  request: string;
  recentMessages: string[];
  relevantMemories: string[];
  knowledgeNodes: string[];
  taskContext: string;
  totalTokens: number;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  builtAt: number;
}

export interface ContextEntry {
  source: string;
  content: string;
  relevance: number;
  tokenCost: number;
}

const TOKEN_BUDGET = 8000;

export class ContextEngine {
  private memory: MemorySystem;
  private knowledge: KnowledgeGraph;

  constructor(memory: MemorySystem, knowledge: KnowledgeGraph) {
    this.memory = memory;
    this.knowledge = knowledge;
  }

  async buildContext(request: string, reasoning: ReasoningResult): Promise<ContextPackage> {
    const entries: ContextEntry[] = [];

    const recentMessages = this.memory.getRecentMessages(8).map(m => m.content);
    for (const msg of recentMessages) {
      entries.push({ source: 'conversation', content: msg, relevance: 0.8, tokenCost: this.estimateTokens(msg) });
    }

    const memories = await this.memory.recall(request);
    for (const mem of memories.slice(0, 5)) {
      const content = String((mem.entry as Record<string, unknown>)['content'] || '');
      if (content) {
        entries.push({ source: 'memory', content, relevance: mem.relevance, tokenCost: this.estimateTokens(content) });
      }
    }

    const knowledgeNodes = this.knowledge.search(request).slice(0, 5);
    for (const node of knowledgeNodes) {
      const content = `${node.type}: ${node.label} — ${JSON.stringify(node.properties).slice(0, 200)}`;
      entries.push({ source: 'knowledge', content, relevance: 0.7, tokenCost: this.estimateTokens(content) });
    }

    const domainEntries = this.buildDomainContext(reasoning);
    for (const entry of domainEntries) {
      entries.push(entry);
    }

    const ranked = this.rankAndFilter(entries, TOKEN_BUDGET);

    return {
      id: `ctx_${Date.now()}`,
      request,
      recentMessages: ranked.filter(e => e.source === 'conversation').map(e => e.content),
      relevantMemories: ranked.filter(e => e.source === 'memory').map(e => e.content),
      knowledgeNodes: ranked.filter(e => e.source === 'knowledge').map(e => e.content),
      taskContext: reasoning.analysis,
      totalTokens: ranked.reduce((sum, e) => sum + e.tokenCost, 0),
      priority: this.determinePriority(reasoning),
      builtAt: Date.now(),
    };
  }

  private buildDomainContext(reasoning: ReasoningResult): ContextEntry[] {
    const entries: ContextEntry[] = [];
    const domainRules: Record<string, string> = {
      frontend: 'Focus on component structure, props, state management, and UI rendering.',
      backend: 'Focus on API design, error handling, validation, and response formats.',
      database: 'Focus on schema design, query optimization, and data integrity.',
      auth: 'Focus on security: validate tokens, hash passwords, check permissions.',
      testing: 'Focus on edge cases, mocking dependencies, and assertion clarity.',
      devops: 'Focus on environment variables, health checks, and graceful shutdown.',
    };
    for (const domain of reasoning.domainTags) {
      const rule = domainRules[domain];
      if (rule) {
        entries.push({ source: 'domain', content: rule, relevance: 0.6, tokenCost: this.estimateTokens(rule) });
      }
    }
    return entries;
  }

  private rankAndFilter(entries: ContextEntry[], budget: number): ContextEntry[] {
    const sorted = [...entries].sort((a, b) => b.relevance - a.relevance);
    const result: ContextEntry[] = [];
    let used = 0;
    for (const entry of sorted) {
      if (used + entry.tokenCost > budget) continue;
      result.push(entry);
      used += entry.tokenCost;
    }
    return result;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private determinePriority(reasoning: ReasoningResult): ContextPackage['priority'] {
    if (reasoning.confidence < 0.4) return 'CRITICAL';
    if (reasoning.complexity === 'VERY_COMPLEX' || reasoning.complexity === 'COMPLEX') return 'HIGH';
    if (reasoning.complexity === 'MEDIUM') return 'MEDIUM';
    return 'LOW';
  }

  formatForAgent(ctx: ContextPackage): string {
    const parts: string[] = [];
    if (ctx.recentMessages.length > 0) {
      parts.push('=== RECENT CONVERSATION ===\n' + ctx.recentMessages.join('\n'));
    }
    if (ctx.relevantMemories.length > 0) {
      parts.push('=== RELEVANT MEMORIES ===\n' + ctx.relevantMemories.join('\n'));
    }
    if (ctx.knowledgeNodes.length > 0) {
      parts.push('=== KNOWLEDGE ===\n' + ctx.knowledgeNodes.join('\n'));
    }
    if (ctx.taskContext) {
      parts.push('=== TASK CONTEXT ===\n' + ctx.taskContext);
    }
    return parts.join('\n\n');
  }
}
