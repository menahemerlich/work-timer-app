import { Employer } from "../../core/models/Employer.js";
import { generateId } from "../../core/utils/uuid.js";
import { confirmDialog, refocusSettingsInput } from "../components/ConfirmDialog.js";
import { restoreFieldFocus } from "../components/FocusGuard.js";

export class SettingsController {
  constructor({ view, employerRepo, onEmployersChanged, modal }) {
    this.view = view;
    this.employerRepo = employerRepo;
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

    this.view.monthlyTargetDaysInput?.addEventListener("change", () => {
      void this.handleMonthlyTargetsChanged();
    });
    this.view.monthlyTargetHoursPerDayInput?.addEventListener("change", () => {
      void this.handleMonthlyTargetsChanged();
    });
  }

  refresh() {
    const settings = this.employerRepo.settingsRepository.getSettings?.()
      ? this.employerRepo.settingsRepository.getSettings()
      : { monthlyTargetDays: null, monthlyTargetHoursPerDay: null };

    if (this.view.monthlyTargetDaysInput) {
      this.view.monthlyTargetDaysInput.value = settings.monthlyTargetDays ?? "";
    }
    if (this.view.monthlyTargetHoursPerDayInput) {
      this.view.monthlyTargetHoursPerDayInput.value = settings.monthlyTargetHoursPerDay ?? "";
    }

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
      }
    });
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
      "למחוק את המעסיק? דוחות קיימים יישמרו עם השם הנוכחי."
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

  async handleMonthlyTargetsChanged() {
    const daysRaw = this.view.monthlyTargetDaysInput?.value ?? "";
    const hoursRaw = this.view.monthlyTargetHoursPerDayInput?.value ?? "";

    const days = daysRaw === "" ? null : Number(daysRaw);
    const hours = hoursRaw === "" ? null : Number(hoursRaw);

    if (days !== null && (!Number.isFinite(days) || days < 0)) {
      this.view.showFeedback("ימי יעד חייב להיות מספר חיובי.", "error");
      return;
    }
    if (hours !== null && (!Number.isFinite(hours) || hours < 0)) {
      this.view.showFeedback("שעות יעד ליום חייב להיות מספר חיובי.", "error");
      return;
    }

    try {
      await this.employerRepo.settingsRepository.saveMonthlyTargets({
        monthlyTargetDays: days,
        monthlyTargetHoursPerDay: hours
      });
      this.view.showFeedback("היעד החודשי עודכן.");
      this.onEmployersChanged?.();
    } catch (error) {
      this.view.showFeedback(error.message || "עדכון יעד חודשי נכשל.", "error");
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
