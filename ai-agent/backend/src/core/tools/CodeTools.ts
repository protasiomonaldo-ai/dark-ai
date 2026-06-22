import { FileTools } from './FileTools';

export interface CodeAnalysis {
  language: string;
  functions: string[];
  classes: string[];
  imports: string[];
  exports: string[];
  complexity: number;
  issues: string[];
  suggestions: string[];
  lineCount: number;
  dependencies: string[];
}

export interface DiffResult {
  original: string;
  modified: string;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  startLine: number;
  lines: Array<{ type: '+' | '-' | ' '; content: string }>;
}

export class CodeTools {
  private fileTools: FileTools;

  constructor(fileTools: FileTools) {
    this.fileTools = fileTools;
  }

  analyzeCode(code: string, filePath = 'unknown'): CodeAnalysis {
    const language = this.detectLanguage(filePath, code);
    const functions = this.extractFunctions(code, language);
    const classes = this.extractClasses(code, language);
    const imports = this.extractImports(code, language);
    const exports = this.extractExports(code, language);
    const issues = this.detectIssues(code, language);
    const suggestions = this.generateSuggestions(code, issues);
    const complexity = this.calculateComplexity(code);

    return {
      language,
      functions,
      classes,
      imports,
      exports,
      complexity,
      issues,
      suggestions,
      lineCount: code.split('\n').length,
      dependencies: this.extractDependencies(imports, language),
    };
  }

  generateDiff(original: string, modified: string): DiffResult {
    const origLines = original.split('\n');
    const modLines = modified.split('\n');
    const hunks: DiffHunk[] = [];
    let additions = 0;
    let deletions = 0;

    const lcs = this.longestCommonSubsequence(origLines, modLines);
    let i = 0, j = 0, lcsIdx = 0;

    while (i < origLines.length || j < modLines.length) {
      const hunk: DiffHunk = { startLine: j + 1, lines: [] };
      let hasChanges = false;

      while (i < origLines.length && j < modLines.length) {
        if (lcsIdx < lcs.length && origLines[i] === lcs[lcsIdx] && modLines[j] === lcs[lcsIdx]) {
          hunk.lines.push({ type: ' ', content: origLines[i] });
          i++; j++; lcsIdx++;
        } else if (lcsIdx < lcs.length && modLines[j] !== lcs[lcsIdx]) {
          hunk.lines.push({ type: '+', content: modLines[j] });
          additions++; j++; hasChanges = true;
        } else {
          hunk.lines.push({ type: '-', content: origLines[i] });
          deletions++; i++; hasChanges = true;
        }
      }

      while (i < origLines.length) { hunk.lines.push({ type: '-', content: origLines[i++] }); deletions++; hasChanges = true; }
      while (j < modLines.length) { hunk.lines.push({ type: '+', content: modLines[j++] }); additions++; hasChanges = true; }

      if (hasChanges) hunks.push(hunk);
      break;
    }

    return { original, modified, additions, deletions, hunks };
  }

  formatDiff(diff: DiffResult): string {
    const lines: string[] = [`@@ -original +modified @@`];
    for (const hunk of diff.hunks) {
      for (const line of hunk.lines) {
        lines.push(`${line.type} ${line.content}`);
      }
    }
    lines.push(`\n+${diff.additions} additions, -${diff.deletions} deletions`);
    return lines.join('\n');
  }

