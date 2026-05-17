import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, rmSync } from 'fs';
import { DatabaseManager } from '../../../src/db/DatabaseManager';

describe('DatabaseManager', () => {
  let tmpDir: string;

  beforeEach(() => {
    DatabaseManager.reset();
    tmpDir = join(tmpdir(), `fc-db-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    DatabaseManager.reset();
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* cleanup */ }
  });

  // ── Singleton ──────────────────────────────────────────────────────────────

  test('getInstance returns the same instance on repeated calls', () => {
    const a = DatabaseManager.getInstance(tmpDir);
    const b = DatabaseManager.getInstance(tmpDir);
    expect(a).toBe(b);
  });

  test('reset clears the singleton so a new instance is created', () => {
    const a = DatabaseManager.getInstance(tmpDir);
    DatabaseManager.reset();
    const b = DatabaseManager.getInstance(tmpDir);
    expect(a).not.toBe(b);
  });

  // ── Project Metadata ───────────────────────────────────────────────────────

  test('getProjectMeta returns null for unknown project/key', () => {
    const db = DatabaseManager.getInstance(tmpDir);
    expect(db.getProjectMeta('proj', 'nonexistent')).toBeNull();
  });

  test('setProjectMeta and getProjectMeta round-trip correctly', () => {
    const db = DatabaseManager.getInstance(tmpDir);
    db.setProjectMeta('my-project', 'indexed_at_hash', 'abc123def456');
    expect(db.getProjectMeta('my-project', 'indexed_at_hash')).toBe('abc123def456');
  });

  test('setProjectMeta overwrites an existing value for the same key', () => {
    const db = DatabaseManager.getInstance(tmpDir);
    db.setProjectMeta('proj', 'hash', 'first');
    db.setProjectMeta('proj', 'hash', 'second');
    expect(db.getProjectMeta('proj', 'hash')).toBe('second');
  });

  test('project metadata is scoped — different projects do not share keys', () => {
    const db = DatabaseManager.getInstance(tmpDir);
    db.setProjectMeta('proj-a', 'hash', 'aaaa');
    db.setProjectMeta('proj-b', 'hash', 'bbbb');
    expect(db.getProjectMeta('proj-a', 'hash')).toBe('aaaa');
    expect(db.getProjectMeta('proj-b', 'hash')).toBe('bbbb');
    expect(db.getProjectMeta('proj-a', 'missing')).toBeNull();
  });

  test('multiple keys per project are stored independently', () => {
    const db = DatabaseManager.getInstance(tmpDir);
    db.setProjectMeta('proj', 'indexed_at_hash', 'hash-value');
    db.setProjectMeta('proj', 'indexed_at', '1700000000000');
    expect(db.getProjectMeta('proj', 'indexed_at_hash')).toBe('hash-value');
    expect(db.getProjectMeta('proj', 'indexed_at')).toBe('1700000000000');
  });

  // ── Sessions ───────────────────────────────────────────────────────────────

  test('createSession and getSession round-trip', () => {
    const db = DatabaseManager.getInstance(tmpDir);
    db.createSession('sess-1', 'my-project', tmpDir);
    const session = db.getSession('sess-1');
    expect(session).not.toBeNull();
    expect(session!.project).toBe('my-project');
    expect(session!.status).toBe('active');
  });

  test('endSession marks session as completed', () => {
    const db = DatabaseManager.getInstance(tmpDir);
    db.createSession('sess-2', 'proj', tmpDir);
    db.endSession('sess-2', 'completed');
    const session = db.getSession('sess-2');
    expect(session!.status).toBe('completed');
    expect(session!.ended_at).not.toBeNull();
  });

  // ── Vector / Graph stores ──────────────────────────────────────────────────

  test('getVectorStore returns a store with size 0 initially', () => {
    const db = DatabaseManager.getInstance(tmpDir);
    const vs = db.getVectorStore('proj');
    expect(vs.size()).toBe(0);
  });

  test('getGraphStore returns a store with 0 nodes initially', () => {
    const db = DatabaseManager.getInstance(tmpDir);
    const gs = db.getGraphStore('proj');
    expect(gs.getStats().nodes).toBe(0);
  });
});
