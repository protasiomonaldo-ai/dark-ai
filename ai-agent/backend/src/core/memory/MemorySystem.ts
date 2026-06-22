import { ShortTermMemory, MemoryEntry } from './ShortTermMemory';
import { LongTermMemory } from './LongTermMemory';
import { VectorMemory } from './VectorMemory';

export interface MemorySearchResult {
  source: 'short' | 'long' | 'vector';
  entry: MemoryEntry | Record<string, unknown>;
  relevance: number;
}

export class MemorySystem {
  private short: ShortTermMemory;
  private long: LongTermMemory;
  private episodic: VectorMemory;
  private sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.short = new ShortTermMemory(sessionId);
    this.long = new LongTermMemory();
    this.episodic = new VectorMemory();
  }

  async init(): Promise<void> {
    await this.long.loadIntoVector(this.sessionId);
  }

  rememberShort(content: string, type: MemoryEntry['type'], importance = 0.5, tags: string[] = []): MemoryEntry {
    return this.short.add({ content, type, importance, tags, metadata: {} });
  }

  async rememberLong(content: string, category: string, type = 'general', importance = 0.7, tags: string[] = []): Promise<void> {
    await this.long.save({ sessionId: this.sessionId, type, category, content, importance, tags });
    this.episodic.add(content, { category, type }, importance);
  }

  rememberEpisodic(content: string, metadata: Record<string, unknown> = {}): void {
    this.episodic.add(content, { ...metadata, sessionId: this.sessionId }, 0.6);
  }

  async recall(query: string): Promise<MemorySearchResult[]> {
    const results: MemorySearchResult[] = [];

    const shortResults = this.short.search(query);
    for (const e of shortResults.slice(0, 5)) {
      results.push({ source: 'short', entry: e, relevance: e.importance });
    }

    const longResults = await this.long.search(query, this.sessionId, 5);
    for (const e of longResults) {
      results.push({ source: 'long', entry: e as unknown as Record<string, unknown>, relevance: e.importance });
    }

    const vecResults = this.episodic.search(query, 5);
    for (const e of vecResults) {
      results.push({ source: 'vector', entry: e as unknown as Record<string, unknown>, relevance: e.score });
    }

    return results.sort((a, b) => b.relevance - a.relevance).slice(0, 10);
  }

  getRecentMessages(n = 10): MemoryEntry[] {
    return this.short.getByType('message').slice(-n);
  }

  getRecentContext(): string {
    const recent = this.short.getRecent(10);
    return recent.map(e => `[${e.type.toUpperCase()}] ${e.content}`).join('\n');
  }

  async consolidate(): Promise<void> {
    const important = this.short.getAll().filter(e => e.importance >= 0.7);
    for (const entry of important) {
      await this.long.save({
        sessionId: this.sessionId,
        type: entry.type,
        category: 'consolidated',
        content: entry.content,
        importance: entry.importance,
        tags: entry.tags,
      });
    }
  }

  stats(): Record<string, number> {
    return {
      shortTerm: this.short.size(),
      episodic: this.episodic.size(),
    };
  }
}
