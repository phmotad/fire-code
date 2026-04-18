import { DatabaseManager } from '../db/DatabaseManager.js';
import { getFireCodeDir } from '../utils/paths.js';
import type { LLMProvider } from '../providers/LLMProvider.js';

const SUMMARIZE_PROMPT = (observations: string) => `You are summarizing what an AI coding agent did in a session.

Here are the observations from this session:
${observations}

Write a concise 2-4 sentence summary covering:
- What was built or fixed (specific files/features)
- Key decisions made
- Any bugs resolved

Format: plain text, no markdown headers, past tense. Be specific about file names and features.`;

export class SummarizationService {
  private db: DatabaseManager;

  constructor(cwd: string) {
    this.db = DatabaseManager.getInstance(getFireCodeDir(cwd));
  }

  async summarizeSession(sessionId: string, project: string, provider?: LLMProvider): Promise<string | null> {
    const observations = this.db.getObservations({ project, limit: 50 })
      .filter(o => o.session_id === sessionId);

    if (observations.length === 0) return null;

    const obsText = observations
      .map(o => `[${o.type}] ${o.summary}${o.file_path ? ` (${o.file_path})` : ''}`)
      .join('\n');

    let summary: string;

    if (provider) {
      try {
        summary = await provider.complete(SUMMARIZE_PROMPT(obsText), { maxTokens: 200 });
      } catch {
        summary = this.buildFallbackSummary(observations);
      }
    } else {
      summary = this.buildFallbackSummary(observations);
    }

    this.db.addSummary(sessionId, project, summary.trim());
    return summary.trim();
  }

  private buildFallbackSummary(observations: { type: string; summary: string; file_path: string | null }[]): string {
    const byType = observations.reduce((acc, o) => {
      if (!acc[o.type]) acc[o.type] = [];
      acc[o.type].push(o.summary);
      return acc;
    }, {} as Record<string, string[]>);

    const parts: string[] = [];
    if (byType['feature']?.length) parts.push(`Added: ${byType['feature'].slice(0, 3).join(', ')}`);
    if (byType['bugfix']?.length)  parts.push(`Fixed: ${byType['bugfix'].slice(0, 3).join(', ')}`);
    if (byType['refactor']?.length) parts.push(`Refactored: ${byType['refactor'].slice(0, 2).join(', ')}`);
    if (byType['change']?.length)  parts.push(`Changed: ${byType['change'].slice(0, 3).join(', ')}`);

    return parts.length ? parts.join('. ') + '.' : `Session with ${observations.length} observations.`;
  }
}
