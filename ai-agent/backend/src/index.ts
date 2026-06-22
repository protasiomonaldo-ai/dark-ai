import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import bodyParser from 'body-parser';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { initDatabase } from './db/database';
import chatRouter, { handleWebSocket } from './api/chat';
import memoryRouter from './api/memory';
import tasksRouter from './api/tasks';

const app = express();
const PORT = parseInt(process.env.PORT || '3001');

app.use(cors({ origin: '*' }));
app.use(morgan('combined'));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0', agent: 'AI Agent Platform', timestamp: new Date().toISOString() });
});

app.use('/api/chat', chatRouter);
app.use('/api/memory', memoryRouter);
app.use('/api/tasks', tasksRouter);

const FRONTEND_DIST = path.join(__dirname, '../../frontend/dist');
app.use(express.static(FRONTEND_DIST));
app.get('*', (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
});

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (ws: WebSocket, req) => {
  const url = new URL(req.url || '/', `http://localhost`);
  const sessionId = url.searchParams.get('sessionId') || `session_${Date.now()}`;
  console.log(`[WS] New connection: ${sessionId}`);
  handleWebSocket(ws, sessionId).catch(console.error);
});

async function start(): Promise<void> {
  try {
    if (process.env.DATABASE_URL) {
      await initDatabase();
      console.log('[DB] Connected and initialized');
    } else {
      console.warn('[DB] DATABASE_URL not set — running without persistence');
    }
  } catch (err) {
    console.warn('[DB] Could not initialize database:', err);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] AI Agent Platform running on port ${PORT}`);
    console.log(`[Server] Health: http://localhost:${PORT}/api/health`);
    console.log(`[Server] WebSocket: ws://localhost:${PORT}/ws`);
  });
}

start();
