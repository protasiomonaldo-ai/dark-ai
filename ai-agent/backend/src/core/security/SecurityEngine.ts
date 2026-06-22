export type ThreatLevel = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'EMERGENCY';

export interface SecurityFinding {
  id: string;
  category: string;
  description: string;
  severity: ThreatLevel;
  recommendation: string;
  affectedComponent: string;
  riskScore: number;
}

export interface SecurityReport {
  id: string;
  status: 'APPROVED' | 'WARNING' | 'BLOCKED';
  findings: SecurityFinding[];
  overallRisk: ThreatLevel;
  canProceed: boolean;
  message: string;
}

const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; category: string; severity: ThreatLevel; description: string; recommendation: string }> = [
  { pattern: /process\.exit|process\.kill/g, category: 'System', severity: 'HIGH', description: 'Process termination code detected', recommendation: 'Use graceful shutdown instead' },
  { pattern: /eval\s*\(/g, category: 'Code Injection', severity: 'CRITICAL', description: 'eval() usage detected — remote code execution risk', recommendation: 'Remove eval, use safe alternatives' },
  { pattern: /new Function\s*\(/g, category: 'Code Injection', severity: 'CRITICAL', description: 'Dynamic Function constructor — code injection risk', recommendation: 'Avoid dynamic code execution' },
  { pattern: /child_process|exec\s*\(|spawn\s*\(/g, category: 'Command Injection', severity: 'HIGH', description: 'Shell execution detected', recommendation: 'Sanitize all inputs to shell commands' },
  { pattern: /password\s*=\s*['"][^'"]{0,20}['"]/gi, category: 'Secrets', severity: 'CRITICAL', description: 'Hardcoded password detected', recommendation: 'Use environment variables for secrets' },
  { pattern: /api[_\s]?key\s*=\s*['"][^'"]+['"]/gi, category: 'Secrets', severity: 'CRITICAL', description: 'Hardcoded API key detected', recommendation: 'Move to environment variables' },
  { pattern: /secret\s*=\s*['"][^'"]+['"]/gi, category: 'Secrets', severity: 'HIGH', description: 'Hardcoded secret value detected', recommendation: 'Use environment variables' },
  { pattern: /md5\s*\(/gi, category: 'Cryptography', severity: 'MEDIUM', description: 'MD5 is cryptographically broken', recommendation: 'Use SHA-256 or bcrypt' },
  { pattern: /Math\.random\(\)/g, category: 'Cryptography', severity: 'LOW', description: 'Math.random() is not cryptographically secure', recommendation: 'Use crypto.randomBytes()' },
  { pattern: /\$\{.*req\.(params|query|body)/g, category: 'Injection', severity: 'HIGH', description: 'Unsanitized user input in template', recommendation: 'Sanitize all user inputs before use' },
  { pattern: /innerHTML\s*=/g, category: 'XSS', severity: 'HIGH', description: 'innerHTML assignment — XSS risk', recommendation: 'Use textContent or DOMPurify' },
  { pattern: /document\.write\s*\(/g, category: 'XSS', severity: 'HIGH', description: 'document.write() — XSS risk', recommendation: 'Use DOM manipulation methods' },
  { pattern: /http:\/\/(?!localhost)/g, category: 'Transport Security', severity: 'MEDIUM', description: 'HTTP (non-HTTPS) URL detected', recommendation: 'Use HTTPS for all external connections' },
  { pattern: /console\.(log|info|debug)/g, category: 'Information Leakage', severity: 'INFO', description: 'Console logging in production code', recommendation: 'Use a logger with log levels' },
  { pattern: /TODO|FIXME|HACK|XXX/g, category: 'Code Quality', severity: 'INFO', description: 'Unresolved code annotations found', recommendation: 'Resolve before production deployment' },
];

const PERMISSION_RULES: Record<string, string[]> = {
  'delete_file': ['ADMIN', 'SYSTEM'],
  'execute_command': ['ADMIN', 'SYSTEM'],
  'read_file': ['USER', 'ADMIN', 'SYSTEM'],
  'write_file': ['USER', 'ADMIN', 'SYSTEM'],
  'search_files': ['USER', 'ADMIN', 'SYSTEM'],
  'analyze_code': ['USER', 'ADMIN', 'SYSTEM'],
  'generate_tests': ['USER', 'ADMIN', 'SYSTEM'],
  'scan_repository': ['USER', 'ADMIN', 'SYSTEM'],
};

export class SecurityEngine {
  analyzeCode(code: string, component = 'unknown'): SecurityReport {
    const findings: SecurityFinding[] = [];

    for (const rule of DANGEROUS_PATTERNS) {
      const matches = code.match(rule.pattern);
      if (matches && matches.length > 0) {
        findings.push({
          id: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          category: rule.category,
          description: `${rule.description} (${matches.length} occurrence${matches.length > 1 ? 's' : ''})`,
          severity: rule.severity,
          recommendation: rule.recommendation,
          affectedComponent: component,
          riskScore: this.severityToScore(rule.severity),
        });
      }
    }

    return this.buildReport(findings, component);
  }

  analyzeInput(input: string): SecurityReport {
    const findings: SecurityFinding[] = [];
    const sqlInjectionPatterns = /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER)\b.*\b(FROM|INTO|WHERE|TABLE)\b)/gi;
    const xssPatterns = /<script|javascript:|on\w+\s*=/gi;
    const pathTraversal = /\.\.[\/\\]/g;

    if (sqlInjectionPatterns.test(input)) {
      findings.push({
        id: `sec_input_${Date.now()}`,
        category: 'SQL Injection',
        severity: 'CRITICAL',
        description: 'Potential SQL injection in input',
        recommendation: 'Use parameterized queries',
        affectedComponent: 'user_input',
        riskScore: 10,
      });
    }
    if (xssPatterns.test(input)) {
      findings.push({
        id: `sec_xss_${Date.now()}`,
        category: 'XSS',
        severity: 'HIGH',
        description: 'Potential XSS payload in input',
        recommendation: 'Sanitize HTML output',
        affectedComponent: 'user_input',
        riskScore: 8,
      });
    }
    if (pathTraversal.test(input)) {
      findings.push({
        id: `sec_path_${Date.now()}`,
        category: 'Path Traversal',
        severity: 'HIGH',
        description: 'Path traversal attempt detected',
        recommendation: 'Validate and restrict file paths',
        affectedComponent: 'user_input',
        riskScore: 8,
      });
    }
    return this.buildReport(findings, 'user_input');
  }

  checkPermission(tool: string, role = 'USER'): boolean {
    const allowed = PERMISSION_RULES[tool] || ['USER', 'ADMIN', 'SYSTEM'];
    return allowed.includes(role);
  }

  private buildReport(findings: SecurityFinding[], component: string): SecurityReport {
    const critical = findings.filter(f => ['CRITICAL', 'EMERGENCY'].includes(f.severity));
    const high = findings.filter(f => f.severity === 'HIGH');
    const overallRisk = critical.length > 0 ? 'CRITICAL' : high.length > 0 ? 'HIGH' : findings.length > 0 ? 'MEDIUM' : 'INFO';
    const canProceed = critical.length === 0;
    const status = critical.length > 0 ? 'BLOCKED' : high.length > 0 ? 'WARNING' : 'APPROVED';

    return {
      id: `report_${Date.now()}`,
      status,
      findings,
      overallRisk,
      canProceed,
      message: canProceed
        ? (findings.length > 0 ? `${findings.length} issue(s) found — proceed with caution` : 'No security issues detected')
        : `BLOCKED: ${critical.length} critical issue(s) require resolution`,
    };
  }

  private severityToScore(severity: ThreatLevel): number {
    const map: Record<ThreatLevel, number> = {
      INFO: 1, LOW: 3, MEDIUM: 5, HIGH: 8, CRITICAL: 10, EMERGENCY: 10,
    };
    return map[severity];
  }
}
