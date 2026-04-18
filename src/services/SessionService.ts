import { randomUUID } from 'crypto';
import { DatabaseManager } from '../db/DatabaseManager.js';
import { getFireCodeDir } from '../utils/paths.js';

export class SessionService {
  private db: DatabaseManager;
  private project: string;

  constructor(cwd: string, project: string) {
    this.db = DatabaseManager.getInstance(getFireCodeDir(cwd));
    this.project = project;
  }

  start(cwd: string): string {
    // Abandon any lingering active session
    const existing = this.db.getActiveSession(this.project);
    if (existing) {
      this.db.endSession(existing.id, 'abandoned');
    }
    const id = randomUUID();
    this.db.createSession(id, this.project, cwd);
    return id;
  }

  getOrCreate(cwd: string): string {
    const existing = this.db.getActiveSession(this.project);
    if (existing) return existing.id;
    return this.start(cwd);
  }

  end(sessionId: string): void {
    this.db.endSession(sessionId, 'completed');
  }

  getActiveId(): string | null {
    return this.db.getActiveSession(this.project)?.id ?? null;
  }
}
