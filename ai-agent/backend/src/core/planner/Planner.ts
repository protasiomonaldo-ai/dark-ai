import { ReasoningResult, Complexity } from '../reasoning/ReasoningEngine';
import pool from '../../db/database';

export type TaskStatus = 'PENDING' | 'READY' | 'RUNNING' | 'WAITING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface PlannedTask {
  id: string;
  goalId: string;
  sessionId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  complexity: Complexity;
  dependencies: string[];
  requiredTools: string[];
  result?: Record<string, unknown>;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

export interface Plan {
  goalId: string;
  goal: string;
  tasks: PlannedTask[];
  estimatedDuration: number;
  complexity: Complexity;
  sessionId: string;
}

const TASK_TEMPLATES: Record<string, (goal: string) => Array<{ title: string; description: string; tools: string[] }>> = {
  CREATE: (goal) => [
    { title: 'Analyze requirements', description: `Understand what needs to be built: ${goal}`, tools: ['read_file', 'search_files'] },
    { title: 'Plan architecture', description: 'Define structure, components, and interfaces', tools: [] },
    { title: 'Generate code', description: 'Implement the solution', tools: ['write_file', 'create_file'] },
    { title: 'Review generated code', description: 'Check quality, security, and correctness', tools: ['analyze_code'] },
    { title: 'Write tests', description: 'Validate the implementation', tools: ['generate_tests'] },
  ],
  ANALYZE: (goal) => [
    { title: 'Scan repository structure', description: 'Map all files and directories', tools: ['scan_repository', 'list_files'] },
    { title: 'Detect technologies', description: 'Identify languages, frameworks, dependencies', tools: ['read_file'] },
    { title: 'Analyze code quality', description: 'Check patterns, complexity, issues', tools: ['analyze_code'] },
    { title: 'Build dependency graph', description: 'Map relationships between components', tools: ['analyze_code'] },
    { title: 'Generate analysis report', description: `Comprehensive report of: ${goal}`, tools: [] },
  ],
  FIX: (goal) => [
    { title: 'Reproduce the issue', description: `Understand the bug: ${goal}`, tools: ['read_file', 'grep_code'] },
    { title: 'Locate root cause', description: 'Find exactly where the problem is', tools: ['grep_code', 'analyze_code'] },
    { title: 'Design fix', description: 'Plan the correction without breaking other things', tools: [] },
    { title: 'Apply fix', description: 'Implement the correction', tools: ['write_file'] },
    { title: 'Verify fix', description: 'Confirm the issue is resolved', tools: ['analyze_code'] },
  ],
  REFACTOR: (goal) => [
    { title: 'Analyze current structure', description: `Map the code to refactor: ${goal}`, tools: ['analyze_code', 'read_file'] },
    { title: 'Identify improvement areas', description: 'Find patterns to improve', tools: ['analyze_code'] },
    { title: 'Plan refactoring', description: 'Design new structure', tools: [] },
    { title: 'Apply refactoring', description: 'Transform the code', tools: ['write_file'] },
    { title: 'Validate no regressions', description: 'Ensure existing behavior preserved', tools: ['analyze_code'] },
  ],
  TEST: (goal) => [
    { title: 'Analyze code to test', description: `Understand what needs testing: ${goal}`, tools: ['read_file', 'analyze_code'] },
    { title: 'Plan test coverage', description: 'Identify all cases to test', tools: [] },
    { title: 'Generate unit tests', description: 'Create tests for individual units', tools: ['generate_tests', 'write_file'] },
    { title: 'Generate integration tests', description: 'Create tests for component interaction', tools: ['generate_tests', 'write_file'] },
    { title: 'Review test quality', description: 'Validate test correctness and coverage', tools: ['analyze_code'] },
  ],
  EXPLAIN: (goal) => [
    { title: 'Read the code', description: `Load and parse: ${goal}`, tools: ['read_file'] },
    { title: 'Analyze structure', description: 'Understand components and flow', tools: ['analyze_code'] },
    { title: 'Generate explanation', description: 'Create clear explanation', tools: [] },
  ],
  DEFAULT: (goal) => [
    { title: 'Understand the request', description: goal, tools: [] },
    { title: 'Execute', description: 'Perform the requested action', tools: ['read_file', 'write_file'] },
    { title: 'Verify result', description: 'Confirm successful completion', tools: [] },
  ],
};

