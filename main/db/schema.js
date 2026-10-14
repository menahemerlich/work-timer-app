const SCHEMA_VERSION = 6;

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

// Projects belong to an employer. billing_type is "hourly" (paid by the employer's
// hourly rate) or "fixed" (paid a fixed price per job; time is tracked but not paid by the hour).
const MIGRATION_V4 = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  employer_id TEXT NOT NULL,
  name TEXT NOT NULL,
  billing_type TEXT NOT NULL DEFAULT 'hourly',
  fixed_price REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_projects_employer_id ON projects(employer_id);

ALTER TABLE work_logs ADD COLUMN project_id TEXT;
ALTER TABLE work_logs ADD COLUMN project_name TEXT;
CREATE INDEX IF NOT EXISTS idx_work_logs_project_id ON work_logs(project_id);

ALTER TABLE timer_state ADD COLUMN project_id TEXT;
ALTER TABLE timer_state ADD COLUMN project_name TEXT;
`;

// billing_type "unit": paid per unit of work (e.g. per case). The count is kept per log.
const MIGRATION_V5 = `
ALTER TABLE projects ADD COLUMN unit_price REAL;
ALTER TABLE projects ADD COLUMN unit_name TEXT;
ALTER TABLE work_logs ADD COLUMN unit_count INTEGER;
ALTER TABLE timer_state ADD COLUMN unit_count INTEGER;
`;

// unit_open: the session ended with a unit (e.g. a case) still in progress.
// unit_singular: singular unit name ("תיק") next to the plural unit_name ("תיקים").
const MIGRATION_V6 = `
ALTER TABLE work_logs ADD COLUMN unit_open INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN unit_singular TEXT;
`;

module.exports = {
  SCHEMA_VERSION,
  MIGRATION_V1,
  MIGRATION_V2,
  MIGRATION_V3,
  MIGRATION_V4,
  MIGRATION_V5,
  MIGRATION_V6
};
