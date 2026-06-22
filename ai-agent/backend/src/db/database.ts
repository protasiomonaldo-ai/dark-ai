import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export async function initDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS memories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id VARCHAR(255),
        type VARCHAR(50) NOT NULL,
        category VARCHAR(100),
        content TEXT NOT NULL,
        importance FLOAT DEFAULT 0.5,
        access_count INTEGER DEFAULT 0,
        tags TEXT[],
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS knowledge_nodes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        label VARCHAR(255) NOT NULL,
        type VARCHAR(100),
        properties JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS knowledge_edges (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_id UUID REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
        target_id UUID REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
        relationship VARCHAR(255),
        weight FLOAT DEFAULT 1.0,
        properties JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id VARCHAR(255),
        goal_id UUID,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        status VARCHAR(50) DEFAULT 'PENDING',
        priority VARCHAR(50) DEFAULT 'MEDIUM',
        complexity VARCHAR(50) DEFAULT 'SIMPLE',
        dependencies UUID[],
        result JSONB,
        error TEXT,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS learning_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source VARCHAR(100),
        observation TEXT,
        pattern TEXT,
        confidence FLOAT DEFAULT 0.5,
        impact VARCHAR(50),
        applied_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_memories_session ON memories(session_id);
      CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
      CREATE INDEX IF NOT EXISTS idx_tasks_session ON tasks(session_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id);
    `);
    console.log('[DB] Database initialized');
  } finally {
    client.release();
  }
}

export default pool;
