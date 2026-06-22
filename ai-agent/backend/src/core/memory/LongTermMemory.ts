import pool from '../../db/database';
import { VectorMemory } from './VectorMemory';

export interface LongTermEntry {
  id: string;
  sessionId: string;
  type: string;
  category: string;
  content: string;
  importance: number;
  accessCount: number;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class LongTermMemory {
  private vectorIndex: VectorMemory = new VectorMemory();
  private cache: Map<string, LongTermEntry> = new Map();

  async save(entry: {
    sessionId: string;
    type: string;
    category: string;
    content: string;
    importance?: number;
    tags?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<LongTermEntry> {
    const result = await pool.query(
      `INSERT INTO memories (session_id, type, category, content, importance, tags, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        entry.sessionId,
        entry.type,
        entry.category,
        entry.content,
        entry.importance ?? 0.5,
        entry.tags ?? [],
        JSON.stringify(entry.metadata ?? {}),
      ]
    );
    const row = result.rows[0];
    const mem = this.rowToEntry(row);
    this.cache.set(mem.id, mem);
    this.vectorIndex.add(mem.content, { id: mem.id, type: mem.type, category: mem.category }, mem.importance);
    return mem;
  }

  async search(query: string, sessionId?: string, limit = 10): Promise<LongTermEntry[]> {
    const vectorResults = this.vectorIndex.search(query, limit * 2);
    if (vectorResults.length > 0) {
      const ids = vectorResults.map(r => r.metadata['id'] as string).filter(Boolean);
      if (ids.length > 0) {
        const result = await pool.query(
          `SELECT * FROM memories WHERE id = ANY($1) ${sessionId ? 'AND session_id = $2' : ''} ORDER BY importance DESC LIMIT $${sessionId ? 3 : 2}`,
          sessionId ? [ids, sessionId, limit] : [ids, limit]
        );
        await this.incrementAccess(ids);
        return result.rows.map(r => this.rowToEntry(r));
      }
    }
    const result = await pool.query(
      `SELECT * FROM memories WHERE content ILIKE $1 ${sessionId ? 'AND session_id = $2' : ''} ORDER BY importance DESC, created_at DESC LIMIT $${sessionId ? 3 : 2}`,
      sessionId ? [`%${query}%`, sessionId, limit] : [`%${query}%`, limit]
    );
    return result.rows.map(r => this.rowToEntry(r));
  }

  async getByCategory(category: string, sessionId?: string): Promise<LongTermEntry[]> {
    const result = await pool.query(
      `SELECT * FROM memories WHERE category = $1 ${sessionId ? 'AND session_id = $2' : ''} ORDER BY importance DESC, created_at DESC LIMIT 20`,
      sessionId ? [category, sessionId] : [category]
    );
    return result.rows.map(r => this.rowToEntry(r));
  }

  async getRecent(sessionId: string, limit = 20): Promise<LongTermEntry[]> {
    const result = await pool.query(
      `SELECT * FROM memories WHERE session_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [sessionId, limit]
    );
    return result.rows.map(r => this.rowToEntry(r));
  }

  async loadIntoVector(sessionId: string): Promise<void> {
    const result = await pool.query(
      `SELECT * FROM memories WHERE session_id = $1 ORDER BY importance DESC LIMIT 500`,
      [sessionId]
    );
    for (const row of result.rows) {
      const entry = this.rowToEntry(row);
      this.vectorIndex.add(entry.content, { id: entry.id, type: entry.type, category: entry.category }, entry.importance);
    }
  }

  private async incrementAccess(ids: string[]): Promise<void> {
    await pool.query(
      `UPDATE memories SET access_count = access_count + 1, updated_at = NOW() WHERE id = ANY($1)`,
      [ids]
    );
  }

  private rowToEntry(row: Record<string, unknown>): LongTermEntry {
    return {
      id: row['id'] as string,
      sessionId: row['session_id'] as string,
      type: row['type'] as string,
      category: row['category'] as string,
      content: row['content'] as string,
      importance: row['importance'] as number,
      accessCount: row['access_count'] as number,
      tags: row['tags'] as string[],
      metadata: row['metadata'] as Record<string, unknown>,
      createdAt: row['created_at'] as Date,
      updatedAt: row['updated_at'] as Date,
    };
  }
}
