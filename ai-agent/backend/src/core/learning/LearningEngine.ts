import pool from '../../db/database';

export interface LearningRecord {
  id: string;
  source: string;
  observation: string;
  pattern: string;
  confidence: number;
  impact: 'LOW' | 'MEDIUM' | 'HIGH';
  appliedCount: number;
  createdAt: Date;
}

export interface PatternMatch {
  pattern: string;
  confidence: number;
  suggestion: string;
  source: string;
}

export class LearningEngine {
  private patterns: Map<string, LearningRecord> = new Map();
  private outcomeHistory: Array<{ action: string; result: 'SUCCESS' | 'FAILURE'; context: string; timestamp: number }> = [];

  async recordOutcome(action: string, result: 'SUCCESS' | 'FAILURE', context: string): Promise<void> {
    this.outcomeHistory.push({ action, result, context, timestamp: Date.now() });
    if (this.outcomeHistory.length > 1000) {
      this.outcomeHistory = this.outcomeHistory.slice(-1000);
    }
    await this.detectPatterns(action, result, context);
  }

  async recordFeedback(feedback: string, rating: number, context: string): Promise<void> {
    const sentiment = rating >= 4 ? 'POSITIVE' : rating >= 2 ? 'NEUTRAL' : 'NEGATIVE';
    const observation = `User feedback (${sentiment}, rating ${rating}/5): ${feedback}`;
    const pattern = rating >= 4 ? `Good approach for: ${context.slice(0, 100)}` : `Avoid approach for: ${context.slice(0, 100)}`;
    await this.savePattern({
      source: 'user_feedback',
      observation,
      pattern,
      confidence: rating / 5,
      impact: rating >= 4 ? 'HIGH' : 'MEDIUM',
    });
  }

  async getSuggestions(context: string): Promise<PatternMatch[]> {
    await this.loadPatterns();
    const matches: PatternMatch[] = [];
    const contextLower = context.toLowerCase();

    for (const record of this.patterns.values()) {
      const patternLower = record.pattern.toLowerCase();
      const words = patternLower.split(/\s+/).filter(w => w.length > 3);
      const matchCount = words.filter(w => contextLower.includes(w)).length;
      const score = matchCount / Math.max(words.length, 1);

      if (score > 0.3) {
        matches.push({
          pattern: record.pattern,
          confidence: record.confidence * score,
          suggestion: this.patternToSuggestion(record),
          source: record.source,
        });
      }
    }

    return matches.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  }

  async getSuccessRate(action: string): Promise<number> {
    const relevant = this.outcomeHistory.filter(o => o.action.includes(action) || action.includes(o.action));
    if (relevant.length === 0) return 0.7;
    const successes = relevant.filter(o => o.result === 'SUCCESS').length;
    return successes / relevant.length;
  }

  async improveFromResults(): Promise<string[]> {
    const improvements: string[] = [];
    const recentFailures = this.outcomeHistory.filter(o => o.result === 'FAILURE').slice(-20);
    const recentSuccesses = this.outcomeHistory.filter(o => o.result === 'SUCCESS').slice(-20);

    if (recentFailures.length > 5) {
      const failurePatterns = this.groupBy(recentFailures.map(f => f.action));
      for (const [action, count] of Object.entries(failurePatterns)) {
        if (count >= 3) {
          improvements.push(`High failure rate for "${action}" — needs review`);
          await this.savePattern({
            source: 'self_improvement',
            observation: `${count} failures detected for action: ${action}`,
            pattern: `Avoid direct approach for: ${action}`,
            confidence: 0.6,
            impact: 'HIGH',
          });
        }
      }
    }

    if (recentSuccesses.length > 5) {
      const successPatterns = this.groupBy(recentSuccesses.map(s => s.action));
      for (const [action, count] of Object.entries(successPatterns)) {
        if (count >= 3) {
          improvements.push(`Successful pattern identified: "${action}"`);
        }
      }
    }

    return improvements;
  }

  private async detectPatterns(action: string, result: 'SUCCESS' | 'FAILURE', context: string): Promise<void> {
    const similar = this.outcomeHistory.filter(o => o.action === action);
    const failRate = similar.filter(o => o.result === 'FAILURE').length / Math.max(similar.length, 1);

    if (failRate > 0.6 && similar.length >= 3) {
      await this.savePattern({
        source: 'auto_detection',
        observation: `High failure rate (${Math.round(failRate * 100)}%) for: ${action}`,
        pattern: `Use alternative approach for: ${action}`,
        confidence: failRate,
        impact: 'HIGH',
      });
    } else if (result === 'SUCCESS' && similar.length >= 5) {
      await this.savePattern({
        source: 'auto_detection',
        observation: `Consistently successful: ${action}`,
        pattern: `Reliable approach: ${action} in context ${context.slice(0, 80)}`,
        confidence: 1 - failRate,
        impact: 'MEDIUM',
      });
    }
  }

  private async savePattern(data: { source: string; observation: string; pattern: string; confidence: number; impact: string }): Promise<void> {
    try {
      const result = await pool.query(
        `INSERT INTO learning_records (source, observation, pattern, confidence, impact) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [data.source, data.observation, data.pattern, data.confidence, data.impact]
      );
      const row = result.rows[0];
      this.patterns.set(row['id'], {
        id: row['id'],
        source: row['source'],
        observation: row['observation'],
        pattern: row['pattern'],
        confidence: row['confidence'],
        impact: row['impact'],
        appliedCount: row['applied_count'],
        createdAt: row['created_at'],
      });
    } catch { /* DB might not be available in all environments */ }
  }

  private async loadPatterns(): Promise<void> {
    if (this.patterns.size > 0) return;
    try {
      const result = await pool.query(`SELECT * FROM learning_records ORDER BY confidence DESC LIMIT 200`);
      for (const row of result.rows) {
        this.patterns.set(row['id'], {
          id: row['id'], source: row['source'], observation: row['observation'],
          pattern: row['pattern'], confidence: row['confidence'],
          impact: row['impact'], appliedCount: row['applied_count'], createdAt: row['created_at'],
        });
      }
    } catch { /* skip */ }
  }

  private patternToSuggestion(record: LearningRecord): string {
    if (record.source === 'user_feedback') return `Based on past feedback: ${record.observation.slice(0, 100)}`;
    if (record.impact === 'HIGH' && record.pattern.includes('Avoid')) return `⚠️ ${record.pattern}`;
    return `✓ ${record.pattern}`;
  }

  private groupBy(arr: string[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const item of arr) counts[item] = (counts[item] || 0) + 1;
    return counts;
  }

  getStats(): Record<string, number> {
    return {
      patternsLearned: this.patterns.size,
      outcomesRecorded: this.outcomeHistory.length,
      successRate: this.outcomeHistory.length > 0
        ? this.outcomeHistory.filter(o => o.result === 'SUCCESS').length / this.outcomeHistory.length
        : 0,
    };
  }
}
