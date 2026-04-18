export const SCHEMA_SQL = `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT    PRIMARY KEY,
  project     TEXT    NOT NULL,
  cwd         TEXT    NOT NULL,
  started_at  INTEGER NOT NULL,
  ended_at    INTEGER,
  status      TEXT    NOT NULL DEFAULT 'active'  -- active | completed | abandoned
);

CREATE TABLE IF NOT EXISTS observations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT    NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  project     TEXT    NOT NULL,
  type        TEXT    NOT NULL DEFAULT 'change',  -- change | bugfix | feature | refactor | decision | discovery
  tool        TEXT,
  file_path   TEXT,
  summary     TEXT    NOT NULL,
  detail      TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS summaries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT    NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  project     TEXT    NOT NULL,
  content     TEXT    NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS file_index (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project     TEXT    NOT NULL,
  file_path   TEXT    NOT NULL,
  functions   TEXT,   -- JSON array of function names
  classes     TEXT,   -- JSON array of class names
  imports     TEXT,   -- JSON array of import paths
  indexed_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(project, file_path)
);

-- Full-text search on observations
CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
  summary, detail, file_path, type,
  content=observations,
  content_rowid=id
);

CREATE TRIGGER IF NOT EXISTS obs_fts_insert AFTER INSERT ON observations BEGIN
  INSERT INTO observations_fts(rowid, summary, detail, file_path, type)
  VALUES (new.id, new.summary, new.detail, new.file_path, new.type);
END;

CREATE TRIGGER IF NOT EXISTS obs_fts_delete AFTER DELETE ON observations BEGIN
  INSERT INTO observations_fts(observations_fts, rowid, summary, detail, file_path, type)
  VALUES ('delete', old.id, old.summary, old.detail, old.file_path, old.type);
END;

CREATE INDEX IF NOT EXISTS idx_obs_project    ON observations(project);
CREATE INDEX IF NOT EXISTS idx_obs_type       ON observations(type);
CREATE INDEX IF NOT EXISTS idx_obs_session    ON observations(session_id);
CREATE INDEX IF NOT EXISTS idx_obs_created    ON observations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_file       ON observations(file_path);
CREATE INDEX IF NOT EXISTS idx_sessions_proj  ON sessions(project);
CREATE INDEX IF NOT EXISTS idx_file_index     ON file_index(project, file_path);

-- Knowledge Corpus
CREATE TABLE IF NOT EXISTS corpus (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project     TEXT    NOT NULL,
  title       TEXT    NOT NULL,
  content     TEXT    NOT NULL,
  source      TEXT,   -- file path or URL
  tags        TEXT,   -- JSON array
  private     INTEGER NOT NULL DEFAULT 0,  -- 1 = never send to LLM
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(project, title)
);

CREATE VIRTUAL TABLE IF NOT EXISTS corpus_fts USING fts5(
  title, content, tags,
  content=corpus,
  content_rowid=id
);

CREATE TRIGGER IF NOT EXISTS corpus_fts_insert AFTER INSERT ON corpus BEGIN
  INSERT INTO corpus_fts(rowid, title, content, tags) VALUES (new.id, new.title, new.content, new.tags);
END;
CREATE TRIGGER IF NOT EXISTS corpus_fts_delete AFTER DELETE ON corpus BEGIN
  INSERT INTO corpus_fts(corpus_fts, rowid, title, content, tags) VALUES ('delete', old.id, old.title, old.content, old.tags);
END;

CREATE INDEX IF NOT EXISTS idx_corpus_project ON corpus(project);
CREATE INDEX IF NOT EXISTS idx_corpus_private ON corpus(project, private);

-- Dependency Graph
CREATE TABLE IF NOT EXISTS graph_nodes (
  id       TEXT NOT NULL,
  project  TEXT NOT NULL,
  type     TEXT NOT NULL,   -- file | function | commit
  label    TEXT NOT NULL,
  data     TEXT NOT NULL,   -- JSON blob of the full node
  PRIMARY KEY (project, id)
);

CREATE TABLE IF NOT EXISTS graph_edges (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  project  TEXT NOT NULL,
  from_id  TEXT NOT NULL,
  to_id    TEXT NOT NULL,
  type     TEXT NOT NULL,   -- imports | calls | extends | implements
  label    TEXT,
  UNIQUE(project, from_id, to_id, type)
);

CREATE INDEX IF NOT EXISTS idx_gnodes_project ON graph_nodes(project, type);
CREATE INDEX IF NOT EXISTS idx_gedges_from    ON graph_edges(project, from_id);
CREATE INDEX IF NOT EXISTS idx_gedges_to      ON graph_edges(project, to_id);
`;
