export interface VectorEntry {
  id: string;
  text: string;
  vector: number[];
  metadata: Record<string, unknown>;
  importance: number;
  createdAt: number;
}

export class VectorMemory {
  private entries: VectorEntry[] = [];
  private vocabulary: Map<string, number> = new Map();
  private idfCache: Map<string, number> = new Map();

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2);
  }

  private buildVocabulary(texts: string[]): void {
    const counts = new Map<string, number>();
    for (const text of texts) {
      const tokens = new Set(this.tokenize(text));
      for (const token of tokens) {
        counts.set(token, (counts.get(token) || 0) + 1);
      }
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2000);
    this.vocabulary.clear();
    sorted.forEach(([term], idx) => this.vocabulary.set(term, idx));
  }

  private tfidf(text: string, totalDocs: number): number[] {
    const tokens = this.tokenize(text);
    const tf = new Map<string, number>();
    for (const t of tokens) {
      tf.set(t, (tf.get(t) || 0) + 1);
    }
    const vector = new Array(this.vocabulary.size).fill(0);
    for (const [term, idx] of this.vocabulary) {
      if (!tf.has(term)) continue;
      const termFreq = (tf.get(term) || 0) / tokens.length;
      let idf = this.idfCache.get(term);
      if (idf === undefined) {
        const docsWithTerm = this.entries.filter(e =>
          this.tokenize(e.text).includes(term)
        ).length + 1;
        idf = Math.log((totalDocs + 1) / docsWithTerm);
        this.idfCache.set(term, idf);
      }
      vector[idx] = termFreq * idf;
    }
    return vector;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  private rebuild(): void {
    const allTexts = this.entries.map(e => e.text);
    this.buildVocabulary(allTexts);
    this.idfCache.clear();
    const n = this.entries.length;
    for (const entry of this.entries) {
      entry.vector = this.tfidf(entry.text, n);
    }
  }

  add(text: string, metadata: Record<string, unknown> = {}, importance = 0.5): VectorEntry {
    const entry: VectorEntry = {
      id: `vec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      text,
      vector: [],
      metadata,
      importance,
      createdAt: Date.now(),
    };
    this.entries.push(entry);
    if (this.entries.length % 10 === 0) {
      this.rebuild();
    } else {
      this.buildVocabulary(this.entries.map(e => e.text));
      entry.vector = this.tfidf(text, this.entries.length);
    }
    return entry;
  }

  search(query: string, topK = 5): Array<VectorEntry & { score: number }> {
    if (this.entries.length === 0) return [];
    if (this.vocabulary.size === 0) this.rebuild();
    const queryVec = this.tfidf(query, this.entries.length);
    return this.entries
      .map(e => ({ ...e, score: this.cosineSimilarity(queryVec, e.vector) }))
      .sort((a, b) => b.score * b.importance - a.score * a.importance)
      .slice(0, topK)
      .filter(e => e.score > 0.01);
  }

  size(): number {
    return this.entries.length;
  }

  getAll(): VectorEntry[] {
    return [...this.entries];
  }
}
