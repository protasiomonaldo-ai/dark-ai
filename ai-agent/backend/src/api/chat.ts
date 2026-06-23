import { Router, Request, Response } from 'express';
import { WebSocket } from 'ws';
import { Orchestrator, AgentEvent } from '../core/agents/Orchestrator';
import pool from '../db/database';

const router: Router = Router();
const sessions = new Map<string, Orchestrator>();

function getOrCreateSession(sessionId: string): Orchestrator {
  if (!sessions.has(sessionId)) {
    const agent = new Orchestrator(sessionId);
    agent.init().catch(console.error);
    sessions.set(sessionId, agent);
  }
  return sessions.get(sessionId)!;
}

router.post('/message', async (req: Request, res: Response) => {
  const { message, sessionId } = req.body as { message: string; sessionId: string };
  if (!message || !sessionId) {
    return res.status(400).json({ error: 'message and sessionId required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  await pool.query(
    `INSERT INTO conversations (session_id, role, content) VALUES ($1, 'user', $2)`,
    [sessionId, message]
  ).catch(() => {});

  const agent = getOrCreateSession(sessionId);
  const events: AgentEvent[] = [];

  const handler = (event: AgentEvent) => {
    events.push(event);
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch { /* client disconnected */ }
  };

  agent.on('event', handler);

  try {
    await agent.process(message);
    const responseEvent = events.find(e => e.type === 'RESPONSE');
    if (responseEvent && responseEvent.type === 'RESPONSE') {
      await pool.query(
        `INSERT INTO conversations (session_id, role, content) VALUES ($1, 'agent', $2)`,
        [sessionId, responseEvent.content]
      ).catch(() => {});
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'ERROR', message: String(err) })}\n\n`);
  } finally {
    agent.off('event', handler);
    res.write(`data: ${JSON.stringify({ type: 'STREAM_END' })}\n\n`);
    res.end();
  }
});

router.get('/history/:sessionId', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM conversations WHERE session_id = $1 ORDER BY created_at ASC LIMIT 100`,
      [sessionId]
    );
    res.json({ success: true, messages: result.rows });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/sessions', (_req: Request, res: Response) => {
  const activeSessions = [...sessions.keys()].map(id => ({
    id,
    stats: sessions.get(id)?.getStats() || {},
  }));
  res.json({ success: true, sessions: activeSessions });
});

router.delete('/session/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  sessions.delete(sessionId);
  res.json({ success: true, message: `Session ${sessionId} cleared` });
});

export async function handleWebSocket(ws: WebSocket, sessionId: string): Promise<void> {
  const agent = getOrCreateSession(sessionId);

  const handler = (event: AgentEvent) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(event));
    }
  };

  agent.on('event', handler);

  ws.on('message', async (raw) => {
    try {
      const data = JSON.parse(raw.toString()) as { message: string };
      if (data.message) {
        await pool.query(
          `INSERT INTO conversations (session_id, role, content) VALUES ($1, 'user', $2)`,
          [sessionId, data.message]
        ).catch(() => {});
        await agent.process(data.message);
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: 'ERROR', message: String(err) }));
    }
  });

  ws.on('close', () => {
    agent.off('event', handler);
  });
}

export default router;
