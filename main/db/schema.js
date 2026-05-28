const SCHEMA_VERSION = 3;

const MIGRATION_V1 = `
CREATE TABLE IF NOT EXISTS employers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  color TEXT,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS work_logs (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  duration_str TEXT NOT NULL,
  employer_id TEXT,
  employer_name TEXT NOT NULL,
  note TEXT DEFAULT '',
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (employer_id) REFERENCES employers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_work_logs_date ON work_logs(date);
CREATE INDEX IF NOT EXISTS idx_work_logs_employer_id ON work_logs(employer_id);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS timer_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  elapsed_ms INTEGER NOT NULL DEFAULT 0,
  is_paused INTEGER NOT NULL DEFAULT 0,
  is_running INTEGER NOT NULL DEFAULT 0,
  employer_id TEXT,
  employer_name TEXT,
  original_start_time TEXT,
  segment_start_time TEXT,
  session_note TEXT DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  synced_at TEXT,
  retry_count INTEGER DEFAULT 0,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_pending ON sync_queue(synced_at);

CREATE TABLE IF NOT EXISTS sync_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY
);
`;

const MIGRATION_V2 = `
CREATE TABLE IF NOT EXISTS employers_v2 (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  color TEXT,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

INSERT INTO employers_v2 (id, name, created_at, color, updated_at, deleted_at)
SELECT id, name, created_at, color, updated_at, deleted_at FROM employers;

DROP TABLE employers;
ALTER TABLE employers_v2 RENAME TO employers;

CREATE UNIQUE INDEX IF NOT EXISTS idx_employers_name_active
  ON employers(name) WHERE deleted_at IS NULL;
`;

const MIGRATION_V3 = `
ALTER TABLE employers ADD COLUMN hourly_rate REAL;
`;

module.exports = { SCHEMA_VERSION, MIGRATION_V1, MIGRATION_V2, MIGRATION_V3 };
