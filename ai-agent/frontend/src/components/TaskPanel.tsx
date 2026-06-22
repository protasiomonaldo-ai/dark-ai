import React from 'react';
import { Task, Plan } from '../types';

interface TaskPanelProps {
  tasks: Task[];
  currentPlan: Plan | null;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  READY: 'Ready',
  RUNNING: 'Running...',
  WAITING: 'Waiting',
  COMPLETED: 'Done',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
};

function TaskItem({ task }: { task: Task }) {
  return (
    <div className="task-item">
      <div className="task-header">
        <div className={`task-status-dot status-${task.status}`} title={STATUS_LABELS[task.status]} />
        <span className="task-title">{task.title}</span>
        <span className={`task-badge badge-${task.priority}`}>{task.priority}</span>
      </div>
      <div className="task-desc">{task.description}</div>
      <div className="task-meta">
        <span style={{ fontSize: 10, color: 'var(--text2)' }}>{task.complexity}</span>
        {task.status === 'RUNNING' && (
          <span style={{ fontSize: 10, color: 'var(--yellow)' }}>⏳ In progress</span>
        )}
        {task.status === 'FAILED' && task.error && (
          <span style={{ fontSize: 10, color: 'var(--red)' }} title={task.error}>❌ {task.error.slice(0, 40)}</span>
        )}
        {task.status === 'COMPLETED' && (
          <span style={{ fontSize: 10, color: 'var(--green)' }}>✅</span>
        )}
      </div>
    </div>
  );
}

export function TaskPanel({ tasks, currentPlan }: TaskPanelProps) {
  const completed = tasks.filter(t => t.status === 'COMPLETED').length;
  const failed = tasks.filter(t => t.status === 'FAILED').length;
  const running = tasks.filter(t => t.status === 'RUNNING').length;

  return (
    <div className="panel" style={{ borderRight: 'none', borderLeft: '1px solid var(--border)' }}>
      <div className="panel-header">
        <span className="icon">📋</span>
        Tasks
        {tasks.length > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 400, color: 'var(--text2)', textTransform: 'none' }}>
            {completed}/{tasks.length}
            {failed > 0 && <span style={{ color: 'var(--red)', marginLeft: 4 }}>{failed} failed</span>}
          </span>
        )}
      </div>

      {currentPlan && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Current goal</div>
          <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{currentPlan.goal.slice(0, 80)}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--text2)' }}>⏱ ~{currentPlan.estimatedDuration}s</span>
            <span style={{ fontSize: 10, color: 'var(--accent)' }}>{currentPlan.complexity}</span>
            {running > 0 && <span style={{ fontSize: 10, color: 'var(--yellow)' }}>⏳ {running} running</span>}
          </div>
          {tasks.length > 0 && (
            <div style={{ marginTop: 8, background: 'var(--bg3)', borderRadius: 4, height: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${(completed / tasks.length) * 100}%`,
                background: failed > 0 ? 'var(--red)' : 'var(--green)',
                transition: 'width .3s',
              }} />
            </div>
          )}
        </div>
      )}

      <div className="panel-body">
        {tasks.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text2)', gap: 8, paddingTop: 40 }}>
            <div style={{ fontSize: 32 }}>📋</div>
            <div style={{ fontSize: 12 }}>Tasks will appear here</div>
          </div>
        ) : (
          tasks.map(task => <TaskItem key={task.id} task={task} />)
        )}
      </div>
    </div>
  );
}
