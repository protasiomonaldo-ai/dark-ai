import { CodeTools, CodeAnalysis } from '../tools/CodeTools';
import { SecurityEngine, SecurityReport } from '../security/SecurityEngine';

export type ReviewStatus = 'APPROVED' | 'WARNING' | 'REJECTED';
export type FindingSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export interface ReviewFinding {
  category: string;
  severity: FindingSeverity;
  description: string;
  line?: number;
  suggestion: string;
}

export interface ReviewResult {
  id: string;
  status: ReviewStatus;
  score: number;
  findings: ReviewFinding[];
  securityReport: SecurityReport;
  analysis: CodeAnalysis;
  summary: string;
  approved: boolean;
}

const QUALITY_RULES: Array<{
  check: (code: string, analysis: CodeAnalysis) => boolean;
  finding: ReviewFinding;
}> = [
  {
    check: (_, a) => a.complexity > 20,
    finding: { category: 'Complexity', severity: 'WARNING', description: 'Cyclomatic complexity is very high (>20)', suggestion: 'Break down into smaller functions' },
  },
  {
    check: (_, a) => a.lineCount > 500,
    finding: { category: 'Size', severity: 'WARNING', description: 'File is very large (>500 lines)', suggestion: 'Split into multiple modules' },
  },
  {
    check: (_, a) => a.functions.length === 0 && a.classes.length === 0,
    finding: { category: 'Structure', severity: 'INFO', description: 'No functions or classes detected', suggestion: 'Consider organizing code into functions/classes' },
  },
  {
    check: (code) => /console\.(log|debug|info)/.test(code),
    finding: { category: 'Logging', severity: 'WARNING', description: 'Console logging in production code', suggestion: 'Replace with a structured logger' },
  },
  {
    check: (code) => /TODO|FIXME|HACK/.test(code),
    finding: { category: 'Quality', severity: 'INFO', description: 'Unresolved annotations found', suggestion: 'Resolve TODO/FIXME items before production' },
  },
  {
    check: (code) => /catch\s*\(\w*\)\s*\{\s*\}/.test(code),
    finding: { category: 'Error Handling', severity: 'ERROR', description: 'Empty catch block — errors silently swallowed', suggestion: 'Log or handle errors in catch blocks' },
  },
  {
    check: (code) => /==(?!=)/.test(code),
    finding: { category: 'Correctness', severity: 'WARNING', description: 'Loose equality (==) detected', suggestion: 'Use strict equality (===)' },
  },
  {
    check: (code) => /var\s+\w+/.test(code),
    finding: { category: 'Style', severity: 'INFO', description: 'var declaration found', suggestion: 'Use const or let instead of var' },
  },
  {
    check: (code) => !code.includes('async') && code.includes('callback'),
    finding: { category: 'Async', severity: 'INFO', description: 'Callback pattern detected', suggestion: 'Consider using async/await for readability' },
  },
  {
    check: (_, a) => a.imports.length > 20,
    finding: { category: 'Dependencies', severity: 'WARNING', description: 'Too many imports (>20)', suggestion: 'Reduce coupling — split into smaller modules' },
  },
];

export class CodeReviewer {
  private codeTools: CodeTools;
  private security: SecurityEngine;

  constructor(codeTools: CodeTools, security: SecurityEngine) {
    this.codeTools = codeTools;
    this.security = security;
  }

  review(code: string, filePath = 'unknown'): ReviewResult {
    const analysis = this.codeTools.analyzeCode(code, filePath);
    const securityReport = this.security.analyzeCode(code, filePath);
    const qualityFindings = this.runQualityRules(code, analysis);
    const allFindings = [
      ...qualityFindings,
      ...securityReport.findings.map(f => ({
        category: `Security: ${f.category}`,
        severity: this.mapSeverity(f.severity),
        description: f.description,
        suggestion: f.recommendation,
      })),
    ];
    const score = this.calculateScore(allFindings, securityReport);
    const status = this.determineStatus(score, securityReport);

    return {
      id: `review_${Date.now()}`,
      status,
      score,
      findings: allFindings,
      securityReport,
      analysis,
      summary: this.buildSummary(status, score, allFindings, analysis),
      approved: status !== 'REJECTED',
    };
  }

  reviewDiff(original: string, modified: string, filePath = 'unknown'): ReviewResult {
    const diffResult = this.codeTools.generateDiff(original, modified);
    const addedCode = diffResult.hunks.flatMap(h => h.lines.filter(l => l.type === '+').map(l => l.content)).join('\n');
    return this.review(addedCode, filePath);
  }

  private runQualityRules(code: string, analysis: CodeAnalysis): ReviewFinding[] {
    return QUALITY_RULES
      .filter(rule => rule.check(code, analysis))
      .map(rule => ({ ...rule.finding }));
  }

  private calculateScore(findings: ReviewFinding[], security: SecurityReport): number {
    let score = 100;
    for (const f of findings) {
      if (f.severity === 'CRITICAL') score -= 25;
      else if (f.severity === 'ERROR') score -= 15;
      else if (f.severity === 'WARNING') score -= 5;
      else score -= 1;
    }
    if (!security.canProceed) score -= 30;
    return Math.max(0, Math.min(100, score));
  }

  private determineStatus(score: number, security: SecurityReport): ReviewStatus {
    if (!security.canProceed) return 'REJECTED';
    if (score >= 70) return 'APPROVED';
    if (score >= 40) return 'WARNING';
    return 'REJECTED';
  }

  private buildSummary(status: ReviewStatus, score: number, findings: ReviewFinding[], analysis: CodeAnalysis): string {
    const errors = findings.filter(f => f.severity === 'ERROR' || f.severity === 'CRITICAL').length;
    const warnings = findings.filter(f => f.severity === 'WARNING').length;
    return [
      `Status: ${status} | Score: ${score}/100`,
      `Language: ${analysis.language} | Lines: ${analysis.lineCount} | Complexity: ${analysis.complexity}`,
      `Functions: ${analysis.functions.length} | Classes: ${analysis.classes.length}`,
      errors > 0 ? `❌ ${errors} error(s)` : '✅ No errors',
      warnings > 0 ? `⚠️  ${warnings} warning(s)` : '✅ No warnings',
    ].join('\n');
  }

  private mapSeverity(s: string): FindingSeverity {
    if (s === 'CRITICAL' || s === 'EMERGENCY') return 'CRITICAL';
    if (s === 'HIGH') return 'ERROR';
    if (s === 'MEDIUM') return 'WARNING';
    return 'INFO';
  }
}
