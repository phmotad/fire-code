import { SqlJsDatabase } from '../db/SqlJsAdapter.js';
import type { Document, ScoredDocument, VectorStore } from './VectorStore.js';
import { embedTexts } from '../utils/modelManager.js';
import { logger } from '../utils/logger.js';

async function getEmbedding(text: string): Promise<number[]> {
  try {
    const embeddings = await embedTexts([text]);
    return embeddings[0] ?? [];
  } catch {
    return [];
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function textSimilarity(query: string, text: string): number {
  const queryTerms = new Set(query.toLowerCase().split(/\W+/).filter(Boolean));
  const textTerms = text.toLowerCase().split(/\W+/).filter(Boolean);
  if (queryTerms.size === 0 || textTerms.length === 0) return 0;
  const matches = textTerms.filter(t => queryTerms.has(t)).length;
  return matches / (queryTerms.size + textTerms.length - matches);
}

interface VectorRow {
  id: string;
  text: string;
  metadata: string;
  embedding: string | null;
}

export class SQLiteVectorStore implements VectorStore {
  constructor(private db: SqlJsDatabase, private project: string) {}

  async add(documents: Document[]): Promise<void> {
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO vector_chunks (id, project, text, metadata, embedding)
      VALUES (?, ?, ?, ?, ?)
    `);
    const insertMany = this.db.transaction((docs: Document[]) => {
      for (const doc of docs) {
        insert.run(
          doc.id,
          this.project,
          doc.text,
          JSON.stringify(doc.metadata),
          doc.embedding && doc.embedding.length > 0 ? JSON.stringify(doc.embedding) : null,
        );
      }
    });
    insertMany(documents);
    logger.debug({ count: documents.length, project: this.project }, 'Vector chunks upserted to SQLite');
  }

  async search(query: string, k = 5): Promise<ScoredDocument[]> {
    const rows = this.db.prepare(
      `SELECT id, text, metadata, embedding FROM vector_chunks WHERE project = ?`
    ).all(this.project) as VectorRow[];

    if (rows.length === 0) return [];

    const withEmbeddings = rows.filter(r => r.embedding !== null);

    let scored: ScoredDocument[];

    if (withEmbeddings.length > 0) {
      const queryEmbedding = await getEmbedding(query);
      if (queryEmbedding.length > 0) {
        scored = withEmbeddings.map(row => ({
          document: {
            id: row.id,
            text: row.text,
            metadata: JSON.parse(row.metadata) as Record<string, unknown>,
            embedding: JSON.parse(row.embedding!) as number[],
          },
          score: cosineSimilarity(queryEmbedding, JSON.parse(row.embedding!) as number[]),
        }));
      } else {
        scored = rows.map(row => ({
          document: {
            id: row.id,
            text: row.text,
            metadata: JSON.parse(row.metadata) as Record<string, unknown>,
          },
          score: textSimilarity(query, row.text),
        }));
      }
    } else {
      scored = rows.map(row => ({
        document: {
          id: row.id,
          text: row.text,
          metadata: JSON.parse(row.metadata) as Record<string, unknown>,
        },
        score: textSimilarity(query, row.text),
      }));
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, k);
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const ph = ids.map(() => '?').join(',');
    this.db.prepare(`DELETE FROM vector_chunks WHERE project = ? AND id IN (${ph})`).run(this.project, ...ids);
  }

  async clear(): Promise<void> {
    this.db.prepare(`DELETE FROM vector_chunks WHERE project = ?`).run(this.project);
  }

  size(): number {
    return (this.db.prepare(
      `SELECT COUNT(*) as c FROM vector_chunks WHERE project = ?`
    ).get(this.project) as { c: number }).c;
  }
}
