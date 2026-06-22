import React, { useState } from 'react';
import { ChatPanel } from './components/ChatPanel';
import { TaskPanel } from './components/TaskPanel';
import { CodeViewer } from './components/CodeViewer';
import { useAgent } from './hooks/useAgent';
import { AgentEvent } from './types';

export default function App() {
  const { state, send, clearSession } = useAgent();
  const [rightTab, setRightTab] = useState<'code' | 'events'>('code');

  const toolEvents = state.events.filter(e =>
    e.type === 'TOOL_CALL' || e.type === 'TOOL_RESULT'
  ) as Array<{ type: string; tool?: string; args?: Record<string, unknown>; success?: boolean }>;

  return (
    <div className="app">
      <header className="header">
        <span className="header-logo">🤖</span>
        <span className="header-title">AI Agent Platform</span>
        <span className="header-badge">v1.0</span>
        <div className="header-spacer" />
        <span className="header-session">Session: {state.sessionId.slice(0, 8)}</span>
        <button
          onClick={clearSession}
          style={{ marginLeft: 12, background: 'none', border: '1px solid var(--border)', color: 'var(--text2)', padding: '3px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
          title="Clear session"
        >
          Clear
        </button>
      </header>

      <div className="workspace">
        <ChatPanel
          messages={state.messages}
          events={state.events}
          isProcessing={state.isProcessing}
          onSend={send}
        />

        <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', overflow: 'hidden' }}>
          <div className="right-tabs" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg2)', display: 'flex' }}>
            <div
              className={`right-tab ${rightTab === 'code' ? 'active' : ''}`}
              onClick={() => setRightTab('code')}
            >
              💻 Code
              {state.generatedFiles.length > 0 && (
                <span style={{ marginLeft: 6, background: 'var(--accent2)', color: '#fff', borderRadius: 10, padding: '0 5px', fontSize: 10 }}>
                  {state.generatedFiles.length}
                </span>
              )}
            </div>
            <div
              className={`right-tab ${rightTab === 'events' ? 'active' : ''}`}
              onClick={() => setRightTab('events')}
            >
              🧠 Reasoning
              {state.events.length > 0 && (
                <span style={{ marginLeft: 6, background: 'var(--bg3)', color: 'var(--text2)', borderRadius: 10, padding: '0 5px', fontSize: 10 }}>
                  {state.events.length}
                </span>
              )}
            </div>
          </div>

          {rightTab === 'code' ? (
            <CodeViewer files={state.generatedFiles} events={toolEvents} />
          ) : (
            <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="panel-header" style={{ padding: '0 0 8px' }}>
                <span className="icon">🧠</span>
                Agent Reasoning
              </div>
              {state.events.length === 0 ? (
                <div style={{ color: 'var(--text2)', fontSize: 12, paddingTop: 20, textAlign: 'center' }}>
                  Reasoning steps will appear here during processing
                </div>
              ) : (
                state.events.map((e, i) => <ReasoningEntry key={i} event={e} />)
              )}
            </div>
          )}
        </div>

        <TaskPanel tasks={state.tasks} currentPlan={state.currentPlan} />
      </div>
    </div>
  );
}

function ReasoningEntry({ event }: { event: AgentEvent }) {
  const icons: Record<string, string> = {
    THINKING: '🧠', PLANNING: '📋', TASK_START: '▶️', TASK_COMPLETE: '✅',
    TASK_FAIL: '❌', TOOL_CALL: '🔧', TOOL_RESULT: '📤', CODE_GENERATED: '💻',
    REVIEW_RESULT: '🔍', SECURITY_ALERT: '🛡️', DONE: '🎯', ERROR: '❌', RESPONSE: '💬',
  };
  const colors: Record<string, string> = {
    THINKING: 'var(--accent)', PLANNING: 'var(--purple)', TASK_START: 'var(--yellow)',
    TASK_COMPLETE: 'var(--green)', TASK_FAIL: 'var(--red)', TOOL_CALL: 'var(--orange)',
    SECURITY_ALERT: 'var(--red)', DONE: 'var(--green)', ERROR: 'var(--red)',
  };
  let text = event.content || event.message || event.summary || '';
  if (event.type === 'PLANNING') text = `Plan: ${event.plan?.tasks.length} tasks`;
  if (event.type === 'TASK_START') text = `▶ ${event.task?.title}`;
  if (event.type === 'TASK_COMPLETE') text = `✓ ${event.task?.title}`;
  if (event.type === 'TASK_FAIL') text = `✗ ${event.task?.title}`;
  if (event.type === 'TOOL_CALL') text = `→ ${event.tool}(${event.args?.['path'] || ''})`;
  if (event.type === 'TOOL_RESULT') text = `← ${event.tool}: ${event.success ? 'OK' : 'Error'}`;
  if (event.type === 'CODE_GENERATED') text = `Generated ${event.files?.length} file(s)`;
  if (event.type === 'RESPONSE') return null;

  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 12, padding: '4px 0', borderBottom: '1px solid rgba(48,54,61,.4)', alignItems: 'flex-start' }}>
      <span>{icons[event.type] || '•'}</span>
      <div>
        <span style={{ color: colors[event.type] || 'var(--text2)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', marginRight: 6 }}>
          {event.type}
        </span>
        <span style={{ color: 'var(--text)', lineHeight: 1.5 }}>{text}</span>
      </div>
    </div>
  );
}
