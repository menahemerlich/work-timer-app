import { Project } from "../../core/models/Project.js";

function getApi() {
  return window.electronAPI?.db?.projects;
}

export class ProjectRepository {
  constructor() {
    // Includes deleted projects (deletedAt set) so old logs can still resolve billing type.
    this.projects = [];
  }

  async init() {
    const api = getApi();
    if (!api) {
      return;
    }

    const rows = await api.getAll();
    this.projects = rows.map((row) => new Project(row));
  }

  async reload() {
    await this.init();
  }

  notifyChanged() {
    window.dispatchEvent(new CustomEvent("projects:changed"));
  }

  getAll() {
    return this.projects.filter((project) => !project.deletedAt);
  }

  getById(id, { includeDeleted = false } = {}) {
    if (!id) {
      return null;
    }
    const project = this.projects.find((item) => item.id === id) || null;
    if (project?.deletedAt && !includeDeleted) {
      return null;
    }
    return project;
  }

  getByEmployer(employerId) {
    return this.getAll().filter((project) => project.employerId === employerId);
  }

  nameExists(employerId, name, excludeId = null) {
    const normalized = name.trim().toLowerCase();
    return this.getByEmployer(employerId).some(
      (project) => project.name.trim().toLowerCase() === normalized && project.id !== excludeId
    );
  }

  /** True when the log belongs to a fixed-price or per-unit project and must not be paid by the hour. */
  isNonHourlyLog(log) {
    return Boolean(this.getById(log?.projectId, { includeDeleted: true })?.isNonHourly);
  }

  upsertLocal(project) {
    const index = this.projects.findIndex((item) => item.id === project.id);
    if (index >= 0) {
      this.projects[index] = project;
    } else {
      this.projects.push(project);
    }
  }

  async save(project) {
    const previous = this.projects.find((item) => item.id === project.id) || null;
    this.upsertLocal(project);
    this.notifyChanged();

    const api = getApi();
    if (!api) {
      return project;
    }

    try {
      await api.upsert(project.toJSON());
      return project;
    } catch (error) {
      if (previous) {
        this.upsertLocal(previous);
      } else {
        this.projects = this.projects.filter((item) => item.id !== project.id);
      }
      this.notifyChanged();
      throw error;
    }
  }

  async update(id, changes) {
    const existing = this.getById(id);
    if (!existing) {
      return null;
    }

    const next = new Project({ ...existing.toJSON(), ...changes });
    if (!next.isFixed) {
      next.fixedPrice = null;
    }
    if (!next.isUnit) {
      next.unitPrice = null;
      next.unitName = null;
      next.unitSingular = null;
    }
    return this.save(next);
  }

  async delete(id) {
    const existing = this.getById(id);
    if (!existing) {
      return;
    }

    existing.deletedAt = new Date().toISOString();
    this.notifyChanged();

    try {
      await getApi()?.delete(id);
    } catch (error) {
      existing.deletedAt = null;
      this.notifyChanged();
      throw error;
    }
  }

  async deleteByEmployer(employerId) {
    for (const project of this.getByEmployer(employerId)) {
      await this.delete(project.id);
    }
  }

  replaceAll(projects) {
    projects.forEach((item) => {
      const project = item instanceof Project ? item : new Project(item);
      this.upsertLocal(project);
      getApi()?.upsert(project.toJSON()).catch(console.error);
    });
    this.notifyChanged();
  }
}
