import { STORAGE_KEYS } from "../../../../shared/constants/storageKeys.js";
import { WorkLog } from "../../core/models/WorkLog.js";

function getApi() {
  return window.electronAPI?.db?.logs;
}

export class LogRepository {
  constructor() {
    this.logs = [];
    this.initialized = false;
  }

  async init() {
    const api = getApi();
    if (!api) {
      this.initialized = true;
      return;
    }

    const rows = await api.getAll();
    this.logs = rows.map((item) => WorkLog.fromJSON(item));
    this.initialized = true;
  }

  async reload() {
    await this.init();
  }

  getAll() {
    return [...this.logs];
  }

  saveAll(logs) {
    logs.forEach((log) => {
      this.upsertLocal(log);
      getApi()?.upsert(log.toJSON()).catch(console.error);
    });
    this.logs = logs.map((log) => WorkLog.fromJSON(log.toJSON ? log.toJSON() : log));
  }

  upsertLocal(log) {
    const index = this.logs.findIndex((item) => item.id === log.id);
    if (index >= 0) {
      this.logs[index] = WorkLog.fromJSON(log.toJSON ? log.toJSON() : log);
    } else {
      this.logs.push(WorkLog.fromJSON(log.toJSON ? log.toJSON() : log));
    }
  }

  async add(log) {
    this.upsertLocal(log);
    const api = getApi();
    if (!api) {
      return log;
    }

    try {
      const saved = await api.upsert(log.toJSON());
      const normalized = WorkLog.fromJSON(saved || log.toJSON());
      this.upsertLocal(normalized);
      return normalized;
    } catch (error) {
      this.logs = this.logs.filter((item) => item.id !== log.id);
      throw error;
    }
  }

  async update(updatedLog) {
    this.upsertLocal(updatedLog);
    const api = getApi();
    if (!api) {
      return updatedLog;
    }

    try {
      const saved = await api.upsert(updatedLog.toJSON());
      const normalized = WorkLog.fromJSON(saved || updatedLog.toJSON());
      this.upsertLocal(normalized);
      return normalized;
    } catch (error) {
      await this.reload();
      throw error;
    }
  }

  delete(id) {
    this.logs = this.logs.filter((log) => log.id !== id);
    getApi()?.delete(id).catch(console.error);
  }

  clear() {
    this.logs = [];
    getApi()?.clear().catch(console.error);
  }
}

export function readLegacyLogs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.WORK_LOGS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
