import { Employer } from "../../core/models/Employer.js";
import { generateId } from "../../core/utils/uuid.js";
import { confirmDialog, refocusSettingsInput } from "../components/ConfirmDialog.js";
import { restoreFieldFocus } from "../components/FocusGuard.js";

export class SettingsController {
  constructor({ view, employerRepo, onEmployersChanged }) {
    this.view = view;
    this.employerRepo = employerRepo;
    this.onEmployersChanged = onEmployersChanged;
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
  }

  refresh() {
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
}
