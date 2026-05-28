const Database = require("better-sqlite3");
const path = require("path");
const { MIGRATION_V1, MIGRATION_V2, MIGRATION_V3 } = require("./schema");

function nowIso() {
  return new Date().toISOString();
}

class LocalDatabaseService {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
  }

  init() {
    if (this.db) {
      return;
    }

    this.db = new Database(this.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.runMigrations();
  }

  runMigrations() {
    this.db.exec(MIGRATION_V1);

    let row = this.db.prepare("SELECT version FROM schema_version LIMIT 1").get();
    if (!row) {
      this.db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(1);
      row = { version: 1 };
    }

    if (row.version < 2) {
      this.db.exec(MIGRATION_V2);
      this.db.prepare("UPDATE schema_version SET version = ?").run(2);
    }

    row = this.db.prepare("SELECT version FROM schema_version LIMIT 1").get() || row;
    if (row.version < 3) {
      this.db.exec(MIGRATION_V3);
      this.db.prepare("UPDATE schema_version SET version = ?").run(3);
    }
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  getMeta(key, defaultValue = null) {
    const row = this.db.prepare("SELECT value FROM sync_metadata WHERE key = ?").get(key);
    return row ? row.value : defaultValue;
  }

  setMeta(key, value) {
    this.db
      .prepare(
        `INSERT INTO sync_metadata (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(key, value);
  }

  enqueueSync(entityType, entityId, operation, payload) {
    this.db
      .prepare(
        `INSERT INTO sync_queue (entity_type, entity_id, operation, payload, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(entityType, entityId, operation, JSON.stringify(payload), nowIso());
  }

  getPendingSyncItems() {
    return this.db
      .prepare(
        `SELECT id, entity_type, entity_id, operation, payload, created_at, retry_count, last_error
         FROM sync_queue WHERE synced_at IS NULL ORDER BY id ASC`
      )
      .all()
      .map((row) => ({
        ...row,
        payload: JSON.parse(row.payload)
      }));
  }

  getPendingSyncCount() {
    const row = this.db
      .prepare("SELECT COUNT(*) AS count FROM sync_queue WHERE synced_at IS NULL")
      .get();
    return row.count;
  }

  getFailedSyncCount() {
    const row = this.db
      .prepare(
        "SELECT COUNT(*) AS count FROM sync_queue WHERE synced_at IS NULL AND retry_count > 0"
      )
      .get();
    return row.count;
  }

  getLastSyncError() {
    const row = this.db
      .prepare(
        `SELECT last_error FROM sync_queue
         WHERE synced_at IS NULL AND last_error IS NOT NULL
         ORDER BY id DESC LIMIT 1`
      )
      .get();
    return row?.last_error || null;
  }

  purgeSoftDeletedEmployerByName(name) {
    this.db
      .prepare("DELETE FROM employers WHERE name = ? AND deleted_at IS NOT NULL")
      .run(name);
  }

  markSyncItemSynced(id) {
    this.db.prepare("UPDATE sync_queue SET synced_at = ? WHERE id = ?").run(nowIso(), id);
  }

  markSyncItemFailed(id, error) {
    this.db
      .prepare(
        `UPDATE sync_queue SET retry_count = retry_count + 1, last_error = ? WHERE id = ?`
      )
      .run(String(error), id);
  }

  getAllEmployers(includeDeleted = false) {
    const sql = includeDeleted
      ? "SELECT * FROM employers ORDER BY name COLLATE NOCASE"
      : "SELECT * FROM employers WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE";
    return this.db.prepare(sql).all().map(mapEmployerRow);
  }

  getEmployerById(id) {
    const row = this.db.prepare("SELECT * FROM employers WHERE id = ? AND deleted_at IS NULL").get(id);
    return row ? mapEmployerRow(row) : null;
  }

  findEmployerIdByName(name) {
    if (!name) {
      return null;
    }

    const row = this.db
      .prepare(
        `SELECT id FROM employers
         WHERE deleted_at IS NULL AND LOWER(TRIM(name)) = LOWER(TRIM(?))`
      )
      .get(name);
    return row?.id || null;
  }

  resolveLogEmployer(log) {
    const employerName = log.employerName || null;
    let employerId = log.employerId || null;

    if (employerId) {
      const exists = this.db
        .prepare("SELECT id FROM employers WHERE id = ? AND deleted_at IS NULL")
        .get(employerId);
      if (!exists) {
        employerId = this.findEmployerIdByName(employerName);
      }
    } else if (employerName) {
      employerId = this.findEmployerIdByName(employerName);
    }

    if (!employerId && employerName) {
      throw new Error(`המעסיק "${employerName}" לא נמצא במערכת.`);
    }

    return {
      ...log,
      employerId,
      employerName: employerName || log.employerName
    };
  }

  upsertEmployer(employer, { enqueue = true } = {}) {
    const ts = nowIso();
    this.purgeSoftDeletedEmployerByName(employer.name);

    this.db
      .prepare(
        `INSERT INTO employers (id, name, created_at, color, hourly_rate, updated_at, deleted_at)
         VALUES (@id, @name, @created_at, @color, @hourly_rate, @updated_at, NULL)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           color = excluded.color,
           hourly_rate = excluded.hourly_rate,
           updated_at = excluded.updated_at,
           deleted_at = NULL`
      )
      .run({
        id: employer.id,
        name: employer.name,
        created_at: employer.createdAt || ts,
        color: employer.color || null,
        hourly_rate: employer.hourlyRate ?? null,
        updated_at: ts
      });

    if (enqueue) {
      this.enqueueSync("employer", employer.id, "upsert", {
        ...employer,
        updatedAt: ts
      });
    }
    return employer;
  }

  deleteEmployer(id, { enqueue = true } = {}) {
    const ts = nowIso();
    this.db
      .prepare("UPDATE employers SET deleted_at = ?, updated_at = ? WHERE id = ?")
      .run(ts, ts, id);

    if (enqueue) {
      this.enqueueSync("employer", id, "delete", { id, deletedAt: ts });
    }
  }

  getAllLogs(includeDeleted = false) {
    const sql = includeDeleted
      ? "SELECT * FROM work_logs ORDER BY date DESC, start_time DESC"
      : "SELECT * FROM work_logs WHERE deleted_at IS NULL ORDER BY date DESC, start_time DESC";
    return this.db.prepare(sql).all().map(mapLogRow);
  }

  upsertLog(log, { enqueue = true } = {}) {
    const resolved = this.resolveLogEmployer(log);
    const ts = nowIso();

    this.db
      .prepare(
        `INSERT INTO work_logs (
          id, date, start_time, end_time, duration_ms, duration_str,
          employer_id, employer_name, note, updated_at, deleted_at
        ) VALUES (
          @id, @date, @start, @end, @duration_ms, @duration_str,
          @employer_id, @employer_name, @note, @updated_at, NULL
        )
        ON CONFLICT(id) DO UPDATE SET
          date = excluded.date,
          start_time = excluded.start_time,
          end_time = excluded.end_time,
          duration_ms = excluded.duration_ms,
          duration_str = excluded.duration_str,
          employer_id = excluded.employer_id,
          employer_name = excluded.employer_name,
          note = excluded.note,
          updated_at = excluded.updated_at,
          deleted_at = NULL`
      )
      .run({
        id: resolved.id,
        date: resolved.date,
        start: resolved.start,
        end: resolved.end,
        duration_ms: resolved.durationMs,
        duration_str: resolved.durationStr,
        employer_id: resolved.employerId || null,
        employer_name: resolved.employerName,
        note: resolved.note || "",
        updated_at: ts
      });

    const saved = {
      id: resolved.id,
      date: resolved.date,
      start: resolved.start,
      end: resolved.end,
      durationMs: resolved.durationMs,
      durationStr: resolved.durationStr,
      employerId: resolved.employerId || null,
      employerName: resolved.employerName,
      note: resolved.note || "",
      updatedAt: ts
    };

    if (enqueue) {
      this.enqueueSync("work_log", resolved.id, "upsert", saved);
    }

    return saved;
  }

  deleteLog(id, { enqueue = true } = {}) {
    const ts = nowIso();
    this.db
      .prepare("UPDATE work_logs SET deleted_at = ?, updated_at = ? WHERE id = ?")
      .run(ts, ts, id);

    if (enqueue) {
      this.enqueueSync("work_log", id, "delete", { id, deletedAt: ts });
    }
  }

  clearLogs({ enqueue = true } = {}) {
    const ts = nowIso();
    const ids = this.db
      .prepare("SELECT id FROM work_logs WHERE deleted_at IS NULL")
      .all()
      .map((row) => row.id);

    this.db.prepare("UPDATE work_logs SET deleted_at = ?, updated_at = ? WHERE deleted_at IS NULL").run(ts, ts);

    if (enqueue) {
      ids.forEach((id) => {
        this.enqueueSync("work_log", id, "delete", { id, deletedAt: ts });
      });
    }
  }

  getSettings() {
    const rows = this.db.prepare("SELECT key, value FROM app_settings").all();
    const settings = {
      employers: [],
      lastSelectedEmployerId: null,
      monthlyTargetDays: null,
      monthlyTargetHoursPerDay: null
    };
    settings.employers = this.getAllEmployers();

    rows.forEach((row) => {
      if (row.key === "lastSelectedEmployerId") {
        settings.lastSelectedEmployerId = row.value || null;
      }
      if (row.key === "monthlyTargetDays") {
        settings.monthlyTargetDays = row.value ? Number(row.value) : null;
      }
      if (row.key === "monthlyTargetHoursPerDay") {
        settings.monthlyTargetHoursPerDay = row.value ? Number(row.value) : null;
      }
    });

    return settings;
  }

  saveSettings(settings, { enqueue = true } = {}) {
    const ts = nowIso();

    if (settings.lastSelectedEmployerId !== undefined) {
      this.db
        .prepare(
          `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
        )
        .run("lastSelectedEmployerId", settings.lastSelectedEmployerId || "", ts);

      if (enqueue) {
        this.enqueueSync("app_settings", "lastSelectedEmployerId", "upsert", {
          key: "lastSelectedEmployerId",
          value: settings.lastSelectedEmployerId || null,
          updatedAt: ts
        });
      }
    }

    if (settings.monthlyTargetDays !== undefined) {
      const value = settings.monthlyTargetDays === null ? "" : String(settings.monthlyTargetDays);
      this.db
        .prepare(
          `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
        )
        .run("monthlyTargetDays", value, ts);

      if (enqueue) {
        this.enqueueSync("app_settings", "monthlyTargetDays", "upsert", {
          key: "monthlyTargetDays",
          value: settings.monthlyTargetDays,
          updatedAt: ts
        });
      }
    }

    if (settings.monthlyTargetHoursPerDay !== undefined) {
      const value =
        settings.monthlyTargetHoursPerDay === null ? "" : String(settings.monthlyTargetHoursPerDay);
      this.db
        .prepare(
          `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
        )
        .run("monthlyTargetHoursPerDay", value, ts);

      if (enqueue) {
        this.enqueueSync("app_settings", "monthlyTargetHoursPerDay", "upsert", {
          key: "monthlyTargetHoursPerDay",
          value: settings.monthlyTargetHoursPerDay,
          updatedAt: ts
        });
      }
    }
  }

  loadTimerState() {
    const row = this.db.prepare("SELECT * FROM timer_state WHERE id = 1").get();
    if (!row) {
      return null;
    }
    return mapTimerRow(row);
  }

  saveTimerState(state, { enqueue = true, runtime = false } = {}) {
    const ts = nowIso();
    const payload = {
      elapsedMs: state.elapsedMs || 0,
      isPaused: !!state.isPaused,
      isRunning: !!state.isRunning,
      employerId: state.employerId || null,
      employerName: state.employerName || null,
      originalStartTime: runtime ? state.originalStartTime : null,
      segmentStartTime: runtime ? state.segmentStartTime : null,
      sessionNote: state.sessionNote || ""
    };

    this.db
      .prepare(
        `INSERT INTO timer_state (
          id, elapsed_ms, is_paused, is_running, employer_id, employer_name,
          original_start_time, segment_start_time, session_note, updated_at
        ) VALUES (
          1, @elapsed_ms, @is_paused, @is_running, @employer_id, @employer_name,
          @original_start_time, @segment_start_time, @session_note, @updated_at
        )
        ON CONFLICT(id) DO UPDATE SET
          elapsed_ms = excluded.elapsed_ms,
          is_paused = excluded.is_paused,
          is_running = excluded.is_running,
          employer_id = excluded.employer_id,
          employer_name = excluded.employer_name,
          original_start_time = excluded.original_start_time,
          segment_start_time = excluded.segment_start_time,
          session_note = excluded.session_note,
          updated_at = excluded.updated_at`
      )
      .run({
        elapsed_ms: payload.elapsedMs,
        is_paused: payload.isPaused ? 1 : 0,
        is_running: payload.isRunning ? 1 : 0,
        employer_id: payload.employerId,
        employer_name: payload.employerName,
        original_start_time: payload.originalStartTime
          ? new Date(payload.originalStartTime).toISOString()
          : null,
        segment_start_time: payload.segmentStartTime
          ? new Date(payload.segmentStartTime).toISOString()
          : null,
        session_note: payload.sessionNote,
        updated_at: ts
      });

    if (enqueue && !runtime) {
      this.enqueueSync("timer_state", "1", "upsert", { ...payload, updatedAt: ts });
    }
  }

  clearTimerState({ enqueue = true } = {}) {
    this.db.prepare("DELETE FROM timer_state WHERE id = 1").run();
    if (enqueue) {
      this.enqueueSync("timer_state", "1", "delete", { id: "1" });
    }
  }

  hardResetLocalDataForCloudPull({ userId = null } = {}) {
    const tx = this.db.transaction(() => {
      // Clear user data
      this.db.prepare("DELETE FROM work_logs").run();
      this.db.prepare("DELETE FROM employers").run();
      this.db.prepare("DELETE FROM app_settings").run();
      this.db.prepare("DELETE FROM timer_state").run();

      // Clear sync queue + metadata so local won't re-push old data
      this.db.prepare("DELETE FROM sync_queue").run();
      this.db.prepare("DELETE FROM sync_metadata").run();

      if (userId) {
        this.setMeta(`cloud_bootstrapped_${userId}`, "1");
      }

      this.setMeta("last_pull_at", "1970-01-01T00:00:00.000Z");
    });
    tx();
  }

  importFromLegacy({ employers, logs, settings, timerState }) {
    const importTransaction = this.db.transaction(() => {
      employers.forEach((employer) => this.upsertEmployer(employer, { enqueue: false }));
      logs.forEach((log) => this.upsertLog(log, { enqueue: false }));
      if (settings) {
        this.saveSettings(settings, { enqueue: false });
      }
      if (timerState) {
        this.saveTimerState(timerState, { enqueue: false, runtime: true });
      }
    });
    importTransaction();
    this.setMeta("local_storage_imported_at", nowIso());
  }

  wasLegacyImported() {
    return Boolean(this.getMeta("local_storage_imported_at"));
  }

  enqueueAllLocalDataForSync() {
    const ts = nowIso();

    this.getAllEmployers().forEach((employer) => {
      this.enqueueSync("employer", employer.id, "upsert", {
        id: employer.id,
        name: employer.name,
        createdAt: employer.createdAt,
        color: employer.color,
        updatedAt: employer.updatedAt || ts
      });
    });

    this.getAllLogs().forEach((log) => {
      this.enqueueSync("work_log", log.id, "upsert", {
        id: log.id,
        date: log.date,
        start: log.start,
        end: log.end,
        durationMs: log.durationMs,
        durationStr: log.durationStr,
        employerId: log.employerId,
        employerName: log.employerName,
        note: log.note,
        updatedAt: log.updatedAt || ts
      });
    });

    const settings = this.getSettings();
    if (settings.lastSelectedEmployerId) {
      this.enqueueSync("app_settings", "lastSelectedEmployerId", "upsert", {
        key: "lastSelectedEmployerId",
        value: settings.lastSelectedEmployerId,
        updatedAt: ts
      });
    }

    const timerState = this.loadTimerState();
    if (timerState) {
      this.enqueueSync("timer_state", "1", "upsert", {
        ...timerState,
        updatedAt: ts
      });
    }
  }

  wasCloudBootstrapped(userId) {
    return this.getMeta(`cloud_bootstrapped_${userId}`) === "1";
  }

  markCloudBootstrapped(userId) {
    this.setMeta(`cloud_bootstrapped_${userId}`, "1");
  }
}

function mapEmployerRow(row) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    color: row.color,
    hourlyRate: row.hourly_rate ?? null,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at
  };
}

function mapLogRow(row) {
  return {
    id: row.id,
    date: row.date,
    start: row.start_time,
    end: row.end_time,
    durationMs: row.duration_ms,
    durationStr: row.duration_str,
    employerId: row.employer_id,
    employerName: row.employer_name,
    note: row.note || "",
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at
  };
}

function mapTimerRow(row) {
  return {
    elapsedMs: row.elapsed_ms,
    isPaused: !!row.is_paused,
    isRunning: !!row.is_running,
    employerId: row.employer_id,
    employerName: row.employer_name,
    originalStartTime: row.original_start_time ? new Date(row.original_start_time) : null,
    segmentStartTime: row.segment_start_time ? new Date(row.segment_start_time) : null,
    sessionNote: row.session_note || ""
  };
}

function createLocalDatabase(userDataPath) {
  const dbPath = path.join(userDataPath, "worktimer.db");
  const service = new LocalDatabaseService(dbPath);
  service.init();
  return service;
}

module.exports = { LocalDatabaseService, createLocalDatabase };
