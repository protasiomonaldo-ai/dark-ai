import { ReasoningResult } from '../reasoning/ReasoningEngine';
import { SecurityReport } from '../security/SecurityEngine';

export type DecisionType = 'STRATEGIC' | 'TACTICAL' | 'OPERATIONAL' | 'SECURITY' | 'RECOVERY';

export interface Option {
  id: string;
  description: string;
  score: number;
  risk: number;
  effort: number;
  benefit: number;
}

export interface Decision {
  id: string;
  type: DecisionType;
  goal: string;
  options: Option[];
  chosen: Option;
  reason: string;
  confidence: number;
  riskScore: number;
  approved: boolean;
  timestamp: number;
}

export class DecisionEngine {
  decide(reasoning: ReasoningResult, securityReport?: SecurityReport): Decision {
    if (securityReport && !securityReport.canProceed) {
      return this.blockDecision(reasoning, securityReport.message);
    }

    const options = this.generateOptions(reasoning);
    const chosen = this.selectBestOption(options, reasoning);
    const type = this.classifyDecision(reasoning);

    return {
      id: `decision_${Date.now()}`,
      type,
      goal: reasoning.goal,
      options,
      chosen,
      reason: this.buildReason(chosen, reasoning),
      confidence: reasoning.confidence * chosen.score,
      riskScore: chosen.risk,
      approved: chosen.risk < 8,
      timestamp: Date.now(),
    };
  }

  decideOnError(error: string, context: string): Decision {
    const recoveryOptions: Option[] = [
      { id: 'retry', description: 'Retry the failed operation', score: 0.7, risk: 2, effort: 1, benefit: 7 },
      { id: 'fallback', description: 'Use fallback approach', score: 0.8, risk: 1, effort: 3, benefit: 6 },
      { id: 'skip', description: 'Skip this step and continue', score: 0.5, risk: 4, effort: 0, benefit: 3 },
      { id: 'abort', description: 'Abort and report failure', score: 0.3, risk: 0, effort: 0, benefit: 0 },
    ];
    const chosen = recoveryOptions[0];
    return {
      id: `decision_recovery_${Date.now()}`,
      type: 'RECOVERY',
      goal: `Recover from: ${error}`,
      options: recoveryOptions,
      chosen,
      reason: `Error encountered in ${context}. Attempting retry first.`,
      confidence: 0.6,
      riskScore: chosen.risk,
      approved: true,
      timestamp: Date.now(),
    };
  }

  private generateOptions(reasoning: ReasoningResult): Option[] {
    const base: Option[] = [
      {
        id: 'direct',
        description: `Execute ${reasoning.intent} directly`,
        score: 0.9,
        risk: reasoning.risks.length,
        effort: this.complexityToEffort(reasoning.complexity as string),
        benefit: 9,
      },
    ];
    for (let i = 0; i < reasoning.alternatives.length; i++) {
      base.push({
        id: `alt_${i}`,
        description: reasoning.alternatives[i],
        score: 0.7 - i * 0.1,
        risk: Math.max(0, reasoning.risks.length - 1),
        effort: this.complexityToEffort(reasoning.complexity as string) + 1,
        benefit: 7 - i,
      });
    }
    return base;
  }

  private selectBestOption(options: Option[], reasoning: ReasoningResult): Option {
    return options.reduce((best, opt) => {
      const scoreA = opt.benefit / (opt.risk + 1) * opt.score;
      const scoreB = best.benefit / (best.risk + 1) * best.score;
      return scoreA > scoreB ? opt : best;
    });
  }

  private classifyDecision(reasoning: ReasoningResult): DecisionType {
    if (['VERY_COMPLEX', 'COMPLEX'].includes(reasoning.complexity)) return 'STRATEGIC';
    if (reasoning.intent === 'CREATE' || reasoning.intent === 'REFACTOR') return 'TACTICAL';
    if (reasoning.domainTags.includes('auth') || reasoning.domainTags.includes('security')) return 'SECURITY';
    return 'OPERATIONAL';
  }

  private buildReason(chosen: Option, reasoning: ReasoningResult): string {
    return `Selected "${chosen.description}" — benefit/risk ratio: ${(chosen.benefit / (chosen.risk + 1)).toFixed(2)}, confidence: ${reasoning.confidence.toFixed(2)}`;
  }

  private blockDecision(reasoning: ReasoningResult, reason: string): Decision {
    const blockOption: Option = { id: 'blocked', description: 'Blocked by security engine', score: 0, risk: 10, effort: 0, benefit: 0 };
    return {
      id: `decision_blocked_${Date.now()}`,
      type: 'SECURITY',
      goal: reasoning.goal,
      options: [blockOption],
      chosen: blockOption,
      reason,
      confidence: 1.0,
      riskScore: 10,
      approved: false,
      timestamp: Date.now(),
    };
  }

  private complexityToEffort(complexity: string): number {
    const map: Record<string, number> = { TRIVIAL: 1, SIMPLE: 2, MEDIUM: 4, COMPLEX: 7, VERY_COMPLEX: 10 };
    return map[complexity] ?? 3;
  }
}
