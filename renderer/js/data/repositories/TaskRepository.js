import { Task, TASK_STATUS } from "../../core/models/Task.js";

function getApi() {
  return window.electronAPI?.db?.tasks;
}

export class TaskRepository {
  constructor() {
    this.tasks = [];
  }

  async init() {
    const api = getApi();
    if (!api) {
      return;
    }

    const rows = await api.getAll();
    this.tasks = rows.map((row) => new Task(row));
  }

  async reload() {
    await this.init();
  }

  notifyChanged() {
    window.dispatchEvent(new CustomEvent("tasks:changed"));
  }

  getAll() {
    return this.tasks.filter((task) => !task.deletedAt);
  }

  getById(id) {
    return this.getAll().find((task) => task.id === id) || null;
  }

  getByEmployer(employerId) {
    return this.getAll().filter((task) => task.employerId === employerId);
  }

  upsertLocal(task) {
    const index = this.tasks.findIndex((item) => item.id === task.id);
    if (index >= 0) {
      this.tasks[index] = task;
    } else {
      this.tasks.push(task);
    }
  }

  async save(task) {
    const previous = this.tasks.find((item) => item.id === task.id) || null;
    this.upsertLocal(task);
    this.notifyChanged();

    const api = getApi();
    if (!api) {
      return task;
    }

    try {
      const saved = await api.upsert(task.toJSON());
      if (saved) {
        task.completedAt = saved.completedAt;
      }
      return task;
    } catch (error) {
      if (previous) {
        this.upsertLocal(previous);
      } else {
        this.tasks = this.tasks.filter((item) => item.id !== task.id);
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
    return this.save(new Task({ ...existing.toJSON(), ...changes }));
  }

  async toggleDone(id) {
    const existing = this.getById(id);
    if (!existing) {
      return null;
    }
    const done = !existing.isDone;
    return this.update(id, {
      status: done ? TASK_STATUS.DONE : TASK_STATUS.OPEN,
      completedAt: done ? new Date().toISOString() : null
    });
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

  replaceAll(tasks) {
    tasks.forEach((item) => {
      const task = item instanceof Task ? item : new Task(item);
      this.upsertLocal(task);
      getApi()?.upsert(task.toJSON()).catch(console.error);
    });
    this.notifyChanged();
  }
}
