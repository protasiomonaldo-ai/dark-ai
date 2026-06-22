import React, { useRef, useEffect, useState, KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message, AgentEvent } from '../types';

interface ChatPanelProps {
  messages: Message[];
  events: AgentEvent[];
  isProcessing: boolean;
  onSend: (text: string) => void;
}

const EVENT_ICONS: Record<string, string> = {
  THINKING: '🧠',
  PLANNING: '📋',
  TASK_START: '▶️',
  TASK_COMPLETE: '✅',
  TASK_FAIL: '❌',
  TOOL_CALL: '🔧',
  TOOL_RESULT: '📤',
  CODE_GENERATED: '💻',
  REVIEW_RESULT: '🔍',
  SECURITY_ALERT: '🛡️',
  DONE: '🎯',
  ERROR: '❌',
};

const EVENT_CLASSES: Record<string, string> = {
  THINKING: 'event-thinking',
  PLANNING: 'event-thinking',
  TOOL_CALL: 'event-tool',
  TOOL_RESULT: 'event-tool',
  CODE_GENERATED: 'event-code',
  SECURITY_ALERT: 'event-security',
  DONE: 'event-done',
  ERROR: 'event-error',
};

const EXAMPLES = [
  'Analizza questo repository e dimmi la struttura',
  'Crea un UserService con CRUD in TypeScript',
  'Spiega come funziona un sistema JWT',
  'Genera test per una funzione di autenticazione',
  'Trova tutti i file con errori potenziali',
];

function EventItem({ event }: { event: AgentEvent }) {
  const icon = EVENT_ICONS[event.type] || '•';
  const cls = EVENT_CLASSES[event.type] || '';
  let text = '';

  if (event.type === 'THINKING') text = event.content || '';
  else if (event.type === 'PLANNING') text = `Plan created: ${event.plan?.tasks.length} tasks for "${event.plan?.goal?.slice(0, 60)}"`;
  else if (event.type === 'TASK_START') text = `Starting: ${event.task?.title}`;
  else if (event.type === 'TASK_COMPLETE') text = `Done: ${event.task?.title}`;
  else if (event.type === 'TASK_FAIL') text = `Failed: ${event.task?.title} — ${event.error}`;
  else if (event.type === 'TOOL_CALL') text = `Tool: ${event.tool}`;
  else if (event.type === 'TOOL_RESULT') text = `Result: ${event.success ? '✓' : '✗'} ${event.tool}`;
  else if (event.type === 'CODE_GENERATED') text = `Generated ${event.files?.length} file(s)`;
  else if (event.type === 'SECURITY_ALERT') text = `Security [${event.severity}]: ${event.message}`;
  else if (event.type === 'DONE') text = event.summary || 'Done';
  else if (event.type === 'ERROR') text = event.message || 'Error';
  else text = event.content || '';

  if (!text) return null;

  return (
    <div className={`event-item ${cls}`}>
      <span className="event-icon">{icon}</span>
      <span className="event-content">{text}</span>
    </div>
  );
}

export function ChatPanel({ messages, events, isProcessing, onSend }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, events]);

  const handleSend = () => {
    if (!input.trim() || isProcessing) return;
    onSend(input.trim());
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '40px';
    }
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  const isEmpty = messages.length === 0 && events.length === 0;

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="icon">💬</span>
        Chat
        {isProcessing && <span style={{ color: 'var(--yellow)', fontWeight: 400 }} className="thinking-dots">Thinking</span>}
      </div>

      <div className="chat-messages">
        {isEmpty ? (
          <div className="welcome">
            <div className="welcome-icon">🤖</div>
            <h2>AI Agent Platform</h2>
            <p>Un agente AI costruito da zero. Ragiona, pianifica, usa strumenti, ricorda e impara.</p>
            <div className="welcome-examples">
              {EXAMPLES.map((ex, i) => (
                <button key={i} className="welcome-example" onClick={() => onSend(ex)}>
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map(msg => (
              <div key={msg.id} className={`msg msg-${msg.role}`}>
                <div className="msg-bubble">
                  {msg.role === 'agent' ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  ) : (
                    msg.content
                  )}
                </div>
                <span className="msg-time">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
            {isProcessing && events.length > 0 && (
              <div className="event-stream">
                {events.slice(-8).map((e, i) => <EventItem key={i} event={e} />)}
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-area">
        <textarea
          ref={textareaRef}
          className="chat-input"
          placeholder={isProcessing ? 'Agent is working...' : 'Ask the agent anything... (Enter to send, Shift+Enter for newline)'}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKey}
          disabled={isProcessing}
          rows={1}
        />
        <button className="send-btn" onClick={handleSend} disabled={isProcessing || !input.trim()}>
          {isProcessing ? '⏳' : '→ Send'}
        </button>
      </div>
    </div>
  );
}
