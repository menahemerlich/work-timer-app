import { UNKNOWN_EMPLOYER } from "../../../../shared/constants/storageKeys.js";
import { WorkLog } from "../../core/models/WorkLog.js";
import { generateId } from "../../core/utils/uuid.js";

export class DataMigrator {
  static run({ logRepo, settingsRepo }) {
    const settings = settingsRepo.getSettings();
    if (!settings.employers) {
      settingsRepo.saveSettings({ employers: [], lastSelectedEmployerId: null });
    }

    const logs = logRepo.getAll();
    let changed = false;

    const migrated = logs.map((log) => {
      const next = { ...log.toJSON() };

      if (!next.id) {
        next.id = generateId();
        changed = true;
      }

      if (!next.employerName) {
        next.employerName = UNKNOWN_EMPLOYER;
        changed = true;
      }

      return WorkLog.fromJSON(next);
    });

    if (changed) {
      logRepo.saveAll(migrated);
    }
  }
}
