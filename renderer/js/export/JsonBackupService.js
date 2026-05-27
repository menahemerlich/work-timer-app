import { WorkLog } from "../core/models/WorkLog.js";
import { Employer } from "../core/models/Employer.js";

export class JsonBackupService {
  constructor({ logRepo, settingsRepo }) {
    this.logRepo = logRepo;
    this.settingsRepo = settingsRepo;
  }

  exportBackup() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: this.settingsRepo.getSettings(),
      logs: this.logRepo.getAll().map((log) => log.toJSON())
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8;"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `work-timer-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async importBackup(text) {
    const payload = JSON.parse(text);
    if (!payload || !Array.isArray(payload.logs)) {
      throw new Error("קובץ גיבוי לא תקין.");
    }

    this.settingsRepo.replaceAll({
      employers: (payload.settings?.employers || []).map((item) => new Employer(item)),
      lastSelectedEmployerId: payload.settings?.lastSelectedEmployerId || null
    });

    this.logRepo.saveAll(payload.logs.map((item) => WorkLog.fromJSON(item)));
    return payload;
  }
}
