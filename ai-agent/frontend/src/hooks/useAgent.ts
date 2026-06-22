import { useState, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { AgentEvent, Message, Task, Plan, GeneratedFile } from '../types';

export interface AgentState {
  messages: Message[];
  events: AgentEvent[];
  tasks: Task[];
  currentPlan: Plan | null;
  generatedFiles: GeneratedFile[];
  isProcessing: boolean;
  sessionId: string;
  connected: boolean;
}

const API_BASE = '/api';

export function useAgent() {
  const sessionId = useRef(uuidv4()).current;
  const [state, setState] = useState<AgentState>({
    messages: [],
    events: [],
    tasks: [],
    currentPlan: null,
    generatedFiles: [],
    isProcessing: false,
    sessionId,
    connected: true,
  });

  const addMessage = useCallback((role: 'user' | 'agent', content: string) => {
    const msg: Message = { id: uuidv4(), role, content, timestamp: Date.now() };
    setState(s => ({ ...s, messages: [...s.messages, msg] }));
    return msg;
  }, []);

  const addEvent = useCallback((event: AgentEvent) => {
    setState(s => ({ ...s, events: [...s.events.slice(-100), event] }));
  }, []);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || state.isProcessing) return;
    addMessage('user', text);
    setState(s => ({ ...s, isProcessing: true, events: [] }));

    try {
      const res = await fetch(`${API_BASE}/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6)) as AgentEvent;
            addEvent(event);

            if (event.type === 'PLANNING' && event.plan) {
              setState(s => ({
                ...s,
                currentPlan: event.plan!,
                tasks: event.plan!.tasks,
              }));
            }

            if (event.type === 'TASK_START' && event.task) {
              setState(s => ({
                ...s,
                tasks: s.tasks.map(t => t.id === event.task!.id ? { ...t, status: 'RUNNING' } : t),
              }));
            }

            if (event.type === 'TASK_COMPLETE' && event.task) {
              setState(s => ({
                ...s,
                tasks: s.tasks.map(t => t.id === event.task!.id ? { ...t, status: 'COMPLETED' } : t),
              }));
            }

            if (event.type === 'TASK_FAIL' && event.task) {
              setState(s => ({
                ...s,
                tasks: s.tasks.map(t => t.id === event.task!.id ? { ...t, status: 'FAILED', error: event.error } : t),
              }));
            }

            if (event.type === 'CODE_GENERATED' && event.files) {
              setState(s => ({ ...s, generatedFiles: [...s.generatedFiles, ...event.files!] }));
            }

            if (event.type === 'RESPONSE' && event.content) {
              addMessage('agent', event.content);
            }

            if (event.type === 'STREAM_END' || event.type === 'DONE') {
              setState(s => ({ ...s, isProcessing: false }));
            }

            if (event.type === 'ERROR') {
              addMessage('agent', `❌ Error: ${event.message}`);
              setState(s => ({ ...s, isProcessing: false }));
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err) {
      addMessage('agent', `❌ Connection error: ${err}`);
      setState(s => ({ ...s, isProcessing: false }));
    }
  }, [state.isProcessing, sessionId, addMessage, addEvent]);

  const clearSession = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/chat/session/${sessionId}`, { method: 'DELETE' });
    } catch { /* ignore */ }
    setState(s => ({ ...s, messages: [], events: [], tasks: [], currentPlan: null, generatedFiles: [] }));
  }, [sessionId]);

  return { state, send, clearSession };
}
