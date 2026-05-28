class SyncEngine {
  constructor({ localDb, supabase, syncQueue, onStatusChange }) {
    this.localDb = localDb;
    this.supabase = supabase;
    this.syncQueue = syncQueue;
    this.onStatusChange = onStatusChange;
    this.isSyncing = false;
    this.lastError = null;
    this.syncPending = false;
    this.pushTimer = null;
    this.pullTimer = null;
    this.inFullSync = false;
    this.isOnlineFn = () => true;
  }

  setNetworkMonitor(networkMonitor) {
    this.isOnlineFn = () => networkMonitor.isOnline;
  }

  getStatus() {
    const pending = this.syncQueue.getPendingCount();
    const failedCount = this.localDb.getFailedSyncCount();
    const queueError = this.localDb.getLastSyncError();
    const effectiveError = this.lastError || queueError;
    const hasSession = Boolean(this.supabase.getSession());
    const configured = this.supabase.isConfigured();
    const online = this.isOnlineFn();

    let state = "saved_local";

    if (!configured) {
      state = "local_only";
    } else if (!hasSession) {
      state = pending > 0 ? "pending_auth" : "local_only";
    } else if (effectiveError || failedCount > 0) {
      state = "error";
    } else if (this.isSyncing) {
      state = "syncing";
    } else if (pending > 0) {
      state = online ? "pending_sync" : "offline_pending";
    } else if (!online) {
      state = "saved_local";
    } else {
      state = "synced";
    }

    return {
      state,
      pendingCount: pending,
      failedCount,
      lastError: effectiveError,
      isConfigured: configured,
      hasSession,
      isOnline: online,
      lastPullAt: this.localDb.getMeta("last_pull_at"),
      lastPushAt: this.localDb.getMeta("last_push_at")
    };
  }

  notifyStatus() {
    this.onStatusChange?.(this.getStatus());
  }

  async processQueue() {
    if (this.isSyncing) {
      this.syncPending = true;
      return this.getStatus();
    }

    const userId = this.supabase.getUserId();
    if (!userId) {
      if (this.syncQueue.getPendingCount() > 0) {
        this.syncPending = true;
      }
      this.notifyStatus();
      return this.getStatus();
    }

    if (!this.isOnlineFn()) {
      this.syncPending = true;
      this.notifyStatus();
      return this.getStatus();
    }

    this.isSyncing = true;
    this.notifyStatus();

    let batchError = null;

    try {
      const pending = this.syncQueue.getPending();
      for (const item of pending) {
        try {
          await this.pushItem(userId, item);
          this.syncQueue.markSynced(item.id);
        } catch (error) {
          batchError = error.message;
          this.syncQueue.markFailed(item.id, error.message);
          console.error(`Sync push failed (${item.entity_type}/${item.operation}):`, error.message);
        }
      }

      const stillPending = this.syncQueue.getPendingCount();
      if (stillPending === 0) {
        this.lastError = null;
        this.localDb.setMeta("last_push_at", new Date().toISOString());
      } else {
        this.lastError = batchError || this.localDb.getLastSyncError();
      }
    } finally {
      this.isSyncing = false;
      this.notifyStatus();
      if (!this.inFullSync) {
        this.runPendingSync();
      }
    }

    return this.getStatus();
  }

  async pushItem(userId, item) {
    const { entity_type, operation, payload } = item;

    if (entity_type === "employer") {
      await this.supabase.pushEmployer(userId, payload, operation);
      return;
    }

    if (entity_type === "work_log") {
      let logPayload = payload;
      if (operation !== "delete") {
        logPayload = this.localDb.resolveLogEmployer(payload);
        if (logPayload.employerId) {
          await this.ensureEmployerInCloud(userId, logPayload.employerId);
        }
      }
      await this.supabase.pushWorkLog(userId, logPayload, operation);
      return;
    }

    if (entity_type === "app_settings") {
      await this.supabase.pushAppSetting(userId, {
        key: payload.key,
        value: payload.value,
        updatedAt: payload.updatedAt
      });
      return;
    }

    if (entity_type === "timer_state") {
      await this.supabase.pushTimerState(userId, payload, operation);
    }
  }

  async ensureEmployerInCloud(userId, employerId) {
    const local = this.localDb.getEmployerById(employerId);
    if (!local) {
      throw new Error(`מעסיק ${employerId} לא נמצא מקומית`);
    }

    await this.supabase.pushEmployer(
      userId,
      {
        id: local.id,
        name: local.name,
        createdAt: local.createdAt,
        color: local.color,
        hourlyRate: local.hourlyRate ?? null,
        updatedAt: local.updatedAt || new Date().toISOString()
      },
      "upsert"
    );
  }

  async pullRemote({ throwOnError = false } = {}) {
    const userId = this.supabase.getUserId();
    if (!userId || !this.isOnlineFn()) {
      return this.getStatus();
    }

    this.isSyncing = true;
    this.notifyStatus();

    try {
      const since = this.localDb.getMeta("last_pull_at", "1970-01-01T00:00:00.000Z");
      const remote = await this.supabase.pullChanges(userId, since);

      remote.employers.forEach((row) => {
        const localUpdated = this.findLocalUpdated("employer", row.id);
        if (!localUpdated || new Date(row.updated_at) >= new Date(localUpdated)) {
          if (row.deleted_at) {
            this.localDb.deleteEmployer(row.id, { enqueue: false });
          } else {
            this.localDb.upsertEmployer(
              {
                id: row.id,
                name: row.name,
                createdAt: row.created_at,
                color: row.color,
                hourlyRate: row.hourly_rate ?? null
              },
              { enqueue: false }
            );
          }
        }
      });

      remote.workLogs.forEach((row) => {
        const localUpdated = this.findLocalUpdated("work_log", row.id);
        if (!localUpdated || new Date(row.updated_at) >= new Date(localUpdated)) {
          if (row.deleted_at) {
            this.localDb.deleteLog(row.id, { enqueue: false });
          } else {
            this.localDb.upsertLog(
              {
                id: row.id,
                date: row.date,
                start: row.start_time,
                end: row.end_time,
                durationMs: row.duration_ms,
                durationStr: row.duration_str,
                employerId: row.employer_id,
                employerName: row.employer_name,
                note: row.note
              },
              { enqueue: false }
            );
          }
        }
      });

      remote.appSettings.forEach((row) => {
        const key = row.key;
        let value = row.value;
        try {
          value = JSON.parse(row.value);
        } catch {
          // keep raw
        }

        if (key === "lastSelectedEmployerId") {
          this.localDb.saveSettings({ lastSelectedEmployerId: value || null }, { enqueue: false });
        }
        if (key === "monthlyTargetDays") {
          const num = value === "" || value === null ? null : Number(value);
          this.localDb.saveSettings(
            { monthlyTargetDays: Number.isFinite(num) ? num : null },
            { enqueue: false }
          );
        }
        if (key === "monthlyTargetHoursPerDay") {
          const num = value === "" || value === null ? null : Number(value);
          this.localDb.saveSettings(
            { monthlyTargetHoursPerDay: Number.isFinite(num) ? num : null },
            { enqueue: false }
          );
        }
      });

      if (remote.timerState) {
        this.localDb.saveTimerState(
          {
            elapsedMs: remote.timerState.elapsed_ms,
            isPaused: remote.timerState.is_paused,
            isRunning: remote.timerState.is_running,
            employerId: remote.timerState.employer_id,
            employerName: remote.timerState.employer_name,
            originalStartTime: remote.timerState.original_start_time,
            segmentStartTime: remote.timerState.segment_start_time,
            sessionNote: remote.timerState.session_note
          },
          { enqueue: false, runtime: true }
        );
      }

      this.localDb.setMeta("last_pull_at", new Date().toISOString());
    } catch (error) {
      this.lastError = error.message;
      console.error("Pull remote failed:", error.message);
      if (throwOnError) {
        throw new Error(error.message || "Pull remote failed");
      }
    } finally {
      this.isSyncing = false;
      this.notifyStatus();
      if (!this.inFullSync) {
        this.runPendingSync();
      }
    }

    return this.getStatus();
  }

  findLocalUpdated(entityType, entityId) {
    if (entityType === "employer") {
      const row = this.localDb.getAllEmployers(true).find((item) => item.id === entityId);
      return row?.updatedAt || null;
    }
    if (entityType === "work_log") {
      const row = this.localDb.getAllLogs(true).find((item) => item.id === entityId);
      return row?.updatedAt || null;
    }
    return null;
  }

  async fullSync() {
    this.inFullSync = true;
    try {
      await this.processQueue();
      await this.pullRemote();
    } finally {
      this.inFullSync = false;
      this.runPendingSync();
    }
    return this.getStatus();
  }

  async hardPullReplaceLocal() {
    const userId = this.supabase.getUserId();
    if (!userId) {
      throw new Error("יש להתחבר לענן לפני משיכת נתונים.");
    }
    if (!this.isOnlineFn()) {
      throw new Error("אין חיבור לאינטרנט — לא ניתן למשוך מהענן.");
    }

    this.isSyncing = true;
    this.notifyStatus();
    try {
      this.localDb.hardResetLocalDataForCloudPull({ userId });
      await this.pullRemote({ throwOnError: true });
    } finally {
      this.isSyncing = false;
      this.notifyStatus();
    }
    return this.getStatus();
  }

  async onNetworkOnline() {
    await this.fullSync();
  }

  scheduleSync() {
    this.syncPending = true;
    this.runPendingSync();
  }

  runPendingSync() {
    if (!this.syncPending || this.isSyncing) {
      return;
    }

    this.syncPending = false;
    this.processQueue().catch((error) => {
      this.lastError = error.message;
      this.notifyStatus();
    });
  }

  startPeriodicSync({ isOnlineFn, hasSessionFn, pushIntervalMs = 15000, pullIntervalMs = 120000 }) {
    this.stopPeriodicSync();

    this.pushTimer = setInterval(() => {
      if (!isOnlineFn() || !hasSessionFn()) {
        return;
      }

      if (this.syncQueue.getPendingCount() > 0) {
        this.scheduleSync();
      }
    }, pushIntervalMs);

    this.pullTimer = setInterval(() => {
      if (!isOnlineFn() || !hasSessionFn()) {
        return;
      }

      this.pullRemote().catch((error) => {
        console.error("Periodic pull failed:", error);
      });
    }, pullIntervalMs);
  }

  stopPeriodicSync() {
    if (this.pushTimer) {
      clearInterval(this.pushTimer);
      this.pushTimer = null;
    }

    if (this.pullTimer) {
      clearInterval(this.pullTimer);
      this.pullTimer = null;
    }
  }

  async bootstrapLocalDataToCloud(userId) {
    if (!userId || this.localDb.wasCloudBootstrapped(userId)) {
      return;
    }

    this.localDb.enqueueAllLocalDataForSync();
    this.localDb.markCloudBootstrapped(userId);
    await this.processQueue();
  }
}

module.exports = { SyncEngine };
