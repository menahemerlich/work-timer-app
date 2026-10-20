import { Employer } from "../../core/models/Employer.js";
import { Project, BILLING_TYPES } from "../../core/models/Project.js";
import { generateId } from "../../core/utils/uuid.js";
import { compareHebrewDatesDesc } from "../../core/utils/dateParse.js";
import { getUnitProgress } from "../../core/utils/projectBilling.js";
import { WorkLog } from "../../core/models/WorkLog.js";

const NO_PROJECT = "";
const NEW_PROJECT = "__new__";

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export class TimerController {
  constructor({
    view,
    modal,
    timerService,
    employerRepo,
    projectRepo,
    logRepo,
    reportService,
    onLogAdded,
    onEmployersChanged
  }) {
    this.view = view;
    this.modal = modal;
    this.timerService = timerService;
    this.employerRepo = employerRepo;
    this.projectRepo = projectRepo;
    this.logRepo = logRepo;
    this.reportService = reportService;
    this.onLogAdded = onLogAdded;
    this.onEmployersChanged = onEmployersChanged;
  }

  init() {
    this.view.startBtn.addEventListener("click", () => this.handleStartRequest());
    this.view.pauseBtn.addEventListener("click", () => this.timerService.togglePause());
    this.view.stopBtn.addEventListener("click", () => this.handleStop());
    this.view.openMiniBtn.addEventListener("click", () => {
      window.electronAPI?.openMiniWindow();
    });
    this.view.sessionNoteBtn?.addEventListener("click", () => this.handleSessionNote());
    this.view.unitPlusBtn?.addEventListener("click", () => this.timerService.adjustUnitCount(1));
    this.view.unitMinusBtn?.addEventListener("click", () => this.timerService.adjustUnitCount(-1));

    this.timerService.subscribe((snapshot) => {
      this.view.render(this.withProjectInfo(snapshot));
      this.updateMotivation();
    });
    this.timerService.restoreRunningSession();
    this.updateMotivation();

    window.addEventListener("logs:changed", () => this.updateMotivation());
    window.addEventListener("settings:changed", () => this.updateMotivation());

    // Rotate motivation phrase every few minutes within same bucket
    if (!this.motivationTimer) {
      this.motivationTimer = setInterval(() => this.rotateMotivationPhrase(), 180000);
    }

    window.electronAPI?.window?.onTaskbarStop?.(() => this.handleTaskbarStop());

    setInterval(() => {
      this.timerService.pollCommand({
        onToggle: () => this.timerService.togglePause()
      });
    }, 500);
  }

  handleStartRequest() {
    const employers = this.employerRepo.getAll();
    if (!employers.length) {
      this.showAddFirstEmployerModal();
      return;
    }

    this.showEmployerPicker(employers);
    void this.employerRepo.reload();
  }

  createEmployerFromName(name) {
    return this.createEmployerFromNameAsync(name);
  }

  async createEmployerFromNameAsync(name) {
    const trimmed = name.trim();
    if (!trimmed) {
      return { error: "יש להזין שם מעסיק." };
    }

    if (this.employerRepo.nameExists(trimmed)) {
      return { error: "מעסיק בשם זה כבר קיים." };
    }

    const employer = Employer.create(
      trimmed,
      generateId,
      this.employerRepo.getAll().length
    );

    try {
      await this.employerRepo.add(employer);
      this.onEmployersChanged?.();
      return { employer };
    } catch (error) {
      return { error: error.message || "שמירה מקומית נכשלה." };
    }
  }

  withProjectInfo(snapshot) {
    const project = this.projectRepo?.getById(snapshot.projectId, { includeDeleted: true });
    return {
      ...snapshot,
      projectName: project?.name || snapshot.projectName || null,
      projectIsFixed: Boolean(project?.isFixed),
      projectIsUnit: Boolean(project?.isUnit),
      projectBillingLabel: project?.isFixed ? "לפי עבודה" : project?.isUnit ? "לפי יחידה" : null,
      unitName: project?.displayUnitName || null,
      unitSingular: project?.displayUnitSingular || null,
      currentUnitNumber: this.getCurrentUnitNumber(snapshot)
    };
  }

  /** Number of the unit being worked on now: units finished before this session + this session's + 1. */
  getCurrentUnitNumber(snapshot) {
    if (!snapshot.isRunning || snapshot.unitCount === null || snapshot.unitCount === undefined) {
      return null;
    }
    const { finished } = getUnitProgress(this.logRepo?.getAll() || [], snapshot.projectId);
    return finished + snapshot.unitCount + 1;
  }

  async startWithEmployer(employer, project = null) {
    const persisted = this.employerRepo.getById(employer.id);
    if (!persisted) {
      throw new Error("המעסיק לא נשמר. נסה שוב.");
    }

    await this.employerRepo.setLastSelected(persisted.id);

    if (project?.isUnit) {
      const progress = getUnitProgress(this.logRepo?.getAll() || [], project.id);
      if (progress.lastOpen) {
        this.showContinueUnitQuestion(persisted, project, progress);
        return;
      }
    }

    this.startSession(persisted, project);
  }

  startSession(employer, project = null) {
    this.timerService.start({
      employerId: employer.id,
      employerName: employer.name,
      projectId: project?.id || null,
      projectName: project?.name || null,
      countUnits: Boolean(project?.isUnit)
    });
    this.modal.hide();
  }

  /**
   * The last session ended with a unit in progress: continue it, or count it as finished
   * (it was done but not marked) and move on to the next one.
   */
  showContinueUnitQuestion(employer, project, progress) {
    const singular = escapeHtml(project.displayUnitSingular);
    const openNumber = progress.finished + 1;

    this.modal.show({
      title: "המשך עבודה",
      bodyHtml: `
        <p class="unit-question">אתה ממשיך את ${singular} מס' ${openNumber}?</p>
        <div class="unit-choice-buttons">
          <button type="button" class="btn-action btn-start unit-choice-btn" id="continueUnitYes">
            כן, ממשיך את ${singular} ${openNumber}
          </button>
          <button type="button" class="btn-soft btn-lavender unit-choice-btn" id="continueUnitNo">
            לא, ${singular} ${openNumber} הסתיים — עובר ל־${openNumber + 1}
          </button>
        </div>
        <p class="modal-hint modal-hint-small">«לא» סופר את ${singular} ${openNumber} כגמור בדיווח הקודם.</p>
      `,
      hideConfirm: true
    });

    document.getElementById("continueUnitYes")?.addEventListener("click", () => {
      this.startSession(employer, project);
    });

    document.getElementById("continueUnitNo")?.addEventListener("click", async () => {
      const last = progress.lastLog;
      try {
        await this.logRepo.update(
          new WorkLog({ ...last.toJSON(), unitCount: (last.unitCount || 0) + 1, unitOpen: false })
        );
        this.onLogAdded?.();
        this.startSession(employer, project);
      } catch (error) {
        this.modal.showFeedback(error.message || "עדכון הדיווח הקודם נכשל.");
      }
    });
  }

  /** The project used in the most recent log of this employer, if it still exists. */
  getDefaultProjectId(employerId) {
    const latest = (this.logRepo?.getAll() || [])
      .filter((log) => log.employerId === employerId && log.projectId)
      .sort(
        (a, b) => compareHebrewDatesDesc(a.date, b.date) || String(b.start).localeCompare(String(a.start))
      )[0];
    return latest && this.projectRepo?.getById(latest.projectId) ? latest.projectId : NO_PROJECT;
  }

  buildProjectOptionsHtml(employerId, selectedId = NO_PROJECT) {
    const projects = employerId ? this.projectRepo?.getByEmployer(employerId) || [] : [];
    const options = [
      `<option value="${NO_PROJECT}" ${selectedId === NO_PROJECT ? "selected" : ""}>ללא פרויקט</option>`,
      ...projects.map(
        (project) =>
          `<option value="${project.id}" ${project.id === selectedId ? "selected" : ""}>${escapeHtml(project.name)}${project.isFixed ? " (לפי עבודה)" : project.isUnit ? " (לפי יחידה)" : ""}</option>`
      ),
      `<option value="${NEW_PROJECT}" ${selectedId === NEW_PROJECT ? "selected" : ""}>➕ פרויקט חדש…</option>`
    ];
    return options.join("");
  }

  updateProjectBillingHint() {
    const select = document.getElementById("projectSelect");
    const hint = document.getElementById("projectBillingHint");
    const newFields = document.getElementById("newProjectFields");
    const newBilling = document.getElementById("newProjectBilling");
    const newPriceWrap = document.getElementById("newProjectPriceWrap");
    const newUnitWrap = document.getElementById("newProjectUnitWrap");
    if (!select || !hint) {
      return;
    }

    const isNew = select.value === NEW_PROJECT;
    if (newFields) {
      newFields.hidden = !isNew;
    }
    if (newPriceWrap) {
      newPriceWrap.hidden = newBilling?.value !== BILLING_TYPES.FIXED;
    }
    if (newUnitWrap) {
      newUnitWrap.hidden = newBilling?.value !== BILLING_TYPES.UNIT;
    }

    const project = this.projectRepo?.getById(select.value);
    const billingType = isNew ? newBilling?.value : project?.billingType;
    const hints = {
      [BILLING_TYPES.FIXED]:
        "💡 פרויקט לפי עבודה — הטיימר ימדוד כמה זמן לקח, אבל הזמן לא ייכנס לחישוב השכר לפי שעה.",
      [BILLING_TYPES.UNIT]:
        "💡 פרויקט לפי יחידה — ליד כפתור ההערה יופיע «עובד על מס׳ …» עם כפתור «סיימתי», ומשלמים לפי הכמות ולא לפי הזמן."
    };
    hint.textContent = hints[billingType] || "";
    hint.hidden = !hints[billingType];
  }

  bindProjectPicker() {
    const employerSelect = document.getElementById("employerSelect");
    const projectSelect = document.getElementById("projectSelect");
    const newEmployerInput = document.getElementById("newEmployerName");
    const newBilling = document.getElementById("newProjectBilling");

    const rebuild = () => {
      const typingNewEmployer = Boolean(newEmployerInput?.value.trim());
      const employerId = typingNewEmployer ? null : employerSelect?.value;
      const current = projectSelect.value;
      const keep =
        current === NEW_PROJECT ||
        (current && this.projectRepo?.getById(current)?.employerId === employerId);
      const selected = keep ? current : employerId ? this.getDefaultProjectId(employerId) : NO_PROJECT;
      projectSelect.innerHTML = this.buildProjectOptionsHtml(employerId, selected);
      this.updateProjectBillingHint();
    };

    employerSelect?.addEventListener("change", rebuild);
    newEmployerInput?.addEventListener("input", rebuild);
    projectSelect?.addEventListener("change", () => this.updateProjectBillingHint());
    newBilling?.addEventListener("change", () => this.updateProjectBillingHint());
    this.updateProjectBillingHint();
  }

  /**
   * Reads the project part of the start dialog.
   * Returns { project } (null = no project) or { error, field }.
   */
  async resolveProjectSelection(employerId) {
    const select = document.getElementById("projectSelect");
    const value = select?.value || NO_PROJECT;

    if (value === NO_PROJECT) {
      return { project: null };
    }

    if (value !== NEW_PROJECT) {
      const project = this.projectRepo?.getById(value);
      if (!project || project.employerId !== employerId) {
        return { error: "יש לבחור פרויקט.", field: select };
      }
      return { project };
    }

    const nameInput = document.getElementById("newProjectName");
    const name = nameInput?.value.trim() || "";
    if (!name) {
      return { error: "יש להזין שם לפרויקט החדש.", field: nameInput };
    }
    if (this.projectRepo.nameExists(employerId, name)) {
      return { error: "פרויקט בשם זה כבר קיים אצל המעסיק.", field: nameInput };
    }

    const billingType = document.getElementById("newProjectBilling")?.value || BILLING_TYPES.HOURLY;
    const readPrice = (input) => {
      const raw = input?.value ?? "";
      return raw === "" ? null : Number(raw);
    };
    const isBadPrice = (price) => price !== null && (!Number.isFinite(price) || price < 0);

    let fixedPrice = null;
    let unitPrice = null;
    let unitName = null;
    let unitSingular = null;
    if (billingType === BILLING_TYPES.FIXED) {
      const priceInput = document.getElementById("newProjectPrice");
      fixedPrice = readPrice(priceInput);
      if (isBadPrice(fixedPrice)) {
        return { error: "מחיר לעבודה חייב להיות מספר חיובי.", field: priceInput };
      }
    }
    if (billingType === BILLING_TYPES.UNIT) {
      const unitPriceInput = document.getElementById("newProjectUnitPrice");
      unitPrice = readPrice(unitPriceInput);
      if (isBadPrice(unitPrice)) {
        return { error: "מחיר ליחידה חייב להיות מספר חיובי.", field: unitPriceInput };
      }
      unitName = document.getElementById("newProjectUnitName")?.value.trim() || null;
      unitSingular = document.getElementById("newProjectUnitSingular")?.value.trim() || null;
    }

    try {
      const project = await this.projectRepo.save(
        Project.create(
          { employerId, name, billingType, fixedPrice, unitPrice, unitName, unitSingular },
          generateId
        )
      );
      this.onEmployersChanged?.();
      return { project };
    } catch (error) {
      return { error: error.message || "שמירת הפרויקט נכשלה.", field: nameInput };
    }
  }

  showAddFirstEmployerModal() {
    this.modal.show({
      title: "הוסף מעסיק ראשון",
      bodyHtml: `
        <p class="modal-hint">כדי להתחיל לעבוד, צריך לפחות מעסיק אחד.</p>
        <label class="field-label" for="firstEmployerName">שם המעסיק</label>
        <input id="firstEmployerName" type="text" class="field-input" placeholder="לדוגמה: חברת ABC" autocomplete="off" />
      `,
      confirmText: "הוסף והתחל",
      onConfirm: async () => {
        const input = document.getElementById("firstEmployerName");
        const result = await this.createEmployerFromNameAsync(input?.value || "");
        if (result.error) {
          this.modal.showFeedback(result.error);
          this.modal.focusField(input);
          return;
        }

        try {
          await this.startWithEmployer(result.employer);
        } catch (error) {
          this.modal.showFeedback(error.message || "לא ניתן להתחיל עבודה.");
        }
      }
    });
  }

  showEmployerPicker(employers) {
    const recent = this.employerRepo.getRecentEmployers(3);
    const defaultId = this.employerRepo.getLastSelectedId() || recent[0]?.id || employers[0].id;

    const optionsHtml = employers
      .map(
        (employer) =>
          `<option value="${employer.id}" ${employer.id === defaultId ? "selected" : ""}>${escapeHtml(employer.name)}</option>`
      )
      .join("");

    this.modal.show({
      title: "בחירת מעסיק",
      bodyHtml: `
        <label class="field-label" for="employerSelect">מי המעסיק?</label>
        <select id="employerSelect" class="field-input">${optionsHtml}</select>
        <div class="modal-divider"><span>או</span></div>
        <label class="field-label" for="newEmployerName">מעסיק חדש</label>
        <input id="newEmployerName" type="text" class="field-input" placeholder="הקלד שם מעסיק חדש…" autocomplete="off" />
        <p class="modal-hint">מעסיק חדש יישמר אוטומטית בדף ההגדרות.</p>
        <div class="modal-divider"><span>פרויקט</span></div>
        <label class="field-label" for="projectSelect">על איזה פרויקט עובדים?</label>
        <select id="projectSelect" class="field-input">${this.buildProjectOptionsHtml(defaultId, this.getDefaultProjectId(defaultId))}</select>
        <div id="newProjectFields" class="new-project-fields" hidden>
          <label class="field-label" for="newProjectName">שם הפרויקט</label>
          <input id="newProjectName" type="text" class="field-input" placeholder="לדוגמה: עיצוב לוגו" autocomplete="off" />
          <label class="field-label" for="newProjectBilling">איך משלמים?</label>
          <select id="newProjectBilling" class="field-input">
            <option value="${BILLING_TYPES.HOURLY}">לפי שעה</option>
            <option value="${BILLING_TYPES.FIXED}">לפי עבודה (מחיר קבוע)</option>
            <option value="${BILLING_TYPES.UNIT}">לפי יחידה (למשל לפי תיק)</option>
          </select>
          <div id="newProjectPriceWrap" hidden>
            <label class="field-label" for="newProjectPrice">כמה אתה לוקח על העבודה? (₪)</label>
            <input id="newProjectPrice" type="number" class="field-input" min="0" step="0.01" placeholder="לדוגמה: 500" />
          </div>
          <div id="newProjectUnitWrap" hidden>
            <label class="field-label" for="newProjectUnitSingular">מה סופרים? (ביחיד)</label>
            <input id="newProjectUnitSingular" type="text" class="field-input" placeholder="לדוגמה: תיק" autocomplete="off" />
            <label class="field-label" for="newProjectUnitName">וברבים</label>
            <input id="newProjectUnitName" type="text" class="field-input" placeholder="לדוגמה: תיקים" autocomplete="off" />
            <label class="field-label" for="newProjectUnitPrice">כמה מקבלים על כל אחד? (₪)</label>
            <input id="newProjectUnitPrice" type="number" class="field-input" min="0" step="0.01" placeholder="לדוגמה: 50" />
          </div>
        </div>
        <p id="projectBillingHint" class="modal-hint project-billing-hint" hidden></p>
      `,
      confirmText: "התחלת עבודה",
      onConfirm: async () => {
        const newNameInput = document.getElementById("newEmployerName");
        const newName = newNameInput?.value.trim() || "";

        if (newName) {
          const result = await this.createEmployerFromNameAsync(newName);
          if (result.error) {
            this.modal.showFeedback(result.error);
            this.modal.focusField(newNameInput);
            return;
          }
          const projectResult = await this.resolveProjectSelection(result.employer.id);
          if (projectResult.error) {
            this.modal.showFeedback(projectResult.error);
            this.modal.focusField(projectResult.field);
            return;
          }
          try {
            await this.startWithEmployer(result.employer, projectResult.project);
          } catch (error) {
            this.modal.showFeedback(error.message || "לא ניתן להתחיל עבודה.");
            this.modal.focusField(newNameInput);
            return;
          }
          return;
        }

        const select = document.getElementById("employerSelect");
        const employer = this.employerRepo.getById(select.value);
        if (!employer) {
          this.modal.showFeedback("יש לבחור מעסיק.");
          this.modal.focusField(select);
          return;
        }

        const projectResult = await this.resolveProjectSelection(employer.id);
        if (projectResult.error) {
          this.modal.showFeedback(projectResult.error);
          this.modal.focusField(projectResult.field);
          return;
        }

        try {
          await this.startWithEmployer(employer, projectResult.project);
        } catch (error) {
          this.modal.showFeedback(error.message || "לא ניתן להתחיל עבודה.");
          this.modal.focusField(select);
        }
      }
    });

    this.bindProjectPicker();
  }

  handleSessionNote() {
    const snapshot = this.timerService.getSnapshot();
    if (!snapshot.isRunning) {
      return;
    }

    const currentNote = snapshot.sessionNote || "";

    this.modal.show({
      title: "הערה לדוח",
      bodyHtml: `
        <p class="modal-hint">ההערה תישמר עם הדוח כשתסיים את העבודה.</p>
        <label class="field-label" for="sessionNoteInput">הערה</label>
        <textarea id="sessionNoteInput" class="field-input note-textarea" placeholder="כתוב הערה…">${escapeHtml(currentNote)}</textarea>
      `,
      confirmText: "שמור",
      onConfirm: () => {
        const input = document.getElementById("sessionNoteInput");
        this.timerService.setSessionNote(input?.value || "");
        this.modal.hide();
      }
    });
  }

  handleStop() {
    void this.handleStopAsync();
  }

  async handleStopAsync() {
    const endTime = new Date();
    if (this.stopNeedsConfirm()) {
      this.showStopUnitsConfirm(endTime);
      return;
    }

    await this.finishSession(endTime);
  }

  stopNeedsConfirm() {
    const snapshot = this.timerService.getSnapshot();
    return snapshot.isRunning && snapshot.unitCount !== null && snapshot.unitCount !== undefined;
  }

  /**
   * Stop from the taskbar preview button. Brings the window up if the stop dialog must be
   * answered, or if there is no session to stop (the button is always enabled).
   */
  handleTaskbarStop() {
    if (!this.timerService.getSnapshot().isRunning) {
      window.electronAPI?.window?.show?.();
      return;
    }
    if (this.stopNeedsConfirm()) {
      window.electronAPI?.window?.show?.();
    }
    this.handleStop();
  }

  /**
   * Stop dialog for per-unit sessions. It must be answered: was the unit in progress finished,
   * or is it still open (then the next session asks whether to continue it)?
   */
  showStopUnitsConfirm(endTime) {
    const info = this.withProjectInfo(this.timerService.getSnapshot());
    const singular = escapeHtml(info.unitSingular || "יחידה");
    const plural = escapeHtml(info.unitName || "יחידות");
    const count = info.unitCount || 0;
    const current = info.currentUnitNumber;
    const firstDone = current - count;
    const unitsLabel = (n) => (n === 1 ? `1 ${singular}` : `${n} ${plural}`);

    let doneText = `לא סיימת ${plural} בסשן הזה.`;
    if (count === 1) {
      doneText = `סיימת את ${singular} מס' ${firstDone}.`;
    } else if (count > 1) {
      doneText = `סיימת ${count} ${plural} (מס' ${firstDone}–${current - 1}).`;
    }

    this.modal.show({
      title: "סיום עבודה",
      bodyHtml: `
        <p class="modal-hint">${escapeHtml(info.projectName || "")}</p>
        <p class="unit-question">${doneText}</p>
        <p class="unit-question unit-question-strong">${singular} מס' ${current} — סיימת גם אותו?</p>
        <div class="unit-choice-buttons">
          <button type="button" class="btn-action btn-start unit-choice-btn" id="stopUnitDone">
            ✓ כן, סיימתי (${unitsLabel(count + 1)})
          </button>
          <button type="button" class="btn-soft btn-lavender unit-choice-btn" id="stopUnitOpen">
            עוד בעבודה (${unitsLabel(count)})
          </button>
        </div>
      `,
      hideConfirm: true,
      cancelText: "המשך לעבוד"
    });

    document.getElementById("stopUnitDone")?.addEventListener("click", () => {
      this.modal.hide();
      this.timerService.setUnitCount(count + 1);
      void this.finishSession(endTime, { unitOpen: false });
    });
    document.getElementById("stopUnitOpen")?.addEventListener("click", () => {
      this.modal.hide();
      void this.finishSession(endTime, { unitOpen: true });
    });
  }

  async finishSession(endTime, { unitOpen = false } = {}) {
    try {
      const log = await this.timerService.stopAsync({ endTime, unitOpen });
      if (log) {
        this.onLogAdded?.();
        this.updateMotivation();
      }
    } catch (error) {
      console.error("Failed to save work log:", error);
      alert(error.message || "שמירת הדוח נכשלה.");
    }
  }

  updateMotivation(referenceDate = new Date()) {
    if (!this.view?.setMotivation || !this.reportService || !this.logRepo) {
      return;
    }

    const settings = this.employerRepo.settingsRepository.getSettings();
    const targetDays = settings.monthlyTargetDays ?? null;
    const hoursPerDay = settings.monthlyTargetHoursPerDay ?? null;
    if (!targetDays || !hoursPerDay || targetDays <= 0 || hoursPerDay <= 0) {
      this.view.setMotivation("");
      return;
    }

    const allLogs = this.logRepo.getAll();
    const monthLogs = this.reportService.getCurrentMonthLogs(allLogs, referenceDate);
    const actualHours = this.reportService.getTotalDurationMs(monthLogs) / 3600000;

    const daysElapsed = referenceDate.getDate();
    const expectedWorkDaysSoFar = Math.min(daysElapsed, targetDays);
    const expectedHours = expectedWorkDaysSoFar * hoursPerDay;
    const percent = expectedHours > 0 ? (actualHours / expectedHours) * 100 : 0;

    // Lazy import to keep controller lightweight
    import("../../core/utils/motivationPhrases.js")
      .then(({ getMotivationBucketIndex, pickMotivationPhrase }) => {
        const seed = referenceDate.toLocaleDateString("he-IL");
        const bucketIdx = getMotivationBucketIndex(percent);
        if (this.motivationBucketIdx !== bucketIdx) {
          this.motivationBucketIdx = bucketIdx;
          this.motivationPhraseIdx = 0;
        }
        const phrase = pickMotivationPhrase({
          percent,
          seed,
          index: this.motivationPhraseIdx || 0
        });
        this.view.setMotivation(phrase);
      })
      .catch(() => {
        // ignore
      });
  }

  rotateMotivationPhrase(referenceDate = new Date()) {
    const settings = this.employerRepo.settingsRepository.getSettings();
    const targetDays = settings.monthlyTargetDays ?? null;
    const hoursPerDay = settings.monthlyTargetHoursPerDay ?? null;
    if (!targetDays || !hoursPerDay || targetDays <= 0 || hoursPerDay <= 0) {
      return;
    }

    const allLogs = this.logRepo.getAll();
    const monthLogs = this.reportService.getCurrentMonthLogs(allLogs, referenceDate);
    const actualHours = this.reportService.getTotalDurationMs(monthLogs) / 3600000;
    const daysElapsed = referenceDate.getDate();
    const expectedWorkDaysSoFar = Math.min(daysElapsed, targetDays);
    const expectedHours = expectedWorkDaysSoFar * hoursPerDay;
    const percent = expectedHours > 0 ? (actualHours / expectedHours) * 100 : 0;

    import("../../core/utils/motivationPhrases.js")
      .then(({ getMotivationBucketIndex, getMotivationPhrases, pickMotivationPhrase }) => {
        const seed = referenceDate.toLocaleDateString("he-IL");
        const bucketIdx = getMotivationBucketIndex(percent);
        const phrases = getMotivationPhrases(percent);
        if (!phrases.length) {
          return;
        }
        if (this.motivationBucketIdx !== bucketIdx) {
          this.motivationBucketIdx = bucketIdx;
          this.motivationPhraseIdx = 0;
        } else {
          this.motivationPhraseIdx = ((this.motivationPhraseIdx || 0) + 1) % phrases.length;
        }
        const phrase = pickMotivationPhrase({
          percent,
          seed,
          index: this.motivationPhraseIdx || 0
        });
        this.view.setMotivation(phrase);
      })
      .catch(() => {
        // ignore
      });
  }
}
