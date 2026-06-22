export interface MemoryEntry {
  id: string;
  content: string;
  type: 'message' | 'task' | 'file' | 'error' | 'output' | 'decision';
  timestamp: number;
  importance: number;
  tags: string[];
  metadata: Record<string, unknown>;
}

export class ShortTermMemory {
  private entries: MemoryEntry[] = [];
  private maxSize: number;
  private sessionId: string;

  constructor(sessionId: string, maxSize = 200) {
    this.sessionId = sessionId;
    this.maxSize = maxSize;
  }

  add(entry: Omit<MemoryEntry, 'id' | 'timestamp'>): MemoryEntry {
    const mem: MemoryEntry = {
      id: `stm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      ...entry,
    };
    this.entries.push(mem);
    if (this.entries.length > this.maxSize) {
      this.evict();
    }
    return mem;
  }

  private evict(): void {
    this.entries.sort((a, b) => {
      const scoreA = a.importance + (Date.now() - a.timestamp) / 1000000;
      const scoreB = b.importance + (Date.now() - b.timestamp) / 1000000;
      return scoreA - scoreB;
    });
    this.entries = this.entries.slice(Math.floor(this.maxSize * 0.2));
  }

  getRecent(n = 20): MemoryEntry[] {
    return this.entries.slice(-n);
  }

  getByType(type: MemoryEntry['type']): MemoryEntry[] {
    return this.entries.filter(e => e.type === type);
  }

  search(query: string): MemoryEntry[] {
    const terms = query.toLowerCase().split(/\s+/);
    return this.entries
      .filter(e => terms.some(t => e.content.toLowerCase().includes(t)))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 10);
  }

  getAll(): MemoryEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }

  size(): number {
    return this.entries.length;
  }

  getSessionId(): string {
    return this.sessionId;
  }
}
