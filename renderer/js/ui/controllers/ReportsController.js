import { WorkLog } from "../../core/models/WorkLog.js";
import { UNKNOWN_EMPLOYER } from "../../../../shared/constants/storageKeys.js";
import {
  formatDateInputValue,
  formatHebrewDateFromInput
} from "../../core/utils/dateParse.js";
import { formatDuration } from "../../core/utils/timeFormat.js";
import { generateId } from "../../core/utils/uuid.js";
import { confirmDialog } from "../components/ConfirmDialog.js";

export class ReportsController {
  constructor({
    view,
    modal,
    logRepo,
    employerRepo,
    reportService,
    validationService,
    csvExporter,
    csvImporter,
    jsonBackupService
  }) {
    this.view = view;
    this.modal = modal;
    this.logRepo = logRepo;
    this.employerRepo = employerRepo;
    this.reportService = reportService;
    this.validationService = validationService;
    this.csvExporter = csvExporter;
    this.csvImporter = csvImporter;
    this.jsonBackupService = jsonBackupService;
  }

  init() {
    this.view.employerFilter.addEventListener("change", () => this.refresh());
    this.view.dateFrom.addEventListener("change", () => this.refresh());
    this.view.dateTo.addEventListener("change", () => this.refresh());
    this.view.addManualLogBtn?.addEventListener("click", () => this.handleAddManual());
    this.view.exportFilteredBtn.addEventListener("click", () => this.exportFiltered());
    this.view.exportEndDayBtn.addEventListener("click", () => this.exportEndDay());
    this.view.exportCurrentMonthBtn.addEventListener("click", () => this.exportCurrentMonth());
    this.view.loadFromFileBtn.addEventListener("click", () => this.view.fileInput.click());
    this.view.exportBackupBtn.addEventListener("click", () => this.jsonBackupService.exportBackup());
    this.view.importBackupBtn.addEventListener("click", () => this.view.backupInput.click());
    this.view.resetBtn.addEventListener("click", () => this.handleReset());

    this.view.fileInput.addEventListener("change", (event) => this.handleCsvImport(event));
    this.view.backupInput.addEventListener("change", (event) => this.handleBackupImport(event));

    this.refresh();
  }

  getFilters() {
    return {
      employerFilter: this.view.employerFilter.value,
      dateFrom: this.view.dateFrom.value || null,
      dateTo: this.view.dateTo.value || null
    };
  }

  getFilteredLogs() {
    const allLogs = this.logRepo.getAll();
    return this.applyEmployerFilter(allLogs, this.getFilters());
  }

  applyEmployerFilter(logs, filters) {
    const { employerFilter, dateFrom, dateTo } = filters;

    if (employerFilter === "all") {
      return this.reportService.filterLogs(logs, { employerFilter: "all", dateFrom, dateTo });
    }

    if (employerFilter.startsWith("name:")) {
      const name = employerFilter.slice(5);
      return logs.filter((log) => {
        if (log.employerName !== name) {
          return false;
        }
        return this.reportService.filterLogs([log], { employerFilter: "all", dateFrom, dateTo }).length > 0;
      });
    }

    const employer = this.employerRepo.getById(employerFilter);
    if (employer) {
      return this.reportService.filterLogs(logs, { employerFilter: "all", dateFrom, dateTo }).filter(
        (log) => log.employerId === employer.id || log.employerName === employer.name
      );
    }

    return this.reportService.filterLogs(logs, { employerFilter: "all", dateFrom, dateTo });
  }

  refresh() {
    const allLogs = this.logRepo.getAll();
    const activeEmployers = this.employerRepo.getAll();
    const filterOptions = this.reportService.getEmployerFilterOptions(allLogs, activeEmployers);
    const currentValue = this.view.employerFilter.value || "all";
    this.view.setEmployerFilterOptions(filterOptions, activeEmployers);

    const hasOption = Array.from(this.view.employerFilter.options).some(
      (option) => option.value === currentValue
    );
    this.view.employerFilter.value = hasOption ? currentValue : "all";

    const filteredLogs = this.getFilteredLogs();
    this.view.renderLogs(filteredLogs, {
      onEdit: (log) => this.handleEdit(log),
      onDelete: (log) => this.handleDelete(log),
      onShowNote: (log) => this.handleShowNote(log)
    });

    const totalMs = this.reportService.getTotalDurationMs(filteredLogs);
    this.view.renderTotal(formatDuration(totalMs));

    const monthLogs = this.reportService.getCurrentMonthLogs(allLogs);
    this.view.renderMonthlySummary(this.reportService.getSummaryByEmployer(monthLogs));
  }

  buildLogFormHtml({ log, employers, requireEmployer = false }) {
    const defaultDate = log
      ? formatDateInputValue(log.date)
      : formatDateInputValue(new Date().toLocaleDateString("he-IL"));
    const defaultStart = log?.start || "09:00";
    const defaultEnd = log?.end || "17:00";
    const selectedEmployerId = log?.employerId || employers[0]?.id || "";

    const employerOptions = employers
      .map(
        (employer) =>
          `<option value="${employer.id}" ${employer.id === selectedEmployerId ? "selected" : ""}>${employer.name}</option>`
      )
      .join("");

    const employerField = requireEmployer
      ? `
        <label class="field-label">מעסיק *</label>
        <select id="logFormEmployer" class="field-input" required>
          ${employerOptions}
        </select>
      `
      : `
        <label class="field-label">מעסיק</label>
        <select id="logFormEmployer" class="field-input">
          <option value="" ${!log?.employerId ? "selected" : ""}>${log?.employerName || UNKNOWN_EMPLOYER}</option>
          ${employerOptions}
        </select>
      `;

    return `
      <label class="field-label">תאריך</label>
      <input id="logFormDate" type="date" class="field-input" value="${defaultDate}" />
      <label class="field-label">שעת התחלה</label>
      <input id="logFormStart" type="time" step="1" class="field-input" value="${defaultStart}" />
      <label class="field-label">שעת סיום</label>
      <input id="logFormEnd" type="time" step="1" class="field-input" value="${defaultEnd}" />
      ${employerField}
      <label class="field-label">הערה</label>
      <textarea id="logFormNote" class="field-input note-textarea" placeholder="הערה אופציונלית…">${this.escapeHtml(log?.note || "")}</textarea>
    `;
  }

  escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  readLogFormValues(existingLog = null) {
    const date = formatHebrewDateFromInput(document.getElementById("logFormDate").value);
    const start = document.getElementById("logFormStart").value;
    const end = document.getElementById("logFormEnd").value;
    const employerId = document.getElementById("logFormEmployer").value;

    const validation = this.validationService.validateEdit({ date, start, end });
    if (!validation.valid) {
      this.modal.showFeedback(validation.message);
      return null;
    }

    let employerName = existingLog?.employerName || UNKNOWN_EMPLOYER;
    if (employerId) {
      const employer = this.employerRepo.getById(employerId);
      if (!employer) {
        this.modal.showFeedback("יש לבחור מעסיק.");
        return null;
      }
      employerName = employer.name;
    }

    return {
      date,
      start,
      end,
      durationMs: validation.durationMs,
      durationStr: validation.durationStr,
      employerId: employerId || null,
      employerName,
      note: (document.getElementById("logFormNote")?.value || "").trim()
    };
  }

  handleAddManual() {
    const employers = this.employerRepo.getAll();
    if (!employers.length) {
      alert("יש להוסיף מעסיק בהגדרות לפני הוספת דוח ידני.");
      return;
    }

    this.modal.show({
      title: "הוספת דוח ידני",
      bodyHtml: this.buildLogFormHtml({ log: null, employers, requireEmployer: true }),
      confirmText: "הוסף",
      onConfirm: () => {
        const values = this.readLogFormValues();
        if (!values) {
          this.modal.focusFirstField();
          return;
        }

        const log = new WorkLog({
          id: generateId(),
          ...values
        });

        this.logRepo.add(log);
        this.modal.hide();
        this.refresh();
      }
    });
  }

  handleEdit(log) {
    const employers = this.employerRepo.getAll();

    this.modal.show({
      title: "עריכת דוח",
      bodyHtml: this.buildLogFormHtml({ log, employers }),
      confirmText: "שמירה",
      onConfirm: () => {
        const values = this.readLogFormValues(log);
        if (!values) {
          this.modal.focusFirstField();
          return;
        }

        const updated = new WorkLog({
          ...log.toJSON(),
          ...values
        });

        this.logRepo.update(updated);
        this.modal.hide();
        this.refresh();
      }
    });
  }

  handleDelete(log) {
    void this.confirmDelete(log);
  }

  async confirmDelete(log) {
    if (!(await confirmDialog("למחוק את הדוח?"))) {
      return;
    }

    this.logRepo.delete(log.id);
    this.refresh();
  }

  handleShowNote(log) {
    if (!log.note?.trim()) {
      return;
    }

    this.modal.show({
      title: "הערה",
      bodyHtml: `<p class="modal-note-text">${this.escapeHtml(log.note)}</p>`,
      confirmText: "סגור",
      onConfirm: () => this.modal.hide()
    });
  }

  exportFiltered() {
    const logs = this.getFilteredLogs();
    const result = this.csvExporter.exportLogs(logs, "שעות_עבודה_מסונן.csv");
    if (!result.success) {
      alert(result.message);
    }
  }

  exportEndDay() {
    const logs = this.reportService.getTodayLogs(this.getFilteredLogs());
    const today = new Date().toLocaleDateString("he-IL");
    const result = this.csvExporter.exportLogs(logs, `שעות_עבודה_סוף_יום_${today}.csv`);
    if (!result.success) {
      alert("אין נתוני עבודה להיום.");
    }
  }

  exportCurrentMonth() {
    const logs = this.reportService.getCurrentMonthLogs(this.getFilteredLogs());
    const now = new Date();
    const fileName = `שעות_עבודה_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}.csv`;
    const result = this.csvExporter.exportLogs(logs, fileName);
    if (!result.success) {
      alert("אין נתוני עבודה לחודש הנוכחי.");
    }
  }

  handleCsvImport(event) {
    const file = event.target.files[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      this.csvImporter.importFromText(loadEvent.target.result);
      alert("הקובץ נטען בהצלחה.");
      this.refresh();
    };
    reader.readAsText(file, "utf-8");
    event.target.value = "";
  }

  handleBackupImport(event) {
    const file = event.target.files[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        this.jsonBackupService.importBackup(loadEvent.target.result);
        alert("הגיבוי שוחזר בהצלחה.");
        this.refresh();
      } catch (error) {
        alert(error.message || "שגיאה בשחזור הגיבוי.");
      }
    };
    reader.readAsText(file, "utf-8");
    event.target.value = "";
  }

  handleReset() {
    void this.confirmReset();
  }

  async confirmReset() {
    if (!(await confirmDialog("למחוק את כל הדוחות?"))) {
      return;
    }

    this.logRepo.clear();
    this.refresh();
  }
}
