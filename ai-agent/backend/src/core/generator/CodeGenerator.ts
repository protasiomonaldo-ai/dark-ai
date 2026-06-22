import { ReasoningResult } from '../reasoning/ReasoningEngine';
import { CodeTools } from '../tools/CodeTools';
import { MemorySystem } from '../memory/MemorySystem';

export interface GeneratedCode {
  id: string;
  language: string;
  files: GeneratedFile[];
  description: string;
  dependencies: string[];
  instructions: string;
}

export interface GeneratedFile {
  path: string;
  content: string;
  description: string;
  isNew: boolean;
}

const LANGUAGE_TEMPLATES: Record<string, Record<string, string>> = {
  typescript: {
    service: `import { Injectable } from './types';

export class {{ClassName}}Service {
  constructor(private readonly repository: {{ClassName}}Repository) {}

  async findAll(): Promise<{{ClassName}}[]> {
    return this.repository.findAll();
  }

  async findById(id: string): Promise<{{ClassName}} | null> {
    return this.repository.findById(id);
  }

  async create(data: Create{{ClassName}}Dto): Promise<{{ClassName}}> {
    return this.repository.create(data);
  }

  async update(id: string, data: Partial<Create{{ClassName}}Dto>): Promise<{{ClassName}}> {
    return this.repository.update(id, data);
  }

  async delete(id: string): Promise<void> {
    return this.repository.delete(id);
  }
}`,
    controller: `import { Router, Request, Response } from 'express';
import { {{ClassName}}Service } from './{{className}}.service';

const router = Router();
const service = new {{ClassName}}Service();

router.get('/', async (req: Request, res: Response) => {
  try {
    const items = await service.findAll();
    res.json({ success: true, data: items });
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const item = await service.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const item = await service.create(req.body);
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    res.status(400).json({ success: false, error: String(error) });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const item = await service.update(req.params.id, req.body);
    res.json({ success: true, data: item });
  } catch (error) {
    res.status(400).json({ success: false, error: String(error) });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await service.delete(req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

export default router;`,
    interface: `export interface {{ClassName}} {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Create{{ClassName}}Dto {
  // Define fields here
}

export interface Update{{ClassName}}Dto extends Partial<Create{{ClassName}}Dto> {}`,
    react_component: `import React, { useState, useEffect } from 'react';

interface {{ClassName}}Props {
  // Define props here
}

export const {{ClassName}}: React.FC<{{ClassName}}Props> = (props) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Initialize component
  }, []);

  if (loading) return <div className="loading">Loading...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="{{classNameLower}}">
      <h1>{{ClassName}}</h1>
      {/* Component content */}
    </div>
  );
};

export default {{ClassName}};`,
  },
  python: {
    service: `from typing import Optional, List

class {{ClassName}}Service:
    def __init__(self, repository):
        self.repository = repository

    def find_all(self) -> List[dict]:
        return self.repository.find_all()

    def find_by_id(self, id: str) -> Optional[dict]:
        return self.repository.find_by_id(id)

    def create(self, data: dict) -> dict:
        return self.repository.create(data)

    def update(self, id: str, data: dict) -> dict:
        return self.repository.update(id, data)

    def delete(self, id: str) -> None:
        self.repository.delete(id)`,
    api: `from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI()

class {{ClassName}}(BaseModel):
    name: str

@app.get("/{{classNameLower}}s")
async def get_all():
    return {"data": []}

@app.post("/{{classNameLower}}s")
async def create(item: {{ClassName}}):
    return {"data": item}

@app.get("/{{classNameLower}}s/{id}")
async def get_by_id(id: str):
    return {"data": {"id": id}}`,
  },
};

export class CodeGenerator {
  private codeTools: CodeTools;
  private memory: MemorySystem;

  constructor(codeTools: CodeTools, memory: MemorySystem) {
    this.codeTools = codeTools;
    this.memory = memory;
  }

  async generate(reasoning: ReasoningResult): Promise<GeneratedCode> {
    const entityName = this.extractEntityName(reasoning.goal);
    const language = this.detectTargetLanguage(reasoning);
    const pattern = this.detectPattern(reasoning);
    const files = this.generateFiles(entityName, language, pattern, reasoning);

    await this.memory.rememberShort(
      `Generated ${language} ${pattern} for "${entityName}"`,
      'output', 0.8, ['generation', language, pattern]
    );

    return {
      id: `gen_${Date.now()}`,
      language,
      files,
      description: `Generated ${pattern} for ${entityName} in ${language}`,
      dependencies: this.suggestDependencies(language, pattern),
      instructions: this.buildInstructions(files, language),
    };
  }

  generateFromPrompt(prompt: string, language = 'typescript'): string {
    const keywords = prompt.toLowerCase();
    const entityName = this.extractEntityName(prompt);

    if (keywords.includes('service') || keywords.includes('servizio')) {
      return this.applyTemplate(LANGUAGE_TEMPLATES[language]?.service || LANGUAGE_TEMPLATES['typescript'].service, entityName);
    }
    if (keywords.includes('controller') || keywords.includes('route') || keywords.includes('api')) {
      return this.applyTemplate(LANGUAGE_TEMPLATES[language]?.controller || LANGUAGE_TEMPLATES['typescript'].controller, entityName);
    }
    if (keywords.includes('component') || keywords.includes('react') || keywords.includes('componente')) {
      return this.applyTemplate(LANGUAGE_TEMPLATES['typescript'].react_component, entityName);
    }
    if (keywords.includes('interface') || keywords.includes('type') || keywords.includes('model')) {
      return this.applyTemplate(LANGUAGE_TEMPLATES['typescript'].interface, entityName);
    }

    return this.generateGenericCode(prompt, language, entityName);
  }

