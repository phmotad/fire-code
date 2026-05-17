// FTS5 is not compiled into sql.js — text search uses LIKE queries instead.
export const SCHEMA_SQL = `
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT    PRIMARY KEY,
  project     TEXT    NOT NULL,
  cwd         TEXT    NOT NULL,
  started_at  INTEGER NOT NULL,
  ended_at    INTEGER,
  status      TEXT    NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS observations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT    NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  project     TEXT    NOT NULL,
  type        TEXT    NOT NULL DEFAULT 'change',
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
  functions   TEXT,
  classes     TEXT,
  imports     TEXT,
  indexed_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(project, file_path)
);

CREATE INDEX IF NOT EXISTS idx_obs_project    ON observations(project);
CREATE INDEX IF NOT EXISTS idx_obs_type       ON observations(type);
CREATE INDEX IF NOT EXISTS idx_obs_session    ON observations(session_id);
CREATE INDEX IF NOT EXISTS idx_obs_created    ON observations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_file       ON observations(file_path);
CREATE INDEX IF NOT EXISTS idx_sessions_proj  ON sessions(project);
CREATE INDEX IF NOT EXISTS idx_file_index     ON file_index(project, file_path);

CREATE TABLE IF NOT EXISTS corpus (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project     TEXT    NOT NULL,
  title       TEXT    NOT NULL,
  content     TEXT    NOT NULL,
  source      TEXT,
  tags        TEXT,
  private     INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(project, title)
);

CREATE INDEX IF NOT EXISTS idx_corpus_project ON corpus(project);
CREATE INDEX IF NOT EXISTS idx_corpus_private ON corpus(project, private);

CREATE TABLE IF NOT EXISTS graph_nodes (
  id       TEXT NOT NULL,
  project  TEXT NOT NULL,
  type     TEXT NOT NULL,
  label    TEXT NOT NULL,
  data     TEXT NOT NULL,
  PRIMARY KEY (project, id)
);

CREATE TABLE IF NOT EXISTS graph_edges (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  project  TEXT NOT NULL,
  from_id  TEXT NOT NULL,
  to_id    TEXT NOT NULL,
  type     TEXT NOT NULL,
  label    TEXT,
  UNIQUE(project, from_id, to_id, type)
);

CREATE INDEX IF NOT EXISTS idx_gnodes_project ON graph_nodes(project, type);
CREATE INDEX IF NOT EXISTS idx_gedges_from    ON graph_edges(project, from_id);
CREATE INDEX IF NOT EXISTS idx_gedges_to      ON graph_edges(project, to_id);

CREATE TABLE IF NOT EXISTS vector_chunks (
  id        TEXT    NOT NULL,
  project   TEXT    NOT NULL,
  text      TEXT    NOT NULL,
  metadata  TEXT    NOT NULL,
  embedding TEXT,
  PRIMARY KEY (project, id)
);

CREATE INDEX IF NOT EXISTS idx_vchunks_project ON vector_chunks(project);

CREATE TABLE IF NOT EXISTS project_metadata (
  project TEXT NOT NULL,
  key     TEXT NOT NULL,
  value   TEXT NOT NULL,
  PRIMARY KEY (project, key)
);
`;
