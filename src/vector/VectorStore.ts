export interface Document {
  id: string;
  text: string;
  metadata: Record<string, unknown>;
  embedding?: number[];
}

export interface ScoredDocument {
  document: Document;
  score: number;
}

export interface VectorStore {
  add(documents: Document[]): Promise<void>;
  search(query: string, k?: number): Promise<ScoredDocument[]>;
  delete(ids: string[]): Promise<void>;
  clear(): Promise<void>;
  size(): number;
  serialize(): string;
}
