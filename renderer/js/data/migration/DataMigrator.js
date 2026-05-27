import { STORAGE_KEYS, UNKNOWN_EMPLOYER } from "../../../../shared/constants/storageKeys.js";
import { WorkLog } from "../../core/models/WorkLog.js";
import { Employer } from "../../core/models/Employer.js";
import { generateId } from "../../core/utils/uuid.js";
import { assignMissingEmployerColors } from "../../core/utils/employerColors.js";
import { readLegacyLogs } from "../repositories/LogRepository.js";

function readLegacySettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.WORK_TIMER_SETTINGS);
    if (!raw) {
      return { employers: [], lastSelectedEmployerId: null };
    }
    return JSON.parse(raw);
  } catch {
    return { employers: [], lastSelectedEmployerId: null };
  }
}

function readLegacyTimerState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TIMER_STATE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function migrateLegacyLocalStorage() {
  const legacyApi = window.electronAPI?.db?.legacy;
  if (!legacyApi) {
    return { imported: false };
  }

  const alreadyImported = await legacyApi.wasImported();
  if (alreadyImported) {
    return { imported: false, reason: "already_imported" };
  }

  const settings = readLegacySettings();
  const logs = readLegacyLogs();
  const timerState = readLegacyTimerState();

  const hasData =
    (settings.employers && settings.employers.length > 0) ||
    logs.length > 0 ||
    timerState ||
    settings.lastSelectedEmployerId;

  if (!hasData) {
    return { imported: false, reason: "empty" };
  }

  const colorMigration = assignMissingEmployerColors(settings.employers || []);
  const employers = colorMigration.employers.map((item) => ({
    id: item.id,
    name: item.name,
    createdAt: item.createdAt,
    color: item.color || null
  }));

  const migratedLogs = logs.map((log) => {
    const next = { ...log };
    if (!next.id) {
      next.id = generateId();
    }
    if (!next.employerName) {
      next.employerName = UNKNOWN_EMPLOYER;
    }
    return next;
  });

  const result = await legacyApi.import({
    employers,
    logs: migratedLogs,
    settings: {
      lastSelectedEmployerId: settings.lastSelectedEmployerId || null
    },
    timerState
  });

  return result;
}

export class DataMigrator {
  static async run({ logRepo, settingsRepo }) {
    await migrateLegacyLocalStorage();

    const settings = settingsRepo.getSettings();
    if (!settings.employers) {
      settingsRepo.replaceAll({ employers: [], lastSelectedEmployerId: null });
    }

    const colorMigration = assignMissingEmployerColors(settings.employers || []);
    if (colorMigration.changed) {
      settingsRepo.replaceAll({
        ...settings,
        employers: colorMigration.employers.map((item) => new Employer(item))
      });
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
