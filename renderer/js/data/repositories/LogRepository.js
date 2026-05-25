import { STORAGE_KEYS } from "../../../../shared/constants/storageKeys.js";
import { WorkLog } from "../../core/models/WorkLog.js";

export class LogRepository {
  constructor(storage) {
    this.storage = storage;
  }

  getAll() {
    try {
      const raw = this.storage.getItem(STORAGE_KEYS.WORK_LOGS);
      const data = raw ? JSON.parse(raw) : [];
      return data.map((item) => WorkLog.fromJSON(item));
    } catch {
      return [];
    }
  }

  saveAll(logs) {
    this.storage.setItem(
      STORAGE_KEYS.WORK_LOGS,
      JSON.stringify(logs.map((log) => log.toJSON()))
    );
  }

  add(log) {
    const logs = this.getAll();
    logs.push(log);
    this.saveAll(logs);
    return log;
  }

  update(updatedLog) {
    const logs = this.getAll().map((log) => (log.id === updatedLog.id ? updatedLog : log));
    this.saveAll(logs);
    return updatedLog;
  }

  delete(id) {
    const logs = this.getAll().filter((log) => log.id !== id);
    this.saveAll(logs);
  }

  clear() {
    this.saveAll([]);
  }
}
