import { Task, TASK_PRIORITY, PRIORITY_LABELS, PRIORITY_RANK } from "../../core/models/Task.js";
import { generateId } from "../../core/utils/uuid.js";
import { getColorForOrphanName } from "../../core/utils/employerColors.js";
import { confirmDialog } from "../components/ConfirmDialog.js";

const DAYS_HE = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const FILTERS = [
  { id: "open", label: "פתוחות" },
  { id: "done", label: "הושלמו" },
  { id: "all", label: "הכל" }
];

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function isoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayIso() {
  return isoDate(new Date());
}

function addDaysIso(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

function parseIsoDate(value) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDue(dueDate) {
  if (dueDate === todayIso()) {
    return "היום";
  }
  if (dueDate === addDaysIso(1)) {
    return "מחר";
  }
  if (dueDate === addDaysIso(-1)) {
    return "אתמול";
  }
  const date = parseIsoDate(dueDate);
  return `יום ${DAYS_HE[date.getDay()]} ${date.getDate()}.${date.getMonth() + 1}`;
}

/** Open tasks first by due date (no date last), then by priority, then oldest first. */
function compareOpen(a, b) {
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  }
  const byPriority = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
  if (byPriority !== 0) {
    return byPriority;
  }
  return String(a.createdAt).localeCompare(String(b.createdAt));
}

function compareDone(a, b) {
  return String(b.completedAt || "").localeCompare(String(a.completedAt || ""));
}

export class TasksController {
  constructor({ taskRepo, employerRepo, modal }) {
    this.taskRepo = taskRepo;
    this.employerRepo = employerRepo;
    this.modal = modal;
    this.panel = document.querySelector('[data-panel="tasks"]');
    this.body = document.getElementById("tasksBody");
    this.titleEl = document.getElementById("tasksTitle");
    this.subtitleEl = document.getElementById("tasksSubtitle");
    this.backBtn = document.getElementById("tasksBackBtn");
    this.addBtn = document.getElementById("tasksAddBtn");
    this.currentEmployerId = null;
    this.filter = "open";
  }

