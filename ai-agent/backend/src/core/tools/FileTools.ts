import fs from 'fs';
import path from 'path';

export interface FileResult {
  success: boolean;
  content?: string;
  error?: string;
  path?: string;
  size?: number;
  lines?: number;
}

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  extension: string;
  lastModified: Date;
}

const SAFE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.txt', '.yaml', '.yml',
  '.env.example', '.html', '.css', '.scss', '.sql', '.py', '.go', '.rs',
  '.java', '.c', '.cpp', '.h', '.sh', '.dockerfile', '.toml', '.xml',
]);

const BLOCKED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.cache']);

export class FileTools {
  private workspaceRoot: string;

  constructor(workspaceRoot = process.cwd()) {
    this.workspaceRoot = workspaceRoot;
  }

  readFile(filePath: string): FileResult {
    try {
      const resolved = this.resolveSafe(filePath);
      if (!resolved) return { success: false, error: 'Path not allowed (outside workspace or unsafe)' };
      if (!fs.existsSync(resolved)) return { success: false, error: `File not found: ${filePath}` };
      const stat = fs.statSync(resolved);
      if (stat.size > 1024 * 512) return { success: false, error: 'File too large (max 512KB)' };
      const content = fs.readFileSync(resolved, 'utf-8');
      return { success: true, content, path: resolved, size: stat.size, lines: content.split('\n').length };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  writeFile(filePath: string, content: string): FileResult {
    try {
      const resolved = this.resolveSafe(filePath);
      if (!resolved) return { success: false, error: 'Path not allowed' };
      const dir = path.dirname(resolved);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(resolved, content, 'utf-8');
      return { success: true, path: resolved, size: Buffer.byteLength(content), lines: content.split('\n').length };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  createFile(filePath: string, content = ''): FileResult {
    const resolved = this.resolveSafe(filePath);
    if (!resolved) return { success: false, error: 'Path not allowed' };
    if (fs.existsSync(resolved)) return { success: false, error: 'File already exists' };
    return this.writeFile(filePath, content);
  }

  deleteFile(filePath: string): FileResult {
    try {
      const resolved = this.resolveSafe(filePath);
      if (!resolved) return { success: false, error: 'Path not allowed' };
      if (!fs.existsSync(resolved)) return { success: false, error: 'File not found' };
      fs.unlinkSync(resolved);
      return { success: true, path: resolved };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  listFiles(dirPath = '.'): FileInfo[] {
    try {
      const resolved = this.resolveSafe(dirPath);
      if (!resolved) return [];
      const entries = fs.readdirSync(resolved, { withFileTypes: true });
      return entries
        .filter(e => !BLOCKED_DIRS.has(e.name) && !e.name.startsWith('.'))
        .map(e => {
          const fullPath = path.join(resolved, e.name);
          const stat = fs.statSync(fullPath);
          return {
            name: e.name,
            path: fullPath,
            size: e.isDirectory() ? 0 : stat.size,
            isDirectory: e.isDirectory(),
            extension: path.extname(e.name),
            lastModified: stat.mtime,
          };
        });
    } catch {
      return [];
    }
  }

  searchFiles(query: string, dirPath = '.', extensions?: string[]): FileInfo[] {
    const allFiles = this.walkDir(dirPath);
    const q = query.toLowerCase();
    return allFiles.filter(f => {
      if (extensions && !extensions.includes(f.extension)) return false;
      return f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q);
    });
  }

  grepContent(pattern: string, dirPath = '.'): Array<{ file: string; line: number; content: string }> {
    const results: Array<{ file: string; line: number; content: string }> = [];
    const files = this.walkDir(dirPath).filter(f => !f.isDirectory && SAFE_EXTENSIONS.has(f.extension));
    const regex = new RegExp(pattern, 'gi');

    for (const file of files.slice(0, 50)) {
      try {
        const content = fs.readFileSync(file.path, 'utf-8');
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          if (regex.test(line)) {
            results.push({ file: file.path, line: idx + 1, content: line.trim() });
          }
          regex.lastIndex = 0;
        });
      } catch { /* skip unreadable */ }
      if (results.length > 100) break;
    }
    return results;
  }

  private walkDir(dirPath: string): FileInfo[] {
    const result: FileInfo[] = [];
    const resolved = this.resolveSafe(dirPath);
    if (!resolved) return result;

    const walk = (dir: string, depth: number) => {
      if (depth > 5) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (BLOCKED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
          const fullPath = path.join(dir, entry.name);
          const stat = fs.statSync(fullPath);
          result.push({ name: entry.name, path: fullPath, size: entry.isDirectory() ? 0 : stat.size, isDirectory: entry.isDirectory(), extension: path.extname(entry.name), lastModified: stat.mtime });
          if (entry.isDirectory()) walk(fullPath, depth + 1);
        }
      } catch { /* skip */ }
    };

    walk(resolved, 0);
    return result;
  }

  private resolveSafe(filePath: string): string | null {
    const resolved = path.resolve(this.workspaceRoot, filePath);
    if (!resolved.startsWith(this.workspaceRoot)) return null;
    const parts = resolved.split(path.sep);
    if (parts.some(p => BLOCKED_DIRS.has(p))) return null;
    return resolved;
  }
}