export class Planner {
  async createPlan(reasoning: ReasoningResult, sessionId: string): Promise<Plan> {
    const goalId = `goal_${Date.now()}`;
    const templateKey = reasoning.intent in TASK_TEMPLATES ? reasoning.intent : 'DEFAULT';
    const template = TASK_TEMPLATES[templateKey] || TASK_TEMPLATES['DEFAULT'];
    const taskDefs = template(reasoning.goal);

    const tasks: PlannedTask[] = [];
    const ids: string[] = taskDefs.map(() => `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);

    for (let i = 0; i < taskDefs.length; i++) {
      const def = taskDefs[i];
      const task: PlannedTask = {
        id: ids[i],
        goalId,
        sessionId,
        title: def.title,
        description: def.description,
        status: 'PENDING',
        priority: i === 0 ? 'HIGH' : 'MEDIUM',
        complexity: reasoning.complexity,
        dependencies: i === 0 ? [] : [ids[i - 1]],
        requiredTools: def.tools,
        createdAt: new Date(),
      };
      tasks.push(task);
      await pool.query(
        `INSERT INTO tasks (id, session_id, goal_id, title, description, status, priority, complexity, dependencies)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [task.id, sessionId, goalId, task.title, task.description, task.status, task.priority, task.complexity, task.dependencies]
      );
    }

    return {
      goalId,
      goal: reasoning.goal,
      tasks,
      estimatedDuration: this.estimateDuration(reasoning.complexity),
      complexity: reasoning.complexity,
      sessionId,
    };
  }

  async updateTaskStatus(taskId: string, status: TaskStatus, result?: Record<string, unknown>, error?: string): Promise<void> {
    await pool.query(
      `UPDATE tasks SET status = $1, result = $2, error = $3, 
       started_at = CASE WHEN $1 = 'RUNNING' THEN NOW() ELSE started_at END,
       completed_at = CASE WHEN $1 IN ('COMPLETED','FAILED','CANCELLED') THEN NOW() ELSE completed_at END
       WHERE id = $4`,
      [status, result ? JSON.stringify(result) : null, error || null, taskId]
    );
  }

  async getSessionTasks(sessionId: string): Promise<PlannedTask[]> {
    const result = await pool.query(
      `SELECT * FROM tasks WHERE session_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [sessionId]
    );
    return result.rows.map(r => this.rowToTask(r));
  }

  private rowToTask(row: Record<string, unknown>): PlannedTask {
    return {
      id: row['id'] as string,
      goalId: row['goal_id'] as string,
      sessionId: row['session_id'] as string,
      title: row['title'] as string,
      description: row['description'] as string,
      status: row['status'] as TaskStatus,
      priority: row['priority'] as TaskPriority,
      complexity: row['complexity'] as Complexity,
      dependencies: (row['dependencies'] as string[]) || [],
      requiredTools: [],
      result: row['result'] as Record<string, unknown> | undefined,
      error: row['error'] as string | undefined,
      startedAt: row['started_at'] as Date | undefined,
      completedAt: row['completed_at'] as Date | undefined,
      createdAt: row['created_at'] as Date,
    };
  }

  private estimateDuration(complexity: Complexity): number {
    const map: Record<Complexity, number> = {
      TRIVIAL: 5, SIMPLE: 15, MEDIUM: 45, COMPLEX: 120, VERY_COMPLEX: 300,
    };
    return map[complexity];
  }
}
