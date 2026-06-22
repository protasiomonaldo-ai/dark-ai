import { MemorySystem } from '../memory/MemorySystem';
import { KnowledgeGraph } from '../knowledge/KnowledgeGraph';

export type Intent =
  | 'CREATE' | 'ANALYZE' | 'FIX' | 'EXPLAIN' | 'REFACTOR'
  | 'TEST' | 'REVIEW' | 'SEARCH' | 'DEPLOY' | 'OPTIMIZE' | 'UNKNOWN';

export type Complexity = 'TRIVIAL' | 'SIMPLE' | 'MEDIUM' | 'COMPLEX' | 'VERY_COMPLEX';

export interface ReasoningResult {
  id: string;
  intent: Intent;
  goal: string;
  analysis: string;
  complexity: Complexity;
  constraints: string[];
  risks: string[];
  alternatives: string[];
  decision: string;
  confidence: number;
  requiredTools: string[];
  estimatedSteps: number;
  domainTags: string[];
}

const INTENT_PATTERNS: Record<Intent, RegExp[]> = {
  CREATE: [/crea|create|build|make|generate|scrivi|write|implementa|implement|aggiungi|add/i],
  ANALYZE: [/analizza|analyze|analisi|analysis|comprendi|understand|spiega|explain|describe|descrivi/i],
  FIX: [/fix|risolvi|correggi|correct|ripara|repair|bug|error|problema|problem|broken/i],
  EXPLAIN: [/spiega|explain|cos.è|what is|come funziona|how does|perché|why|meaning|significato/i],
  REFACTOR: [/refactor|rifattorizza|migliora|improve|ottimizza|optimize|clean|pulisci|ristruttura/i],
  TEST: [/test|testa|verifica|verify|check|controlla|unit test|integration/i],
  REVIEW: [/review|revisiona|rivedi|controlla|check|quality|qualità|valuta/i],
  SEARCH: [/cerca|search|find|trova|look for|dove|where|quale|which/i],
  DEPLOY: [/deploy|rilascia|release|pubblica|publish|production|prod/i],
  OPTIMIZE: [/ottimizza|optimize|performance|velocizza|speed|faster|lighter/i],
  UNKNOWN: [],
};

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  frontend: ['react', 'vue', 'angular', 'html', 'css', 'ui', 'component', 'frontend', 'client'],
  backend: ['api', 'server', 'express', 'fastapi', 'backend', 'route', 'endpoint', 'rest'],
  database: ['database', 'db', 'sql', 'postgres', 'mysql', 'mongodb', 'query', 'schema', 'migration'],
  auth: ['auth', 'login', 'jwt', 'session', 'password', 'oauth', 'token', 'permission'],
  devops: ['docker', 'deploy', 'ci/cd', 'kubernetes', 'nginx', 'railway', 'vercel'],
  testing: ['test', 'jest', 'vitest', 'cypress', 'unit', 'integration', 'e2e'],
};

export class ReasoningEngine {
  private memory: MemorySystem;
  private knowledge: KnowledgeGraph;

  constructor(memory: MemorySystem, knowledge: KnowledgeGraph) {
    this.memory = memory;
    this.knowledge = knowledge;
  }

  async reason(input: string): Promise<ReasoningResult> {
    const intent = this.detectIntent(input);
    const complexity = this.estimateComplexity(input);
    const domains = this.detectDomains(input);
    const constraints = this.extractConstraints(input);
    const risks = this.assessRisks(intent, complexity, domains);
    const requiredTools = this.selectTools(intent, domains);
    const alternatives = this.generateAlternatives(intent, input);
    const pastMemory = await this.memory.recall(input);
    const memoryContext = pastMemory.slice(0, 3).map(m => {
      const e = m.entry as Record<string, unknown>;
      return String(e['content'] || '');
    }).join(' ');

    const analysis = this.buildAnalysis(intent, complexity, domains, memoryContext);
    const decision = this.makeDecision(intent, complexity, risks, alternatives);
    const confidence = this.calculateConfidence(intent, complexity, constraints);
    const estimatedSteps = this.estimateSteps(complexity, intent);

    return {
      id: `reason_${Date.now()}`,
      intent,
      goal: input,
      analysis,
      complexity,
      constraints,
      risks,
      alternatives,
      decision,
      confidence,
      requiredTools,
      estimatedSteps,
      domainTags: domains,
    };
  }