  private detectLanguage(filePath: string, code: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
      ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
      py: 'python', go: 'go', rs: 'rust', java: 'java', cs: 'csharp',
      cpp: 'cpp', c: 'c', php: 'php', rb: 'ruby', swift: 'swift',
      kt: 'kotlin', dart: 'dart', html: 'html', css: 'css', sql: 'sql',
    };
    if (ext && map[ext]) return map[ext];
    if (code.includes('def ') && code.includes(':')) return 'python';
    if (code.includes('func ') && code.includes('{')) return 'go';
    if (code.includes('import React')) return 'typescript';
    return 'unknown';
  }

  private extractFunctions(code: string, language: string): string[] {
    const patterns: Record<string, RegExp[]> = {
      typescript: [/(?:function|async function)\s+(\w+)/g, /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/g, /(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*\{/g],
      javascript: [/(?:function|async function)\s+(\w+)/g, /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/g],
      python: [/def\s+(\w+)\s*\(/g],
      go: [/func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)\s*\(/g],
    };
    const fns: string[] = [];
    const lang = language in patterns ? language : 'typescript';
    for (const pattern of patterns[lang] || []) {
      const clone = new RegExp(pattern.source, 'g');
      let m;
      while ((m = clone.exec(code)) !== null) {
        if (m[1] && !fns.includes(m[1])) fns.push(m[1]);
      }
    }
    return fns.slice(0, 30);
  }

  private extractClasses(code: string, language: string): string[] {
    const classes: string[] = [];
    const patterns = [/class\s+(\w+)/g, /interface\s+(\w+)/g, /type\s+(\w+)\s*=/g];
    for (const p of patterns) {
      const clone = new RegExp(p.source, 'g');
      let m;
      while ((m = clone.exec(code)) !== null) {
        if (m[1] && !classes.includes(m[1])) classes.push(m[1]);
      }
    }
    return classes.slice(0, 20);
  }

  private extractImports(code: string, language: string): string[] {
    const imports: string[] = [];
    const patterns = [
      /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
      /import\s+['"]([^'"]+)['"]/g,
    ];
    for (const p of patterns) {
      const clone = new RegExp(p.source, 'g');
      let m;
      while ((m = clone.exec(code)) !== null) {
        if (m[1] && !imports.includes(m[1])) imports.push(m[1]);
      }
    }
    return imports.slice(0, 30);
  }

  private extractExports(code: string, _language: string): string[] {
    const exports: string[] = [];
    const pattern = /export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type)?\s+(\w+)/g;
    let m;
    while ((m = pattern.exec(code)) !== null) {
      if (m[1]) exports.push(m[1]);
    }
    return exports;
  }

  private extractDependencies(imports: string[], _language: string): string[] {
    return imports.filter(imp => !imp.startsWith('.') && !imp.startsWith('/'));
  }

  private detectIssues(code: string, _language: string): string[] {
    const issues: string[] = [];
    if (code.includes('any')) issues.push('Usage of "any" type detected — use specific types');
    if (/console\.(log|debug)/.test(code)) issues.push('console.log found — use proper logger');
    if (/TODO|FIXME|HACK/.test(code)) issues.push('Unresolved annotations (TODO/FIXME) found');
    if (code.split('\n').some(l => l.length > 120)) issues.push('Lines exceed 120 characters — consider splitting');
    const fns = code.match(/function[\s\S]{500,}/g);
    if (fns && fns.length > 0) issues.push('Long function detected — consider splitting');
    if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(code)) issues.push('Empty catch block detected');
    if (/==(?!=)/.test(code)) issues.push('Use === instead of == for comparison');
    return issues;
  }

  private generateSuggestions(code: string, issues: string[]): string[] {
    const suggestions: string[] = [];
    if (issues.includes('Usage of "any" type detected — use specific types')) suggestions.push('Enable TypeScript strict mode to catch type issues earlier');
    if (code.includes('async') && !code.includes('try')) suggestions.push('Add try/catch blocks around async operations');
    if (!code.includes('export')) suggestions.push('Consider what needs to be exported for reusability');
    return suggestions;
  }

  private calculateComplexity(code: string): number {
    let complexity = 1;
    const patterns = [/\bif\b/g, /\belse\b/g, /\bfor\b/g, /\bwhile\b/g, /\bcase\b/g, /\bcatch\b/g, /\b\?\s/g, /&&|\|\|/g];
    for (const p of patterns) {
      const matches = code.match(p);
      complexity += matches ? matches.length : 0;
    }
    return complexity;
  }

  private longestCommonSubsequence(a: string[], b: string[]): string[] {
    const m = Math.min(a.length, 50);
    const n = Math.min(b.length, 50);
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
    const result: string[] = [];
    let i = m, j = n;
    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) { result.unshift(a[i - 1]); i--; j--; }
      else if (dp[i - 1][j] > dp[i][j - 1]) i--;
      else j--;
    }
    return result;
  }
}
