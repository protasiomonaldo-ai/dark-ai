import { FileTools } from '../tools/FileTools';
import { CodeTools, CodeAnalysis } from '../tools/CodeTools';

export interface RepositoryMap {
  id: string;
  name: string;
  rootPath: string;
  type: string;
  language: string;
  frameworks: string[];
  totalFiles: number;
  totalLines: number;
  structure: DirectoryNode;
  dependencies: string[];
  entryPoints: string[];
  configFiles: string[];
  analyzedAt: Date;
}

export interface DirectoryNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: DirectoryNode[];
  analysis?: CodeAnalysis;
}

const FRAMEWORK_SIGNALS: Record<string, string[]> = {
  react: ['react', 'react-dom', 'jsx', 'tsx', 'useState', 'useEffect'],
  nextjs: ['next', 'next/app', 'next/router', 'pages/', 'app/'],
  vue: ['vue', '@vue/core', '.vue'],
  express: ['express', 'Router()', 'app.get(', 'app.post('],
  fastapi: ['fastapi', 'APIRouter', '@app.get'],
  django: ['django', 'settings.py', 'urls.py', 'views.py'],
  nestjs: ['@nestjs', '@Controller', '@Injectable', '@Module'],
  drizzle: ['drizzle-orm', 'drizzle-kit'],
  prisma: ['prisma', '@prisma/client'],
};

const PROJECT_TYPE_SIGNALS: Record<string, RegExp[]> = {
  'Web Application': [/react|vue|angular|svelte/i],
  'API Server': [/express|fastapi|nestjs|koa|hono/i],
  'CLI Tool': [/commander|yargs|chalk.*bin|bin.*cli/i],
  'Library': [/^lib\/|^src\/index\./i],
  'Discord Bot': [/discord\.js|discord-api/i],
  'Telegram Bot': [/telegraf|node-telegram/i],
  'Mobile App': [/expo|react-native|@capacitor/i],
  'Desktop App': [/electron|tauri/i],
};

export class RepositoryAnalyzer {
  private fileTools: FileTools;
  private codeTools: CodeTools;

  constructor(fileTools: FileTools, codeTools: CodeTools) {
    this.fileTools = fileTools;
    this.codeTools = codeTools;
  }

  async analyze(rootPath = '.'): Promise<RepositoryMap> {
    const files = this.fileTools.listFiles(rootPath);
    const allFiles = this.walkDirectory(rootPath);
    const configFiles = this.findConfigFiles(allFiles);
    const packageJson = this.readPackageJson(rootPath);
    const language = this.detectPrimaryLanguage(allFiles);
    const frameworks = this.detectFrameworks(allFiles, packageJson);
    const type = this.detectProjectType(frameworks, packageJson);
    const deps = packageJson ? { ...(packageJson['dependencies'] as Record<string, unknown> || {}), ...(packageJson['devDependencies'] as Record<string, unknown> || {}) } : {};
    const dependencies = Object.keys(deps);
    const entryPoints = this.findEntryPoints(allFiles);
    const structure = this.buildStructure(rootPath, files, 0);
    let totalLines = 0;
    for (const f of allFiles.filter(f => !f.isDir && f.ext && ['.ts', '.tsx', '.js', '.jsx', '.py', '.go'].includes(f.ext)).slice(0, 100)) {
      const result = this.fileTools.readFile(f.path);
      if (result.success && result.lines) totalLines += result.lines;
    }

    return {
      id: `repo_${Date.now()}`,
      name: rootPath.split('/').pop() || 'unknown',
      rootPath,
      type,
      language,
      frameworks,
      totalFiles: allFiles.filter(f => !f.isDir).length,
      totalLines,
      structure,
      dependencies,
      entryPoints,
      configFiles,
      analyzedAt: new Date(),
    };
  }

  private walkDirectory(dir: string, depth = 0): Array<{ name: string; path: string; ext: string; isDir: boolean }> {
    const result: Array<{ name: string; path: string; ext: string; isDir: boolean }> = [];
    if (depth > 4) return result;
    const files = this.fileTools.listFiles(dir);
    for (const f of files) {
      result.push({ name: f.name, path: f.path, ext: f.extension, isDir: f.isDirectory });
      if (f.isDirectory) result.push(...this.walkDirectory(f.path, depth + 1));
    }
    return result;
  }

  private buildStructure(path: string, files: ReturnType<FileTools['listFiles']>, depth: number): DirectoryNode {
    const name = path.split('/').pop() || path;
    const node: DirectoryNode = { name, path, isDirectory: true, children: [] };
    if (depth > 3) return node;
    for (const f of files.slice(0, 50)) {
      if (f.isDirectory) {
        const childFiles = this.fileTools.listFiles(f.path);
        node.children.push(this.buildStructure(f.path, childFiles, depth + 1));
      } else {
        node.children.push({ name: f.name, path: f.path, isDirectory: false, children: [] });
      }
    }
    return node;
  }

  private detectPrimaryLanguage(files: Array<{ ext: string; isDir: boolean }>): string {
    const counts: Record<string, number> = {};
    for (const f of files.filter(f => !f.isDir)) {
      const ext = f.ext.replace('.', '');
      counts[ext] = (counts[ext] || 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const top = sorted[0]?.[0] || 'unknown';
    const langMap: Record<string, string> = { ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript', py: 'Python', go: 'Go', rs: 'Rust', java: 'Java' };
    return langMap[top] || top;
  }

  private detectFrameworks(files: Array<{ name: string; path: string }>, pkg: Record<string, unknown> | null): string[] {
    const found: string[] = [];
    const allContent = files.map(f => f.path + f.name).join(' ');
    const deps = JSON.stringify(pkg || {}).toLowerCase();
    for (const [framework, signals] of Object.entries(FRAMEWORK_SIGNALS)) {
      if (signals.some(s => allContent.includes(s) || deps.includes(s.toLowerCase()))) {
        found.push(framework);
      }
    }
    return found;
  }

  private detectProjectType(frameworks: string[], pkg: Record<string, unknown> | null): string {
    for (const [type, signals] of Object.entries(PROJECT_TYPE_SIGNALS)) {
      if (signals.some(s => frameworks.some(f => s.test(f)) || s.test(JSON.stringify(pkg || '')))) return type;
    }
    return 'Software Project';
  }

  private readPackageJson(rootPath: string): Record<string, unknown> | null {
    const result = this.fileTools.readFile(`${rootPath}/package.json`);
    if (result.success && result.content) {
      try { return JSON.parse(result.content); } catch { return null; }
    }
    return null;
  }

  private findConfigFiles(files: Array<{ name: string; path: string }>): string[] {
    const configNames = new Set(['package.json', 'tsconfig.json', '.env', 'Dockerfile', 'docker-compose.yml', 'railway.toml', 'vite.config.ts', '.eslintrc', 'jest.config.ts', 'requirements.txt', 'pyproject.toml', 'go.mod', 'Cargo.toml']);
    return files.filter(f => configNames.has(f.name)).map(f => f.path);
  }

  private findEntryPoints(files: Array<{ name: string; path: string }>): string[] {
    const entryNames = ['index.ts', 'index.js', 'main.ts', 'main.js', 'app.ts', 'server.ts', 'main.py', 'app.py', 'main.go'];
    return files.filter(f => entryNames.includes(f.name)).map(f => f.path).slice(0, 5);
  }
}
