import { FileTools, FileResult, FileInfo } from './FileTools';
import { CodeTools, CodeAnalysis, DiffResult } from './CodeTools';
import { SecurityEngine } from '../security/SecurityEngine';

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  tool: string;
  success: boolean;
  data?: unknown;
  error?: string;
  executedAt: number;
}

export type ToolName =
  | 'read_file' | 'write_file' | 'create_file' | 'delete_file' | 'list_files'
  | 'search_files' | 'grep_code' | 'analyze_code' | 'generate_diff'
  | 'scan_repository' | 'generate_tests';

export class ToolCalling {
  private fileTools: FileTools;
  private codeTools: CodeTools;
  private security: SecurityEngine;
  private callHistory: ToolResult[] = [];

  constructor(workspaceRoot = process.cwd()) {
    this.fileTools = new FileTools(workspaceRoot);
    this.codeTools = new CodeTools(this.fileTools);
    this.security = new SecurityEngine();
  }

  async call(toolName: string, args: Record<string, unknown>, role = 'USER'): Promise<ToolResult> {
    const permitted = this.security.checkPermission(toolName, role);
    if (!permitted) {
      return { tool: toolName, success: false, error: `Permission denied: ${role} cannot use ${toolName}`, executedAt: Date.now() };
    }

    let result: ToolResult;
    try {
      result = await this.dispatch(toolName as ToolName, args);
    } catch (e) {
      result = { tool: toolName, success: false, error: String(e), executedAt: Date.now() };
    }

    this.callHistory.push(result);
    if (this.callHistory.length > 200) this.callHistory = this.callHistory.slice(-200);
    return result;
  }

  private async dispatch(name: ToolName, args: Record<string, unknown>): Promise<ToolResult> {
    const now = Date.now();
    switch (name) {
      case 'read_file': {
        const r = this.fileTools.readFile(args['path'] as string);
        return { tool: name, success: r.success, data: r, error: r.error, executedAt: now };
      }
      case 'write_file': {
        const secReport = this.security.analyzeCode(args['content'] as string, args['path'] as string);
        if (!secReport.canProceed) return { tool: name, success: false, error: `Security block: ${secReport.message}`, executedAt: now };
        const r = this.fileTools.writeFile(args['path'] as string, args['content'] as string);
        return { tool: name, success: r.success, data: r, error: r.error, executedAt: now };
      }
      case 'create_file': {
        const r = this.fileTools.createFile(args['path'] as string, (args['content'] as string) || '');
        return { tool: name, success: r.success, data: r, error: r.error, executedAt: now };
      }
      case 'delete_file': {
        const r = this.fileTools.deleteFile(args['path'] as string);
        return { tool: name, success: r.success, data: r, error: r.error, executedAt: now };
      }
      case 'list_files': {
        const files: FileInfo[] = this.fileTools.listFiles((args['path'] as string) || '.');
        return { tool: name, success: true, data: files, executedAt: now };
      }
      case 'search_files': {
        const files = this.fileTools.searchFiles(args['query'] as string, (args['path'] as string) || '.');
        return { tool: name, success: true, data: files, executedAt: now };
      }
      case 'grep_code': {
        const results = this.fileTools.grepContent(args['pattern'] as string, (args['path'] as string) || '.');
        return { tool: name, success: true, data: results, executedAt: now };
      }
      case 'analyze_code': {
        let code = args['code'] as string;
        if (!code && args['path']) {
          const r = this.fileTools.readFile(args['path'] as string);
          code = r.content || '';
        }
        const analysis: CodeAnalysis = this.codeTools.analyzeCode(code, (args['path'] as string) || 'unknown');
        return { tool: name, success: true, data: analysis, executedAt: now };
      }
      case 'generate_diff': {
        const diff: DiffResult = this.codeTools.generateDiff(args['original'] as string, args['modified'] as string);
        return { tool: name, success: true, data: { diff, formatted: this.codeTools.formatDiff(diff) }, executedAt: now };
      }
      case 'scan_repository': {
        const files = this.fileTools.listFiles((args['path'] as string) || '.');
        const summary = {
          totalFiles: files.length,
          directories: files.filter(f => f.isDirectory).length,
          sourceFiles: files.filter(f => !f.isDirectory).length,
          languages: [...new Set(files.map(f => f.extension).filter(Boolean))],
          files: files.slice(0, 100),
        };
        return { tool: name, success: true, data: summary, executedAt: now };
      }
      case 'generate_tests': {
        const code = args['code'] as string;
        const analysis = this.codeTools.analyzeCode(code);
        const tests = this.generateTestsFromAnalysis(code, analysis);
        return { tool: name, success: true, data: { tests }, executedAt: now };
      }
      default:
        return { tool: name, success: false, error: `Unknown tool: ${name}`, executedAt: now };
    }
  }

  private generateTestsFromAnalysis(code: string, analysis: CodeAnalysis): string {
    const lines: string[] = [`import { describe, it, expect } from 'vitest';`, ''];
    for (const fn of analysis.functions.slice(0, 5)) {
      lines.push(
        `describe('${fn}', () => {`,
        `  it('should work correctly', () => {`,
        `    // TODO: implement test for ${fn}`,
        `    expect(true).toBe(true);`,
        `  });`,
        ``,
        `  it('should handle edge cases', () => {`,
        `    // TODO: test edge cases for ${fn}`,
        `    expect(true).toBe(true);`,
        `  });`,
        `});`,
        '',
      );
    }
    return lines.join('\n');
  }

  getHistory(): ToolResult[] {
    return [...this.callHistory];
  }

  getAvailableTools(): string[] {
    return ['read_file', 'write_file', 'create_file', 'delete_file', 'list_files', 'search_files', 'grep_code', 'analyze_code', 'generate_diff', 'scan_repository', 'generate_tests'];
  }
}
