export interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: number;
}

export interface AgentEvent {
  type:
    | 'THINKING'
    | 'PLANNING'
    | 'TASK_START'
    | 'TASK_COMPLETE'
    | 'TASK_FAIL'
    | 'TOOL_CALL'
    | 'TOOL_RESULT'
    | 'CODE_GENERATED'
    | 'REVIEW_RESULT'
    | 'SECURITY_ALERT'
    | 'RESPONSE'
    | 'ERROR'
    | 'DONE'
    | 'STREAM_END';
  content?: string;
  plan?: Plan;
  task?: Task;
  result?: unknown;
  error?: string;
  tool?: string;
  args?: Record<string, unknown>;
  data?: unknown;
  success?: boolean;
  files?: Array<{ path: string; content: string }>;
  status?: string;
  score?: number;
  message?: string;
  severity?: string;
  summary?: string;
}

export interface Task {
  id: string;
  goalId: string;
  title: string;
  description: string;
  status: 'PENDING' | 'READY' | 'RUNNING' | 'WAITING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  complexity: string;
  dependencies: string[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface Plan {
  goalId: string;
  goal: string;
  tasks: Task[];
  estimatedDuration: number;
  complexity: string;
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface Memory {
  id: string;
  type: string;
  category: string;
  content: string;
  importance: number;
  createdAt: string;
}
