import { join } from 'path';
import { indexProject } from '../../src/indexing/Indexer';
import { DatabaseManager } from '../../src/db/DatabaseManager';
import { getDefaults } from '../../src/config/defaults';
import { existsSync, rmSync } from 'fs';
import { getFireCodeDir } from '../../src/utils/paths';

const FIXTURE_DIR = join(__dirname, '../fixtures/sample-project');

afterAll(() => {
  DatabaseManager.reset(); // closes DB handle before deleting the directory
  const dir = getFireCodeDir(FIXTURE_DIR);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

describe('indexProject (integration)', () => {
  it('indexes sample project and produces graph (SQLite) + vectors', async () => {
    const config = getDefaults();
    config.indexing.mode = 'full';
    config.indexing.include = ['**/*.ts'];
    config.indexing.exclude = [];

    const db = DatabaseManager.getInstance(getFireCodeDir(FIXTURE_DIR));
    const graphStore = db.getGraphStore('sample-project');
    const vectorStore = db.getVectorStore('sample-project');

    const result = await indexProject(FIXTURE_DIR, config, graphStore, vectorStore);

    expect(result.filesIndexed).toBeGreaterThanOrEqual(2);
    expect(result.functionsFound).toBeGreaterThanOrEqual(3);
    expect(result.nodesCreated).toBeGreaterThan(0);
    expect(result.embeddingsGenerated).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThan(0);

    // Verify graph has file nodes in SQLite
    const files = graphStore.query({ type: 'file' });
    expect(files.length).toBeGreaterThanOrEqual(2);

    // vectors are now in firecode.db (SQLite) — no separate vectors.db file
    expect(vectorStore.size()).toBeGreaterThan(0);
    expect(existsSync(join(FIXTURE_DIR, '.firecode', 'bootstrap.log'))).toBe(true);
    expect(existsSync(join(FIXTURE_DIR, '.firecode', 'firecode.db'))).toBe(true);
  }, 30000);
});