  init() {
    this.addBtn.addEventListener("click", () => this.openTaskModal());
    this.backBtn.addEventListener("click", () => this.showOverview());

    this.body.addEventListener("click", (event) => this.handleBodyClick(event));
    this.body.addEventListener("keydown", (event) => {
      if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-open-client]")) {
        event.preventDefault();
        this.openClient(event.target.dataset.openClient);
      }
    });

    ["tasks:changed", "settings:changed"].forEach((name) =>
      window.addEventListener(name, () => this.render())
    );

    this.render();
  }

  onTabChange(tabId) {
    if (tabId === "tasks") {
      this.render();
    }
  }

  getEmployers() {
    return this.employerRepo.getAll();
  }

  employerColor(employer) {
    return employer.color || getColorForOrphanName(employer.name);
  }

  showOverview() {
    this.currentEmployerId = null;
    this.render();
    this.panel.scrollTop = 0;
  }

  openClient(employerId) {
    this.currentEmployerId = employerId;
    this.filter = "open";
    this.render();
    this.panel.scrollTop = 0;
  }

  render() {
    const employer = this.currentEmployerId ? this.employerRepo.getById(this.currentEmployerId) : null;
    if (this.currentEmployerId && !employer) {
      this.currentEmployerId = null;
    }

    if (employer) {
      this.renderClient(employer);
    } else {
      this.renderOverview();
    }
  }

  // ---------- Overview: one card per client ----------

  renderOverview() {
    const employers = this.getEmployers();
    const today = todayIso();
    const openTotal = this.taskRepo.getAll().filter((task) => !task.isDone).length;

    this.backBtn.hidden = true;
    this.titleEl.textContent = "📋 משימות";
    this.subtitleEl.textContent = employers.length
      ? `${openTotal} משימות פתוחות אצל ${employers.length} לקוחות · לחץ על לקוח כדי לראות את המשימות שלו`
      : "";

    if (!employers.length) {
      this.addBtn.disabled = true;
      this.body.innerHTML = `
        <div class="panel-card empty-state">
          <div class="empty-icon">🗂️</div>
          <p>עדיין אין לקוחות. הוסף מעסיק בלשונית ההגדרות, ואז תוכל להוסיף לו משימות.</p>
        </div>`;
      return;
    }

    this.addBtn.disabled = false;
    const cards = employers.map((employer) => {
      const tasks = this.taskRepo.getByEmployer(employer.id);
      const open = tasks.filter((task) => !task.isDone);
      const done = tasks.length - open.length;
      const overdue = open.filter((task) => task.dueDate && task.dueDate < today).length;
      const urgent = open.filter((task) => task.priority === TASK_PRIORITY.HIGH).length;
      const next = open.filter((task) => task.dueDate && task.dueDate >= today).sort(compareOpen)[0];
      const percent = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

      const badges = [];
      if (overdue) {
        badges.push(`<span class="client-badge is-overdue">⚠️ ${overdue} באיחור</span>`);
      }
      if (urgent) {
        badges.push(`<span class="client-badge is-urgent">🔥 ${urgent} דחופות</span>`);
      }
      if (next) {
        badges.push(`<span class="client-badge">📅 הבאה: ${escapeHtml(formatDue(next.dueDate))}</span>`);
      }
      if (!badges.length) {
        badges.push(
          `<span class="client-badge is-calm">${open.length ? "אין תאריכי יעד" : tasks.length ? "✨ הכל הושלם" : "אין משימות עדיין"}</span>`
        );
      }

      return `
        <div class="client-card" role="button" tabindex="0" data-open-client="${escapeHtml(employer.id)}"
             style="--client-color: ${escapeHtml(this.employerColor(employer))}">
          <div class="client-card-top">
            <span class="client-initial">${escapeHtml(employer.name.trim().charAt(0) || "?")}</span>
            <div class="client-card-name">${escapeHtml(employer.name)}</div>
            <span class="client-card-arrow" aria-hidden="true">‹</span>
          </div>
          <div class="client-card-count">
            <span class="client-count-num">${open.length}</span>
            <span class="client-count-label">${open.length === 1 ? "משימה פתוחה" : "משימות פתוחות"}</span>
          </div>
          <div class="client-progress" title="${done} מתוך ${tasks.length} הושלמו">
            <div class="client-progress-fill" style="width: ${percent}%"></div>
          </div>
          <div class="client-progress-label">${done} / ${tasks.length} הושלמו</div>
          <div class="client-badges">${badges.join("")}</div>
        </div>`;
    });

    this.body.innerHTML = `<div class="client-grid">${cards.join("")}</div>`;
  }

  // ---------- One client: its tasks ----------

  renderClient(employer) {
    const today = todayIso();
    const weekEnd = addDaysIso(7);
    const tasks = this.taskRepo.getByEmployer(employer.id);
    const open = tasks.filter((task) => !task.isDone).sort(compareOpen);
    const done = tasks.filter((task) => task.isDone).sort(compareDone);
    const overdueCount = open.filter((task) => task.dueDate && task.dueDate < today).length;

    this.backBtn.hidden = false;
    this.addBtn.disabled = false;
    this.titleEl.innerHTML = `<span class="client-initial is-small" style="--client-color: ${escapeHtml(
      this.employerColor(employer)
    )}">${escapeHtml(employer.name.trim().charAt(0) || "?")}</span> ${escapeHtml(employer.name)}`;
    this.subtitleEl.textContent = "";

    const stats = `
      <div class="tasks-stats">
        <div class="tasks-stat"><span class="tasks-stat-num">${open.length}</span><span>פתוחות</span></div>
        <div class="tasks-stat ${overdueCount ? "is-overdue" : ""}"><span class="tasks-stat-num">${overdueCount}</span><span>באיחור</span></div>
        <div class="tasks-stat is-done"><span class="tasks-stat-num">${done.length}</span><span>הושלמו</span></div>
      </div>`;

    const filters = `
      <div class="tasks-filter" role="tablist">
        ${FILTERS.map(
          (item) =>
            `<button type="button" role="tab" class="tasks-filter-btn ${this.filter === item.id ? "active" : ""}"
                     aria-selected="${this.filter === item.id}" data-filter="${item.id}">${item.label}</button>`
        ).join("")}
      </div>`;

    const groups = [];
    if (this.filter !== "done") {
      const buckets = [
        { title: "⚠️ באיחור", className: "is-overdue", items: open.filter((t) => t.dueDate && t.dueDate < today) },
        { title: "☀️ היום", className: "is-today", items: open.filter((t) => t.dueDate === today) },
        {
          title: "🗓️ השבוע הקרוב",
          items: open.filter((t) => t.dueDate && t.dueDate > today && t.dueDate <= weekEnd)
        },
        { title: "🔭 בהמשך", items: open.filter((t) => t.dueDate && t.dueDate > weekEnd) },
        { title: "📝 ללא תאריך", items: open.filter((t) => !t.dueDate) }
      ];
      buckets.filter((bucket) => bucket.items.length).forEach((bucket) => groups.push(this.renderGroup(bucket, today)));
    }
    if (this.filter !== "open" && done.length) {
      groups.push(this.renderGroup({ title: "✅ הושלמו", className: "is-done", items: done }, today));
    }

    let list = groups.join("");
    if (!list) {
      const message = !tasks.length
        ? "אין עדיין משימות ללקוח הזה."
        : this.filter === "open"
          ? "כל המשימות הושלמו — כל הכבוד! 🎉"
          : "אין משימות שהושלמו עדיין.";
      list = `
        <div class="empty-state tasks-empty">
          <div class="empty-icon">${!tasks.length ? "🗒️" : "🎉"}</div>
          <p>${message}</p>
          <button type="button" class="btn-soft btn-lavender" data-add-here>＋ הוספת משימה</button>
        </div>`;
    }

    this.body.innerHTML = `
      <div class="panel-card tasks-client-card">
        <div class="tasks-client-head">${stats}${filters}</div>
        <div class="tasks-list">${list}</div>
      </div>`;
  }

  renderGroup({ title, className = "", items }, today) {
    return `
      <div class="tasks-group ${className}">
        <div class="tasks-group-title">${title} <span class="tasks-group-count">${items.length}</span></div>
        ${items.map((task) => this.renderTask(task, today)).join("")}
      </div>`;
  }

  renderTask(task, today) {
    const meta = [];
    if (task.dueDate) {
      const overdue = !task.isDone && task.dueDate < today;
      const isToday = task.dueDate === today;
      meta.push(
        `<span class="task-due ${overdue ? "is-overdue" : isToday ? "is-today" : ""}">📅 ${escapeHtml(formatDue(task.dueDate))}</span>`
      );
    }
    if (task.priority !== TASK_PRIORITY.NORMAL) {
      meta.push(`<span class="task-priority is-${task.priority}">${PRIORITY_LABELS[task.priority]}</span>`);
    }
    if (task.isDone && task.completedAt) {
      const completed = new Date(task.completedAt);
      meta.push(`<span class="task-completed">הושלמה ${completed.getDate()}.${completed.getMonth() + 1}</span>`);
    }

    return `
      <div class="task-item priority-${task.priority} ${task.isDone ? "is-done" : ""}" data-task-id="${escapeHtml(task.id)}">
        <button type="button" class="task-check" data-toggle-task
                aria-label="${task.isDone ? "החזר לפתוחה" : "סמן כהושלמה"}" title="${task.isDone ? "החזר לפתוחה" : "סמן כהושלמה"}">✓</button>
        <div class="task-main">
          <div class="task-title">${escapeHtml(task.title)}</div>
          ${task.notes ? `<div class="task-notes">${escapeHtml(task.notes)}</div>` : ""}
          ${meta.length ? `<div class="task-meta">${meta.join("")}</div>` : ""}
        </div>
        <div class="task-actions">
          <button type="button" class="task-icon-btn" data-edit-task title="עריכה" aria-label="עריכה">✎</button>
          <button type="button" class="task-icon-btn is-danger" data-delete-task title="מחיקה" aria-label="מחיקה">🗑</button>
        </div>
      </div>`;
  }

  handleBodyClick(event) {
    const clientCard = event.target.closest("[data-open-client]");
    if (clientCard) {
      this.openClient(clientCard.dataset.openClient);
      return;
    }

    const filterBtn = event.target.closest("[data-filter]");
    if (filterBtn) {
      this.filter = filterBtn.dataset.filter;
      this.render();
      return;
    }

    if (event.target.closest("[data-add-here]")) {
      this.openTaskModal();
      return;
    }

    const taskId = event.target.closest("[data-task-id]")?.dataset.taskId;
    if (!taskId) {
      return;
    }

    if (event.target.closest("[data-toggle-task]")) {
      this.taskRepo.toggleDone(taskId).catch((error) => alert(error.message || "עדכון המשימה נכשל."));
    } else if (event.target.closest("[data-edit-task]")) {
      this.openTaskModal(this.taskRepo.getById(taskId));
    } else if (event.target.closest("[data-delete-task]")) {
      void this.handleDelete(taskId);
    }
  }

  async handleDelete(taskId) {
    const task = this.taskRepo.getById(taskId);
    if (!task || !(await confirmDialog(`למחוק את המשימה "${task.title}"?`))) {
      return;
    }
    try {
      await this.taskRepo.delete(taskId);
    } catch (error) {
      alert(error.message || "מחיקת המשימה נכשלה.");
    }
  }

  // ---------- Add / edit modal ----------

  openTaskModal(task = null) {
    const employers = this.getEmployers();
    if (!employers.length) {
      return;
    }

    const selectedId =
      task?.employerId || this.currentEmployerId || this.employerRepo.getLastSelectedId?.() || employers[0].id;
    const priority = task?.priority || TASK_PRIORITY.NORMAL;

    const options = employers
      .map(
        (employer) =>
          `<option value="${escapeHtml(employer.id)}" ${employer.id === selectedId ? "selected" : ""}>${escapeHtml(employer.name)}</option>`
      )
      .join("");

    const priorities = [TASK_PRIORITY.LOW, TASK_PRIORITY.NORMAL, TASK_PRIORITY.HIGH]
      .map(
        (value) => `
          <label class="priority-option is-${value}">
            <input type="radio" name="taskPriority" value="${value}" ${value === priority ? "checked" : ""} />
            <span>${PRIORITY_LABELS[value]}</span>
          </label>`
      )
      .join("");

    this.modal.show({
      title: task ? "✎ עריכת משימה" : "＋ הוספת משימה",
      confirmText: task ? "שמירה" : "הוספה",
      bodyHtml: `
        <label class="field-label" for="taskTitle">מה צריך לעשות?</label>
        <input id="taskTitle" type="text" class="field-input" maxlength="200"
               placeholder="לדוגמה: לשלוח הצעת מחיר" value="${escapeHtml(task?.title || "")}" />
        <label class="field-label" for="taskEmployer">לקוח</label>
        <select id="taskEmployer" class="field-input">${options}</select>
        <div class="task-form-row">
          <div>
            <label class="field-label" for="taskDue">תאריך יעד</label>
            <input id="taskDue" type="date" class="field-input" value="${escapeHtml(task?.dueDate || "")}" />
          </div>
          <div>
            <span class="field-label">עדיפות</span>
            <div class="priority-picker">${priorities}</div>
          </div>
        </div>
        <label class="field-label" for="taskNotes">הערות</label>
        <textarea id="taskNotes" class="field-input task-notes-input" rows="3"
                  placeholder="פרטים נוספים (לא חובה)">${escapeHtml(task?.notes || "")}</textarea>
      `,
      onConfirm: () => void this.submitTaskModal(task)
    });
  }

  async submitTaskModal(task) {
    const title = document.getElementById("taskTitle")?.value.trim() || "";
    const employerId = document.getElementById("taskEmployer")?.value || "";
    const dueDate = document.getElementById("taskDue")?.value || null;
    const notes = document.getElementById("taskNotes")?.value.trim() || "";
    const priority =
      document.querySelector('input[name="taskPriority"]:checked')?.value || TASK_PRIORITY.NORMAL;

    if (!title) {
      this.modal.showFeedback("יש לכתוב מה המשימה.");
      this.modal.focusField("taskTitle");
      return;
    }
    if (!employerId) {
      this.modal.showFeedback("יש לבחור לקוח.");
      return;
    }

    try {
      if (task) {
        await this.taskRepo.update(task.id, { title, employerId, dueDate, notes, priority });
      } else {
        await this.taskRepo.save(Task.create({ employerId, title, notes, priority, dueDate }, generateId));
      }
      this.modal.hide();
      if (this.currentEmployerId && this.currentEmployerId !== employerId) {
        this.openClient(employerId);
      }
    } catch (error) {
      this.modal.showFeedback(error.message || "שמירת המשימה נכשלה.");
    }
  }
}
