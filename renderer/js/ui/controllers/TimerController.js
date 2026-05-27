import { Employer } from "../../core/models/Employer.js";
import { generateId } from "../../core/utils/uuid.js";

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
    onLogAdded,
    onEmployersChanged
  }) {
    this.view = view;
    this.modal = modal;
    this.timerService = timerService;
    this.employerRepo = employerRepo;
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

    this.timerService.subscribe((snapshot) => this.view.render(snapshot));
    this.timerService.restoreRunningSession();

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

  async startWithEmployer(employer) {
    const persisted = this.employerRepo.getById(employer.id);
    if (!persisted) {
      throw new Error("המעסיק לא נשמר. נסה שוב.");
    }

    await this.employerRepo.setLastSelected(persisted.id);
    this.timerService.start({
      employerId: persisted.id,
      employerName: persisted.name
    });
    this.modal.hide();
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
          try {
            await this.startWithEmployer(result.employer);
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

        try {
          await this.startWithEmployer(employer);
        } catch (error) {
          this.modal.showFeedback(error.message || "לא ניתן להתחיל עבודה.");
          this.modal.focusField(select);
        }
      }
    });
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
    try {
      const log = await this.timerService.stopAsync();
      if (log) {
        this.onLogAdded?.();
      }
    } catch (error) {
      console.error("Failed to save work log:", error);
      alert(error.message || "שמירת הדוח נכשלה.");
    }
  }
}
