import { Router, Request, Response } from 'express';
import pool from '../db/database';

const router: Router = Router();

router.get('/:sessionId', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { status } = req.query as { status?: string };
  try {
    const query = status
      ? `SELECT * FROM tasks WHERE session_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 50`
      : `SELECT * FROM tasks WHERE session_id = $1 ORDER BY created_at DESC LIMIT 50`;
    const params = status ? [sessionId, status] : [sessionId];
    const result = await pool.query(query, params);
    res.json({ success: true, tasks: result.rows, count: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/goal/:goalId', async (req: Request, res: Response) => {
  const { goalId } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM tasks WHERE goal_id = $1 ORDER BY created_at ASC`,
      [goalId]
    );
    res.json({ success: true, tasks: result.rows });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.patch('/:taskId/status', async (req: Request, res: Response) => {
  const { taskId } = req.params;
  const { status } = req.body as { status: string };
  try {
    const result = await pool.query(
      `UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, taskId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Task not found' });
    res.json({ success: true, task: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/stats/:sessionId', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  try {
    const result = await pool.query(
      `SELECT status, COUNT(*) as count FROM tasks WHERE session_id = $1 GROUP BY status`,
      [sessionId]
    );
    res.json({ success: true, stats: result.rows });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
