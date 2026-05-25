import { STORAGE_KEYS } from "../../../../shared/constants/storageKeys.js";
import { Employer } from "../../core/models/Employer.js";

export class SettingsRepository {
  constructor(storage) {
    this.storage = storage;
  }

  getSettings() {
    try {
      const raw = this.storage.getItem(STORAGE_KEYS.WORK_TIMER_SETTINGS);
      if (!raw) {
        return { employers: [], lastSelectedEmployerId: null };
      }

      const data = JSON.parse(raw);
      return {
        employers: (data.employers || []).map((item) => new Employer(item)),
        lastSelectedEmployerId: data.lastSelectedEmployerId || null
      };
    } catch {
      return { employers: [], lastSelectedEmployerId: null };
    }
  }

  saveSettings(settings) {
    this.storage.setItem(
      STORAGE_KEYS.WORK_TIMER_SETTINGS,
      JSON.stringify({
        employers: settings.employers.map((employer) => ({
          id: employer.id,
          name: employer.name,
          createdAt: employer.createdAt
        })),
        lastSelectedEmployerId: settings.lastSelectedEmployerId || null
      })
    );
  }

  setLastSelectedEmployerId(id) {
    const settings = this.getSettings();
    settings.lastSelectedEmployerId = id;
    this.saveSettings(settings);
  }
}

export class EmployerRepository {
  constructor(storage) {
    this.settingsRepository = new SettingsRepository(storage);
  }

  getAll() {
    return this.settingsRepository.getSettings().employers;
  }

  getById(id) {
    return this.getAll().find((employer) => employer.id === id) || null;
  }

  nameExists(name, excludeId = null) {
    const normalized = name.trim().toLowerCase();
    return this.getAll().some(
      (employer) =>
        employer.name.trim().toLowerCase() === normalized && employer.id !== excludeId
    );
  }

  add(employer) {
    const settings = this.settingsRepository.getSettings();
    settings.employers.push(employer);
    this.settingsRepository.saveSettings(settings);
    return employer;
  }

  update(id, name) {
    const settings = this.settingsRepository.getSettings();
    const employer = settings.employers.find((item) => item.id === id);
    if (!employer) {
      return null;
    }

    employer.name = name.trim();
    this.settingsRepository.saveSettings(settings);
    return employer;
  }

  delete(id) {
    const settings = this.settingsRepository.getSettings();
    settings.employers = settings.employers.filter((employer) => employer.id !== id);

    if (settings.lastSelectedEmployerId === id) {
      settings.lastSelectedEmployerId = null;
    }

    this.settingsRepository.saveSettings(settings);
  }

  setLastSelected(id) {
    this.settingsRepository.setLastSelectedEmployerId(id);
  }

  getLastSelectedId() {
    return this.settingsRepository.getSettings().lastSelectedEmployerId;
  }

  getRecentEmployers(limit = 3) {
    const lastId = this.getLastSelectedId();
    const employers = this.getAll();
    if (!lastId) {
      return employers.slice(0, limit);
    }

    const last = employers.find((employer) => employer.id === lastId);
    const rest = employers.filter((employer) => employer.id !== lastId);
    return last ? [last, ...rest].slice(0, limit) : employers.slice(0, limit);
  }
}
