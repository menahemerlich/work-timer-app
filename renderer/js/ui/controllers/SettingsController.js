import { Employer } from "../../core/models/Employer.js";
import { Project, BILLING_TYPES } from "../../core/models/Project.js";
import { generateId } from "../../core/utils/uuid.js";
import {
  describeProjectStats,
  formatMoney,
  sumMsByProject,
  sumUnitsByProject
} from "../../core/utils/projectBilling.js";
import { getCurrentRate, todayIsoDate } from "../../core/utils/employerRates.js";
import { confirmDialog, refocusSettingsInput } from "../components/ConfirmDialog.js";
import { restoreFieldFocus } from "../components/FocusGuard.js";

export class SettingsController {
  constructor({ view, employerRepo, projectRepo, logRepo, onEmployersChanged, modal }) {
    this.view = view;
    this.employerRepo = employerRepo;
    this.projectRepo = projectRepo;
    this.logRepo = logRepo;
    this.onEmployersChanged = onEmployersChanged;
    this.modal = modal;
    this.editingEmployerId = null;
  }

  init() {
    if (!this.view.addEmployerBtn || !this.view.employerNameInput) {
      console.error("Settings UI elements not found");
      return;
    }

    this.view.addEmployerBtn.addEventListener("click", () => this.handleAdd());
    this.view.employerNameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.handleAdd();
      }
    });

    this.refresh();

    this.view.hardPullBtn?.addEventListener("click", () => {
      void this.handleHardPullFromCloud();
    });

    this.view.monthlyTargetHoursPerDayInput?.addEventListener("change", () => {
      void this.handleMonthlyTargetsChanged();
    });

    this.view.earningsWindowCornerSelect?.addEventListener("change", () => {
      void this.handleEarningsWindowCornerChanged();
    });

    this.view.openEarningsBtn?.addEventListener("click", () => {
      window.electronAPI?.earnings?.open();
      this.view.showFeedback("חלון הרווח נפתח.");
    });

    this.view.motivationPositionSelect?.addEventListener("change", () => {
      void this.handleMotivationSettingsChanged();
    });
    this.view.motivationIntervalInput?.addEventListener("change", () => {
      void this.handleMotivationSettingsChanged();
    });
    this.view.motivationDurationInput?.addEventListener("change", () => {
      void this.handleMotivationSettingsChanged();
    });

    // Keep project time totals current; skip while the user is typing in the list.
    window.addEventListener("logs:changed", () => this.refreshIfIdle());
    window.addEventListener("projects:changed", () => this.refreshIfIdle());
  }

  refreshIfIdle() {
    const active = document.activeElement;
    if (active && this.view.employersList?.contains(active)) {
      return;
    }
    this.refresh();
  }

  refresh() {
    const settings = this.employerRepo.settingsRepository.getSettings?.()
      ? this.employerRepo.settingsRepository.getSettings()
      : { monthlyTargetHoursPerDay: null, earningsWindowCorner: null };

    if (this.view.monthlyTargetHoursPerDayInput) {
      this.view.monthlyTargetHoursPerDayInput.value = settings.monthlyTargetHoursPerDay ?? "";
    }
    if (this.view.earningsWindowCornerSelect) {
      this.view.earningsWindowCornerSelect.value = settings.earningsWindowCorner || "top-left";
    }
    if (this.view.motivationPositionSelect) {
      this.view.motivationPositionSelect.value = settings.motivationPosition || "top";
    }
    if (this.view.motivationIntervalInput) {
      this.view.motivationIntervalInput.value = settings.motivationIntervalMinutes ?? "";
    }
    if (this.view.motivationDurationInput) {
      this.view.motivationDurationInput.value = settings.motivationDurationSeconds ?? "";
    }

    const allLogs = this.logRepo?.getAll() || [];
    const projectTotals = sumMsByProject(allLogs);
    const projectUnits = sumUnitsByProject(allLogs);

    this.view.renderEmployers(this.employerRepo.getAll(), {
      editingId: this.editingEmployerId,
      onStartEdit: (id) => {
        this.editingEmployerId = id;
        this.refresh();
      },
      onSaveEdit: (id, name) => this.handleEdit(id, name),
      onCancelEdit: () => {
        this.editingEmployerId = null;
        this.refresh();
        refocusSettingsInput();
      },
      onDelete: (id) => {
        void this.handleDelete(id);
      },
      onSetHourlyRate: (id, rate) => {
        void this.handleSetHourlyRate(id, rate);
      },
      onAddRaise: (id) => this.handleAddRaise(id),
      onRemoveRaise: (id, from) => {
        void this.handleRemoveRaise(id, from);
      },
      getProjects: (employerId) => this.projectRepo?.getByEmployer(employerId) || [],
      getProjectStats: (project) =>
        describeProjectStats(
          project,
          projectTotals.get(project.id) || 0,
          projectUnits.get(project.id) || 0
        ),
      onAddProject: (employerId, values) => {
        void this.handleAddProject(employerId, values);
      },
      onUpdateProject: (id, changes) => {
        void this.handleUpdateProject(id, changes);
      },
      onDeleteProject: (id) => {
        void this.handleDeleteProject(id);
      }
    });
  }

  validateProjectPrice(price, message = "מחיר לעבודה חייב להיות מספר חיובי.") {
    if (price !== null && price !== undefined && (Number.isNaN(price) || price < 0)) {
      this.view.showFeedback(message, "error");
      return false;
    }
    return true;
  }

  async handleAddProject(employerId, { name, billingType, fixedPrice, unitPrice, unitName, unitSingular }) {
    const trimmed = (name || "").trim();
    if (!trimmed) {
      this.view.showFeedback("יש להזין שם פרויקט.", "error");
      return;
    }
    if (this.projectRepo.nameExists(employerId, trimmed)) {
      this.view.showFeedback("פרויקט בשם זה כבר קיים אצל המעסיק.", "error");
      return;
    }
    if (
      !this.validateProjectPrice(fixedPrice) ||
      !this.validateProjectPrice(unitPrice, "מחיר ליחידה חייב להיות מספר חיובי.")
    ) {
      return;
    }

    try {
      await this.projectRepo.save(
        Project.create(
          { employerId, name: trimmed, billingType, fixedPrice, unitPrice, unitName, unitSingular },
          generateId
        )
      );
      this.view.openProjectBlocks?.add(employerId);
      this.refresh();
      this.view.showFeedback(`הפרויקט "${trimmed}" נוסף.`);
      this.onEmployersChanged?.();
    } catch (error) {
      this.refresh();
      this.view.showFeedback(error.message || "שמירת הפרויקט נכשלה.", "error");
    }
  }

  async handleUpdateProject(id, changes) {
    const project = this.projectRepo.getById(id);
    if (!project) {
      return;
    }

    const next = { ...changes };
    if (next.name !== undefined) {
      next.name = next.name.trim();
      if (!next.name) {
        this.view.showFeedback("שם פרויקט לא יכול להיות ריק.", "error");
        this.refresh();
        return;
      }
      if (this.projectRepo.nameExists(project.employerId, next.name, id)) {
        this.view.showFeedback("פרויקט בשם זה כבר קיים אצל המעסיק.", "error");
        this.refresh();
        return;
      }
    }
    if (next.fixedPrice !== undefined && !this.validateProjectPrice(next.fixedPrice)) {
      return;
    }
    if (
      next.unitPrice !== undefined &&
      !this.validateProjectPrice(next.unitPrice, "מחיר ליחידה חייב להיות מספר חיובי.")
    ) {
      return;
    }

    try {
      await this.projectRepo.update(id, next);
      this.refresh();
      if (next.billingType === BILLING_TYPES.FIXED) {
        this.view.showFeedback("הפרויקט עבר לתשלום לפי עבודה — הזמן שלו לא ייספר בשכר לפי שעה.");
      } else if (next.billingType === BILLING_TYPES.UNIT) {
        this.view.showFeedback("הפרויקט עבר לתשלום לפי יחידה — הגדר שם יחידה ומחיר ליחידה.");
      } else {
        this.view.showFeedback("הפרויקט עודכן.");
      }
      this.onEmployersChanged?.();
    } catch (error) {
      this.refresh();
      this.view.showFeedback(error.message || "עדכון הפרויקט נכשל.", "error");
    }
  }

  async handleDeleteProject(id) {
    const confirmed = await confirmDialog(
      "למחוק את הפרויקט? דוחות קיימים יישמרו עם שם הפרויקט."
    );
    if (!confirmed) {
      refocusSettingsInput();
      return;
    }

    try {
      await this.projectRepo.delete(id);
      this.refresh();
      refocusSettingsInput();
      this.onEmployersChanged?.();
    } catch (error) {
      this.refresh();
      this.view.showFeedback(error.message || "מחיקת הפרויקט נכשלה.", "error");
    }
  }

  async handleAdd() {
    const name = this.view.getInputValue();
    if (!name) {
      this.view.showFeedback("יש להזין שם מעסיק.", "error");
      restoreFieldFocus(this.view.employerNameInput);
      return;
    }

    if (this.employerRepo.nameExists(name)) {
      this.view.showFeedback("מעסיק בשם זה כבר קיים.", "error");
      restoreFieldFocus(this.view.employerNameInput);
      return;
    }

    try {
      await this.employerRepo.add(
        Employer.create(name, generateId, this.employerRepo.getAll().length)
      );
      this.view.clearInput();
      this.editingEmployerId = null;
      this.refresh();
      this.view.showFeedback(`המעסיק "${name}" נוסף בהצלחה!`);
      restoreFieldFocus(this.view.employerNameInput);
      this.onEmployersChanged?.();
    } catch (error) {
      this.refresh();
      this.view.showFeedback(error.message || "שמירה מקומית נכשלה.", "error");
      restoreFieldFocus(this.view.employerNameInput);
    }
  }

  async handleEdit(id, name) {
    if (!name.trim()) {
      this.view.showFeedback("שם מעסיק לא יכול להיות ריק.", "error");
      return;
    }

    if (this.employerRepo.nameExists(name, id)) {
      this.view.showFeedback("מעסיק בשם זה כבר קיים.", "error");
      return;
    }

    try {
      await this.employerRepo.update(id, name);
      this.editingEmployerId = null;
      this.refresh();
      this.view.showFeedback("שם המעסיק עודכן.");
      refocusSettingsInput();
      this.onEmployersChanged?.();
    } catch (error) {
      this.refresh();
      this.view.showFeedback(error.message || "עדכון נכשל.", "error");
    }
  }

  async handleDelete(id) {
    const confirmed = await confirmDialog(
      "למחוק את המעסיק? גם הפרויקטים שלו יימחקו. דוחות קיימים יישמרו עם השם הנוכחי."
    );

    if (!confirmed) {
      refocusSettingsInput();
      return;
    }

    if (this.editingEmployerId === id) {
      this.editingEmployerId = null;
    }

    this.view.preserveFocusBeforeListUpdate();
    try {
      await this.employerRepo.delete(id);
      // Otherwise the projects stay active and fixed prices keep counting in the totals.
      await this.projectRepo?.deleteByEmployer(id);
      this.refresh();
      refocusSettingsInput();
      this.onEmployersChanged?.();
    } catch (error) {
      this.refresh();
      this.view.showFeedback(error.message || "מחיקה נכשלה.", "error");
      refocusSettingsInput();
    }
  }

  async handleSetHourlyRate(id, rate) {
    if (rate !== null && (Number.isNaN(rate) || rate < 0)) {
      this.view.showFeedback("תעריף לשעה חייב להיות מספר חיובי.", "error");
      return;
    }

    try {
      await this.employerRepo.setHourlyRate(id, rate);
      this.view.showFeedback("התעריף עודכן.");
      this.onEmployersChanged?.();
    } catch (error) {
      this.view.showFeedback(error.message || "עדכון תעריף נכשל.", "error");
    }
  }

  handleAddRaise(id) {
    const employer = this.employerRepo.getById(id);
    if (!employer || !this.modal) {
      return;
    }

    const current = getCurrentRate(employer);
    this.modal.show({
      title: `💰 עדכון שכר — ${employer.name}`,
      bodyHtml: `
        <p class="modal-hint">התעריף החדש ייחשב רק לדוחות מהתאריך שנבחר והלאה. דוחות קודמים נשארים בתעריף הקודם.${
          current === null ? "" : ` תעריף נוכחי: ${formatMoney(current)}.`
        }</p>
        <label class="field-label" for="raiseRate">₪ לשעה (חדש)</label>
        <input id="raiseRate" type="number" inputmode="decimal" step="0.01" min="0" class="field-input" placeholder="לדוגמה: 80" />
        <label class="field-label" for="raiseFrom">החל מתאריך</label>
        <input id="raiseFrom" type="date" class="field-input" value="${todayIsoDate()}" />
      `,
      confirmText: "שמירה",
      onConfirm: () => {
        const raw = document.getElementById("raiseRate")?.value ?? "";
        const rate = Number(raw);
        const from = document.getElementById("raiseFrom")?.value || "";
        if (raw === "" || !Number.isFinite(rate) || rate < 0) {
          this.modal.showFeedback("יש להזין תעריף חוקי.");
          return;
        }
        if (!from) {
          this.modal.showFeedback("יש לבחור תאריך.");
          return;
        }
        void this.saveRaise(id, { rate, from });
      }
    });
  }

  async saveRaise(id, raise) {
    try {
      await this.employerRepo.addRaise(id, raise);
      this.modal.hide();
      this.refresh();
      this.view.showFeedback("עדכון השכר נשמר.");
      this.onEmployersChanged?.();
    } catch (error) {
      this.modal.showFeedback(error.message || "שמירת עדכון השכר נכשלה.");
    }
  }

  async handleRemoveRaise(id, from) {
    if (!(await confirmDialog("למחוק את עדכון השכר? הדוחות מהתאריך הזה יחושבו לפי התעריף הקודם."))) {
      return;
    }

    try {
      await this.employerRepo.removeRaise(id, from);
      this.refresh();
      this.view.showFeedback("עדכון השכר נמחק.");
      this.onEmployersChanged?.();
    } catch (error) {
      this.view.showFeedback(error.message || "מחיקת עדכון השכר נכשלה.", "error");
    }
  }

  async handleMonthlyTargetsChanged() {
    const hoursRaw = this.view.monthlyTargetHoursPerDayInput?.value ?? "";

    const hours = hoursRaw === "" ? null : Number(hoursRaw);

    if (hours !== null && (!Number.isFinite(hours) || hours < 0)) {
      this.view.showFeedback("שעות יעד ליום חייב להיות מספר חיובי.", "error");
      return;
    }

    try {
      await this.employerRepo.settingsRepository.saveMonthlyTargets({
        monthlyTargetDays: null,
        monthlyTargetHoursPerDay: hours
      });
      this.view.showFeedback("היעד החודשי עודכן.");
      this.onEmployersChanged?.();
    } catch (error) {
      this.view.showFeedback(error.message || "עדכון יעד חודשי נכשל.", "error");
    }
  }

  async handleEarningsWindowCornerChanged() {
    const corner = this.view.earningsWindowCornerSelect?.value || "top-left";
    try {
      await this.employerRepo.settingsRepository.saveEarningsWindowCorner(corner);
      this.view.showFeedback("מיקום חלון הרווח עודכן.");
    } catch (error) {
      this.view.showFeedback(error.message || "עדכון מיקום החלון נכשל.", "error");
    }
  }

  async handleMotivationSettingsChanged() {
    const position = this.view.motivationPositionSelect?.value || "top";
    const intervalRaw = this.view.motivationIntervalInput?.value ?? "";
    const durationRaw = this.view.motivationDurationInput?.value ?? "";

    const intervalMinutes = intervalRaw === "" ? null : Number(intervalRaw);
    const durationSeconds = durationRaw === "" ? null : Number(durationRaw);

    if (intervalMinutes !== null && (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0)) {
      this.view.showFeedback("תדירות חייבת להיות מספר חיובי.", "error");
      return;
    }
    if (durationSeconds !== null && (!Number.isFinite(durationSeconds) || durationSeconds <= 0)) {
      this.view.showFeedback("משך חייב להיות מספר חיובי.", "error");
      return;
    }

    try {
      await this.employerRepo.settingsRepository.saveMotivationSettings({
        position,
        intervalMinutes,
        durationSeconds
      });
      this.view.showFeedback("הגדרות באנר המוטיבציה עודכנו.");
    } catch (error) {
      this.view.showFeedback(error.message || "עדכון הגדרות הבאנר נכשל.", "error");
    }
  }

  async handleHardPullFromCloud() {
    const confirmed = await confirmDialog(
      "למשוך מהענן ולהחליף את כל הנתונים המקומיים? פעולה זו מוחקת נתונים מקומיים שאינם בענן."
    );
    if (!confirmed) {
      return;
    }

    if (!this.modal) {
      alert("חלונית לא זמינה.");
      return;
    }

    this.modal.show({
      title: "משיכת נתונים מהענן",
      bodyHtml: `
        <p class="modal-hint">
          הפעולה תחליף את כל הנתונים המקומיים במה שקיים בענן.
        </p>
        <label class="field-label">סיסמה</label>
        <input id="hardPullPassword" type="password" class="field-input" autocomplete="current-password" />
      `,
      confirmText: "משוך",
      onConfirm: async () => {
        const pwd = document.getElementById("hardPullPassword")?.value || "";
        try {
          await window.electronAPI?.sync?.hardPullReplaceLocal(pwd);
          this.modal.hide();
          this.view.showFeedback("הנתונים נמשכו מהענן. מרענן…");
          setTimeout(() => window.location.reload(), 300);
        } catch (error) {
          this.modal.showFeedback(error.message || "המשיכה מהענן נכשלה.");
        }
      }
    });
  }
}