  private detectIntent(input: string): Intent {
    for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
      if (intent === 'UNKNOWN') continue;
      if (patterns.some(p => p.test(input))) return intent as Intent;
    }
    return 'UNKNOWN';
  }

  private estimateComplexity(input: string): Complexity {
    const words = input.split(/\s+/).length;
    const hasMultiple = /e|and|anche|plus|inoltre|with|con/.test(input);
    const hasArchitectural = /sistema|system|platform|architecture|architettura|microservice|full.stack/i.test(input);
    const hasTrivial = /^(ciao|hello|hi|ok|grazie|thanks)$/i.test(input.trim());

    if (hasTrivial || words < 5) return 'TRIVIAL';
    if (hasArchitectural) return 'VERY_COMPLEX';
    if (hasMultiple && words > 20) return 'COMPLEX';
    if (words > 10 || hasMultiple) return 'MEDIUM';
    return 'SIMPLE';
  }

  private detectDomains(input: string): string[] {
    const found: string[] = [];
    const lower = input.toLowerCase();
    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
      if (keywords.some(k => lower.includes(k))) found.push(domain);
    }
    return found.length > 0 ? found : ['general'];
  }

  private extractConstraints(input: string): string[] {
    const constraints: string[] = [];
    if (/typescript|ts\b/i.test(input)) constraints.push('Use TypeScript');
    if (/javascript|js\b/i.test(input)) constraints.push('Use JavaScript');
    if (/python/i.test(input)) constraints.push('Use Python');
    if (/senza|without|no\s+/i.test(input)) constraints.push('Has exclusion constraints');
    if (/sicuro|secure|security/i.test(input)) constraints.push('Security required');
    if (/veloce|fast|performance/i.test(input)) constraints.push('Performance critical');
    return constraints;
  }

  private assessRisks(intent: Intent, complexity: Complexity, domains: string[]): string[] {
    const risks: string[] = [];
    if (['VERY_COMPLEX', 'COMPLEX'].includes(complexity)) risks.push('High complexity — may require multiple iterations');
    if (intent === 'FIX') risks.push('Fix may introduce regressions — run tests after');
    if (domains.includes('auth')) risks.push('Authentication changes — security validation required');
    if (domains.includes('database')) risks.push('Database changes — backup recommended');
    if (intent === 'REFACTOR') risks.push('Refactor may break existing interfaces');
    return risks;
  }

  private selectTools(intent: Intent, domains: string[]): string[] {
    const base: string[] = ['read_file', 'write_file'];
    if (intent === 'ANALYZE' || intent === 'REVIEW') base.push('analyze_code', 'scan_repository');
    if (intent === 'CREATE' || intent === 'FIX') base.push('write_file', 'create_file');
    if (intent === 'TEST') base.push('generate_tests', 'run_tests');
    if (intent === 'SEARCH') base.push('search_files', 'grep_code');
    if (domains.includes('database')) base.push('analyze_schema');
    if (domains.includes('devops')) base.push('read_config');
    return [...new Set(base)];
  }

  private generateAlternatives(intent: Intent, input: string): string[] {
    const map: Partial<Record<Intent, string[]>> = {
      CREATE: ['Build incrementally with tests', 'Start with interface, then implement', 'Copy existing pattern and adapt'],
      FIX: ['Isolate bug first', 'Write failing test first', 'Check recent changes'],
      REFACTOR: ['Refactor one module at a time', 'Extract interface first', 'Write tests before refactoring'],
      ANALYZE: ['Start from entry point', 'Follow dependency graph', 'Read documentation first'],
    };
    return map[intent] ?? ['Proceed step by step', 'Validate each step before next'];
  }

  private buildAnalysis(intent: Intent, complexity: Complexity, domains: string[], memCtx: string): string {
    const parts = [
      `Intent detected: ${intent}`,
      `Complexity: ${complexity}`,
      `Domains: ${domains.join(', ')}`,
    ];
    if (memCtx) parts.push(`Relevant past context: ${memCtx.slice(0, 200)}`);
    return parts.join(' | ');
  }

  private makeDecision(intent: Intent, complexity: Complexity, risks: string[], alternatives: string[]): string {
    const riskCount = risks.length;
    if (riskCount === 0) return `Proceed with ${intent.toLowerCase()} — no significant risks`;
    if (riskCount === 1) return `Proceed with caution: ${risks[0]}`;
    return `High caution required. Primary approach: ${alternatives[0] || 'Step by step execution'}`;
  }

  private calculateConfidence(intent: Intent, complexity: Complexity, constraints: string[]): number {
    let conf = 0.9;
    if (intent === 'UNKNOWN') conf -= 0.3;
    if (complexity === 'VERY_COMPLEX') conf -= 0.2;
    if (complexity === 'COMPLEX') conf -= 0.1;
    conf -= constraints.length * 0.02;
    return Math.max(0.1, Math.min(1.0, conf));
  }

  private estimateSteps(complexity: Complexity, intent: Intent): number {
    const base: Record<Complexity, number> = {
      TRIVIAL: 1, SIMPLE: 2, MEDIUM: 4, COMPLEX: 7, VERY_COMPLEX: 12,
    };
    return base[complexity] + (intent === 'CREATE' ? 2 : 0);
  }
}
