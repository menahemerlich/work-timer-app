export const TASK_STATUS = {
  OPEN: "open",
  DONE: "done"
};

export const TASK_PRIORITY = {
  LOW: "low",
  NORMAL: "normal",
  HIGH: "high"
};

export const PRIORITY_LABELS = {
  [TASK_PRIORITY.HIGH]: "דחוף",
  [TASK_PRIORITY.NORMAL]: "רגיל",
  [TASK_PRIORITY.LOW]: "נמוך"
};

// Higher first when sorting.
export const PRIORITY_RANK = {
  [TASK_PRIORITY.HIGH]: 2,
  [TASK_PRIORITY.NORMAL]: 1,
  [TASK_PRIORITY.LOW]: 0
};

function normalizeStatus(value) {
  return value === TASK_STATUS.DONE ? TASK_STATUS.DONE : TASK_STATUS.OPEN;
}

function normalizePriority(value) {
  return Object.values(TASK_PRIORITY).includes(value) ? value : TASK_PRIORITY.NORMAL;
}

export class Task {
  constructor({
    id,
    employerId,
    title,
    notes = "",
    status = TASK_STATUS.OPEN,
    priority = TASK_PRIORITY.NORMAL,
    dueDate = null,
    completedAt = null,
    createdAt,
    deletedAt = null
  }) {
    this.id = id;
    this.employerId = employerId;
    this.title = title;
    this.notes = notes || "";
    this.status = normalizeStatus(status);
    this.priority = normalizePriority(priority);
    this.dueDate = dueDate || null;
    this.completedAt = completedAt || null;
    this.createdAt = createdAt;
    this.deletedAt = deletedAt || null;
  }

  get isDone() {
    return this.status === TASK_STATUS.DONE;
  }

  static create({ employerId, title, notes = "", priority, dueDate = null }, idFactory) {
    return new Task({
      id: idFactory(),
      employerId,
      title: title.trim(),
      notes: (notes || "").trim(),
      priority,
      dueDate: dueDate || null,
      createdAt: new Date().toISOString()
    });
  }

  toJSON() {
    return {
      id: this.id,
      employerId: this.employerId,
      title: this.title,
      notes: this.notes,
      status: this.status,
      priority: this.priority,
      dueDate: this.dueDate,
      completedAt: this.completedAt,
      createdAt: this.createdAt
    };
  }
}
