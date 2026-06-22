import pool from '../../db/database';

export interface KNode {
  id: string;
  label: string;
  type: string;
  properties: Record<string, unknown>;
}

export interface KEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relationship: string;
  weight: number;
  properties: Record<string, unknown>;
}

export class KnowledgeGraph {
  private nodes: Map<string, KNode> = new Map();
  private edges: KEdge[] = [];
  private adjacency: Map<string, string[]> = new Map();

  async addNode(label: string, type: string, properties: Record<string, unknown> = {}): Promise<KNode> {
    const existing = [...this.nodes.values()].find(n => n.label === label && n.type === type);
    if (existing) {
      existing.properties = { ...existing.properties, ...properties };
      await pool.query(
        `UPDATE knowledge_nodes SET properties = $1 WHERE id = $2`,
        [JSON.stringify(existing.properties), existing.id]
      );
      return existing;
    }
    const result = await pool.query(
      `INSERT INTO knowledge_nodes (label, type, properties) VALUES ($1, $2, $3) RETURNING *`,
      [label, type, JSON.stringify(properties)]
    );
    const node: KNode = {
      id: result.rows[0]['id'],
      label,
      type,
      properties,
    };
    this.nodes.set(node.id, node);
    return node;
  }

  async addEdge(sourceId: string, targetId: string, relationship: string, weight = 1.0): Promise<KEdge> {
    const result = await pool.query(
      `INSERT INTO knowledge_edges (source_id, target_id, relationship, weight) VALUES ($1, $2, $3, $4) 
       ON CONFLICT DO NOTHING RETURNING *`,
      [sourceId, targetId, relationship, weight]
    );
    if (result.rows.length === 0) {
      return this.edges.find(e => e.sourceId === sourceId && e.targetId === targetId && e.relationship === relationship)!;
    }
    const edge: KEdge = {
      id: result.rows[0]['id'],
      sourceId,
      targetId,
      relationship,
      weight,
      properties: {},
    };
    this.edges.push(edge);
    if (!this.adjacency.has(sourceId)) this.adjacency.set(sourceId, []);
    this.adjacency.get(sourceId)!.push(targetId);
    return edge;
  }

  findNode(label: string): KNode | undefined {
    return [...this.nodes.values()].find(n => n.label.toLowerCase() === label.toLowerCase());
  }

  getNeighbors(nodeId: string): KNode[] {
    const neighborIds = this.adjacency.get(nodeId) || [];
    return neighborIds.map(id => this.nodes.get(id)).filter(Boolean) as KNode[];
  }

  getRelationships(nodeId: string): KEdge[] {
    return this.edges.filter(e => e.sourceId === nodeId || e.targetId === nodeId);
  }

  traverse(startId: string, maxDepth = 3): KNode[] {
    const visited = new Set<string>();
    const result: KNode[] = [];
    const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];
    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (visited.has(id) || depth > maxDepth) continue;
      visited.add(id);
      const node = this.nodes.get(id);
      if (node) result.push(node);
      const neighbors = this.adjacency.get(id) || [];
      for (const nId of neighbors) {
        if (!visited.has(nId)) queue.push({ id: nId, depth: depth + 1 });
      }
    }
    return result;
  }

  search(query: string): KNode[] {
    const q = query.toLowerCase();
    return [...this.nodes.values()].filter(n =>
      n.label.toLowerCase().includes(q) ||
      n.type.toLowerCase().includes(q) ||
      JSON.stringify(n.properties).toLowerCase().includes(q)
    );
  }

  async load(): Promise<void> {
    const nodesResult = await pool.query(`SELECT * FROM knowledge_nodes LIMIT 1000`);
    const edgesResult = await pool.query(`SELECT * FROM knowledge_edges LIMIT 5000`);
    for (const row of nodesResult.rows) {
      const node: KNode = { id: row['id'], label: row['label'], type: row['type'], properties: row['properties'] };
      this.nodes.set(node.id, node);
    }
    for (const row of edgesResult.rows) {
      const edge: KEdge = {
        id: row['id'], sourceId: row['source_id'], targetId: row['target_id'],
        relationship: row['relationship'], weight: row['weight'], properties: row['properties'],
      };
      this.edges.push(edge);
      if (!this.adjacency.has(edge.sourceId)) this.adjacency.set(edge.sourceId, []);
      this.adjacency.get(edge.sourceId)!.push(edge.targetId);
    }
  }

  stats(): Record<string, number> {
    return { nodes: this.nodes.size, edges: this.edges.length };
  }
}