  private generateFiles(name: string, language: string, pattern: string, reasoning: ReasoningResult): GeneratedFile[] {
    const files: GeneratedFile[] = [];
    const ext = language === 'typescript' ? 'ts' : language === 'python' ? 'py' : 'js';
    const nameLower = name.toLowerCase();

    if (pattern === 'crud' || pattern === 'service') {
      files.push({
        path: `src/${nameLower}/${nameLower}.service.${ext}`,
        content: this.applyTemplate(LANGUAGE_TEMPLATES[language]?.service || LANGUAGE_TEMPLATES['typescript'].service, name),
        description: `${name} service — business logic`,
        isNew: true,
      });
      files.push({
        path: `src/${nameLower}/${nameLower}.controller.${ext}`,
        content: this.applyTemplate(LANGUAGE_TEMPLATES[language]?.controller || LANGUAGE_TEMPLATES['typescript'].controller, name),
        description: `${name} controller — HTTP routes`,
        isNew: true,
      });
      files.push({
        path: `src/${nameLower}/${nameLower}.types.${ext}`,
        content: this.applyTemplate(LANGUAGE_TEMPLATES['typescript'].interface, name),
        description: `${name} types and interfaces`,
        isNew: true,
      });
    } else if (pattern === 'component') {
      files.push({
        path: `src/components/${name}/${name}.tsx`,
        content: this.applyTemplate(LANGUAGE_TEMPLATES['typescript'].react_component, name),
        description: `${name} React component`,
        isNew: true,
      });
    } else {
      files.push({
        path: `src/${nameLower}.${ext}`,
        content: this.generateGenericCode(reasoning.goal, language, name),
        description: `Generated code for: ${reasoning.goal}`,
        isNew: true,
      });
    }

    return files;
  }

  private generateGenericCode(prompt: string, language: string, name: string): string {
    const ext = language === 'typescript' ? ': void' : '';
    if (language === 'python') {
      return `# Generated for: ${prompt}\n\nclass ${name}:\n    def __init__(self):\n        pass\n\n    def execute(self, input_data: dict) -> dict:\n        """Process input and return result"""\n        result = {}\n        # Implementation here\n        return result\n`;
    }
    return `// Generated for: ${prompt}\n\nexport class ${name} {\n  constructor() {}\n\n  async execute(input: Record<string, unknown>)${ext} {\n    // Implementation here\n    console.log('Executing ${name}', input);\n  }\n}\n`;
  }

  private applyTemplate(template: string, name: string): string {
    return template
      .replace(/\{\{ClassName\}\}/g, name)
      .replace(/\{\{className\}\}/g, name.charAt(0).toLowerCase() + name.slice(1))
      .replace(/\{\{classNameLower\}\}/g, name.toLowerCase());
  }

  private extractEntityName(goal: string): string {
    const patterns = [/crea\s+(?:un[ao]?\s+)?(\w+)/i, /create\s+(?:a\s+)?(\w+)/i, /build\s+(?:a\s+)?(\w+)/i, /(\w+)\s+service/i, /(\w+)\s+component/i];
    for (const p of patterns) {
      const m = goal.match(p);
      if (m && m[1] && m[1].length > 2) {
        return m[1].charAt(0).toUpperCase() + m[1].slice(1);
      }
    }
    return 'Entity';
  }

  private detectTargetLanguage(reasoning: ReasoningResult): string {
    const ts = reasoning.constraints.some(c => c.includes('TypeScript'));
    const py = reasoning.constraints.some(c => c.includes('Python'));
    const js = reasoning.constraints.some(c => c.includes('JavaScript'));
    if (ts) return 'typescript';
    if (py) return 'python';
    if (js) return 'javascript';
    return 'typescript';
  }

  private detectPattern(reasoning: ReasoningResult): string {
    const goal = reasoning.goal.toLowerCase();
    if (/crud|service|api|endpoint|route/.test(goal)) return 'crud';
    if (/component|react|vue|ui/.test(goal)) return 'component';
    return 'generic';
  }

  private suggestDependencies(language: string, pattern: string): string[] {
    const map: Record<string, string[]> = {
      'typescript-crud': ['express', '@types/express', 'uuid'],
      'typescript-component': ['react', 'react-dom', '@types/react'],
      'python-crud': ['fastapi', 'pydantic', 'uvicorn'],
    };
    return map[`${language}-${pattern}`] || [];
  }

  private buildInstructions(files: GeneratedFile[], language: string): string {
    const lines = [`Generated ${files.length} file(s):`, ''];
    for (const f of files) {
      lines.push(`- ${f.path}: ${f.description}`);
    }
    lines.push('', language === 'typescript' ? 'Run: pnpm install && pnpm run dev' : 'Run: pip install -r requirements.txt && python main.py');
    return lines.join('\n');
  }
}
