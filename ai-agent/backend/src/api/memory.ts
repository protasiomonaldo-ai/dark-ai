import { Router, Request, Response } from 'express';
import pool from '../db/database';

const router = Router();

router.get('/:sessionId', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { type, limit = '20' } = req.query as { type?: string; limit?: string };
  try {
    const query = type
      ? `SELECT * FROM memories WHERE session_id = $1 AND type = $2 ORDER BY importance DESC, created_at DESC LIMIT $3`
      : `SELECT * FROM memories WHERE session_id = $1 ORDER BY importance DESC, created_at DESC LIMIT $2`;
    const params = type ? [sessionId, type, parseInt(limit)] : [sessionId, parseInt(limit)];
    const result = await pool.query(query, params);
    res.json({ success: true, memories: result.rows, count: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const { sessionId, type, category, content, importance = 0.5, tags = [] } = req.body as {
    sessionId: string; type: string; category: string; content: string;
    importance?: number; tags?: string[];
  };
  if (!sessionId || !content) return res.status(400).json({ error: 'sessionId and content required' });
  try {
    const result = await pool.query(
      `INSERT INTO memories (session_id, type, category, content, importance, tags) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [sessionId, type || 'general', category || 'manual', content, importance, tags]
    );
    res.status(201).json({ success: true, memory: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await pool.query(`DELETE FROM memories WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/search/:sessionId', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { q } = req.query as { q: string };
  if (!q) return res.status(400).json({ error: 'query (q) required' });
  try {
    const result = await pool.query(
      `SELECT * FROM memories WHERE session_id = $1 AND content ILIKE $2 ORDER BY importance DESC LIMIT 10`,
      [sessionId, `%${q}%`]
    );
    res.json({ success: true, results: result.rows });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/stats/:sessionId', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  try {
    const result = await pool.query(
      `SELECT type, COUNT(*) as count, AVG(importance) as avg_importance FROM memories WHERE session_id = $1 GROUP BY type`,
      [sessionId]
    );
    res.json({ success: true, stats: result.rows });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
