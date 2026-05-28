import { Employer } from "../../core/models/Employer.js";



function getSettingsApi() {

  return window.electronAPI?.db?.settings;

}



function getEmployersApi() {

  return window.electronAPI?.db?.employers;

}



function formatPersistError(error) {

  const message = error?.message || String(error);

  if (message.includes("UNIQUE constraint failed: employers.name")) {

    return "מעסיק בשם זה כבר קיים במערכת.";

  }

  return message;

}



export class SettingsRepository {

  constructor() {

    this.settings = {
      employers: [],
      lastSelectedEmployerId: null,
      monthlyTargetDays: null,
      monthlyTargetHoursPerDay: null
    };

    this.initialized = false;

  }



  async init() {

    const api = getSettingsApi();

    if (!api) {

      this.initialized = true;

      return;

    }



    const data = await api.get();

    this.applyCache({

      employers: (data.employers || []).map((item) => new Employer(item)),

      lastSelectedEmployerId: data.lastSelectedEmployerId || null,

      monthlyTargetDays: data.monthlyTargetDays ?? null,

      monthlyTargetHoursPerDay: data.monthlyTargetHoursPerDay ?? null

    });

    this.initialized = true;

  }



  async reload() {

    await this.init();

  }



  applyCache(settings) {

    this.settings = {

      employers: settings.employers.map(

        (employer) => (employer instanceof Employer ? employer : new Employer(employer))

      ),

      lastSelectedEmployerId: settings.lastSelectedEmployerId || null

      ,

      monthlyTargetDays: settings.monthlyTargetDays ?? null,

      monthlyTargetHoursPerDay: settings.monthlyTargetHoursPerDay ?? null

    };

  }



  getSettings() {

    return {

      employers: [...this.settings.employers],

      lastSelectedEmployerId: this.settings.lastSelectedEmployerId,

      monthlyTargetDays: this.settings.monthlyTargetDays,

      monthlyTargetHoursPerDay: this.settings.monthlyTargetHoursPerDay

    };

  }



  async persistEmployer(employer) {

    const api = getEmployersApi();

    if (!api) {

      return;

    }



    try {

      await api.upsert({

        id: employer.id,

        name: employer.name,

        createdAt: employer.createdAt,

        color: employer.color || null,

        hourlyRate: employer.hourlyRate ?? null

      });
      window.dispatchEvent(new CustomEvent("settings:changed"));

    } catch (error) {

      throw new Error(formatPersistError(error));

    }

  }



  async persistLastSelected() {

    const api = getSettingsApi();

    if (!api) {

      return;

    }



    await api.save({ lastSelectedEmployerId: this.settings.lastSelectedEmployerId });
    window.dispatchEvent(new CustomEvent("settings:changed"));

  }

  async persistMonthlyTargets() {
    const api = getSettingsApi();
    if (!api) {
      return;
    }
    await api.save({
      monthlyTargetDays: this.settings.monthlyTargetDays,
      monthlyTargetHoursPerDay: this.settings.monthlyTargetHoursPerDay
    });
    window.dispatchEvent(new CustomEvent("settings:changed"));
  }

  async saveMonthlyTargets({ monthlyTargetDays, monthlyTargetHoursPerDay }) {
    this.settings.monthlyTargetDays = monthlyTargetDays ?? null;
    this.settings.monthlyTargetHoursPerDay = monthlyTargetHoursPerDay ?? null;
    this.applyCache(this.settings);
    await this.persistMonthlyTargets();
    window.dispatchEvent(new CustomEvent("settings:changed"));
  }



  async persistEmployerDelete(id) {

    const api = getEmployersApi();

    if (!api) {

      return;

    }



    await api.delete(id);
    window.dispatchEvent(new CustomEvent("settings:changed"));

  }



  replaceAll(settings) {

    this.applyCache(settings);

    void Promise.all([

      ...this.settings.employers.map((employer) => this.persistEmployer(employer)),

      this.persistLastSelected(),
      this.persistMonthlyTargets()

    ]).catch(console.error);

  }

}



export class EmployerRepository {

  constructor(settingsRepository) {

    this.settingsRepository = settingsRepository;

  }



  async init() {

    await this.settingsRepository.init();

  }



  async reload() {

    await this.settingsRepository.reload();

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



  async add(employer) {

    const settings = this.settingsRepository.getSettings();

    settings.employers.push(employer);

    this.settingsRepository.applyCache(settings);



    try {

      await this.settingsRepository.persistEmployer(employer);

      return employer;

    } catch (error) {

      settings.employers = settings.employers.filter((item) => item.id !== employer.id);

      this.settingsRepository.applyCache(settings);

      throw error;

    }

  }



  async update(id, name) {

    const settings = this.settingsRepository.getSettings();

    const employer = settings.employers.find((item) => item.id === id);

    if (!employer) {

      return null;

    }



    const previousName = employer.name;

    employer.name = name.trim();

    this.settingsRepository.applyCache(settings);



    try {

      await this.settingsRepository.persistEmployer(employer);

      return employer;

    } catch (error) {

      employer.name = previousName;

      this.settingsRepository.applyCache(settings);

      throw error;

    }

  }

  async setHourlyRate(id, hourlyRate) {
    const settings = this.settingsRepository.getSettings();
    const employer = settings.employers.find((item) => item.id === id);
    if (!employer) {
      return null;
    }

    employer.hourlyRate = hourlyRate;
    this.settingsRepository.applyCache(settings);
    await this.settingsRepository.persistEmployer(employer);
    return employer;
  }



  async delete(id) {

    const settings = this.settingsRepository.getSettings();

    const removed = settings.employers.find((employer) => employer.id === id);

    if (!removed) {

      return;

    }



    settings.employers = settings.employers.filter((employer) => employer.id !== id);

    const previousLastSelected = settings.lastSelectedEmployerId;



    if (settings.lastSelectedEmployerId === id) {

      settings.lastSelectedEmployerId = null;

    }



    this.settingsRepository.applyCache(settings);



    try {

      await this.settingsRepository.persistEmployerDelete(id);

      await this.settingsRepository.persistLastSelected();

    } catch (error) {

      settings.employers.push(removed);

      settings.lastSelectedEmployerId = previousLastSelected;

      this.settingsRepository.applyCache(settings);

      throw error;

    }

  }



  async setLastSelected(id) {
    const settings = this.settingsRepository.getSettings();
    settings.lastSelectedEmployerId = id;
    this.settingsRepository.applyCache(settings);
    await this.settingsRepository.persistLastSelected();
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

