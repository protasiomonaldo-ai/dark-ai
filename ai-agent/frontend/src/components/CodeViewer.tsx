import React, { useState } from 'react';
import { GeneratedFile } from '../types';

interface CodeViewerProps {
  files: GeneratedFile[];
  events: Array<{ type: string; tool?: string; args?: Record<string, unknown>; success?: boolean }>;
}

function colorize(code: string, ext: string): React.ReactNode[] {
  const lines = code.split('\n');
  return lines.map((line, i) => (
    <div key={i} style={{ display: 'flex' }}>
      <span style={{ color: 'var(--text2)', width: 36, textAlign: 'right', paddingRight: 12, userSelect: 'none', fontSize: 11, flexShrink: 0 }}>{i + 1}</span>
      <span style={{ flex: 1 }}>{line || ' '}</span>
    </div>
  ));
}

function ToolLog({ events }: { events: CodeViewerProps['events'] }) {
  const toolEvents = events.filter(e => e.type === 'TOOL_CALL' || e.type === 'TOOL_RESULT');
  if (toolEvents.length === 0) return null;
  return (
    <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase' }}>Tool Calls</div>
      {toolEvents.map((e, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, marginBottom: 3 }}>
          <span style={{ color: e.type === 'TOOL_RESULT' ? (e.success ? 'var(--green)' : 'var(--red)') : 'var(--orange)' }}>
            {e.type === 'TOOL_CALL' ? '🔧' : (e.success ? '✓' : '✗')}
          </span>
          <span style={{ color: 'var(--text2)' }}>{e.tool}</span>
          {e.args?.['path'] && (
            <span style={{ color: 'var(--text)', fontFamily: 'monospace' }}>{String(e.args['path']).split('/').pop()}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export function CodeViewer({ files, events }: CodeViewerProps) {
  const [activeTab, setActiveTab] = useState(0);

  if (files.length === 0) {
    return (
      <div className="code-viewer">
        <div className="panel-header">
          <span className="icon">💻</span>
          Code
        </div>
        <ToolLog events={events} />
        <div className="code-empty">
          <div className="code-empty-icon">💻</div>
          <div>Generated files will appear here</div>
          <div style={{ fontSize: 11 }}>Ask the agent to create or analyze code</div>
        </div>
      </div>
    );
  }

  const active = files[Math.min(activeTab, files.length - 1)];
  const ext = active.path.split('.').pop() || '';

  return (
    <div className="code-viewer">
      <div className="panel-header">
        <span className="icon">💻</span>
        Code
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 400, color: 'var(--text2)', textTransform: 'none' }}>
          {files.length} file{files.length !== 1 ? 's' : ''}
        </span>
      </div>

      <ToolLog events={events} />

      <div className="code-tabs">
        {files.map((f, i) => (
          <div
            key={i}
            className={`code-tab ${activeTab === i ? 'active' : ''}`}
            onClick={() => setActiveTab(i)}
            title={f.path}
          >
            {f.path.split('/').pop()}
          </div>
        ))}
      </div>

      <div style={{ padding: '4px 12px 2px', background: 'var(--bg2)', fontSize: 11, color: 'var(--text2)', fontFamily: 'monospace' }}>
        {active.path}
      </div>

      <div className="code-content">
        <div className="code-pre" style={{ fontFamily: "'SF Mono', 'Fira Code', monospace" }}>
          {colorize(active.content, ext)}
        </div>
      </div>
    </div>
  );
}
