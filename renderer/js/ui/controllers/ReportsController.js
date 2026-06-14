import { WorkLog } from "../../core/models/WorkLog.js";
import { UNKNOWN_EMPLOYER } from "../../../../shared/constants/storageKeys.js";
import {
  formatDateInputValue,
  formatHebrewDateFromInput,
  parseHebrewDate,
  getHebrewMonthLabel
} from "../../core/utils/dateParse.js";
import { formatDuration } from "../../core/utils/timeFormat.js";
import { generateId } from "../../core/utils/uuid.js";
import { resolveEmployerColor } from "../../core/utils/employerColors.js";
import { buildLogsArchiveStructure } from "../../core/utils/logGrouping.js";
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
    this.expandedDays = new Set();
    this.expandedMonths = new Set();
    this.selectedMonthKey = null;
  }

  init() {
    this.view.openFiltersBtn?.addEventListener("click", () => this.view.openFiltersDrawer());
    this.view.closeFiltersBtn?.addEventListener("click", () => this.view.closeFiltersDrawer());
    this.view.filtersOverlay?.addEventListener("click", () => this.view.closeFiltersDrawer());
    this.view.clearFiltersBtn?.addEventListener("click", () => {
      this.view.setAllEmployerChipsChecked(this.view.employerFilterChips, false);
      this.view.clearDateFilters();
      this.view.closeFiltersDrawer();
      this.refresh();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.view.closeFiltersDrawer();
      }
    });

    this.view.employerFilterSelectAll?.addEventListener("click", () => {
      this.view.setAllEmployerChipsChecked(this.view.employerFilterChips, true);
      this.refresh();
    });
    this.view.employerFilterClearAll?.addEventListener("click", () => {
      this.view.setAllEmployerChipsChecked(this.view.employerFilterChips, false);
      this.refresh();
    });
    this.view.monthlySummarySelectAll?.addEventListener("click", () => {
      this.view.setAllEmployerChipsChecked(this.view.monthlySummaryEmployerChips, true);
      this.refresh();
    });
    this.view.monthlySummaryClearAll?.addEventListener("click", () => {
      this.view.setAllEmployerChipsChecked(this.view.monthlySummaryEmployerChips, false);
      this.refresh();
    });
    this.view.monthlySummaryMonth?.addEventListener("change", () => {
      this.selectedMonthKey = this.view.getSelectedMonthKey();
      this.refresh();
    });
    this.view.dateFrom.addEventListener("change", () => this.refresh());
    this.view.dateTo.addEventListener("change", () => this.refresh());
    this.view.dateFilterClear?.addEventListener("click", () => {
      this.view.clearDateFilters();
      this.refresh();
    });
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
      employerFilters: this.view.getSelectedEmployerFilters(this.view.employerFilterChips),
      dateFrom: this.view.dateFrom.value || null,
      dateTo: this.view.dateTo.value || null
    };
  }

  getMonthlySummaryFilters() {
    return {
      employerFilters: this.view.getSelectedEmployerFilters(this.view.monthlySummaryEmployerChips),
      dateFrom: null,
      dateTo: null
    };
  }

  getFilteredLogs() {
    const allLogs = this.logRepo.getAll();
    return this.applyEmployerFilter(allLogs, this.getFilters());
  }

  getEmployerColorForLog(log) {
    return resolveEmployerColor(log, this.employerRepo.getAll());
  }

  getEmployerColorByName(name) {
    return resolveEmployerColor({ employerName: name }, this.employerRepo.getAll());
  }

  logMatchesEmployerFilter(log, filter) {
    if (filter.startsWith("name:")) {
      return log.employerName === filter.slice(5);
    }

    const employer = this.employerRepo.getById(filter);
    if (employer) {
      return log.employerId === employer.id || log.employerName === employer.name;
    }

    return false;
  }

  shouldFilterByEmployers(selectedFilters, totalOptions) {
    return selectedFilters.length > 0 && selectedFilters.length < totalOptions;
  }

  applyEmployerFilter(logs, filters) {
    const { employerFilters = [], dateFrom, dateTo } = filters;
    const dateFiltered = this.reportService.filterLogs(logs, {
      employerFilter: "all",
      dateFrom,
      dateTo
    });

    if (!this.shouldFilterByEmployers(employerFilters, filters.totalOptions ?? employerFilters.length)) {
      return dateFiltered;
    }

    return dateFiltered.filter((log) =>
      employerFilters.some((filter) => this.logMatchesEmployerFilter(log, filter))
    );
  }

  refresh() {
    const allLogs = this.logRepo.getAll();
    const activeEmployers = this.employerRepo.getAll();
    const orphanNames = this.reportService.getEmployerFilterOptions(allLogs, activeEmployers);
    const filterItems = this.view.buildFilterItems(activeEmployers, orphanNames);
    const onFilterChange = () => this.refresh();

    const selectedReports = this.view.getSelectedEmployerFilters(this.view.employerFilterChips);
    this.view.renderEmployerFilterChips(
      this.view.employerFilterChips,
      filterItems,
      selectedReports,
      onFilterChange
    );

    const selectedMonthly = this.view.getSelectedEmployerFilters(this.view.monthlySummaryEmployerChips);
    this.view.renderEmployerFilterChips(
      this.view.monthlySummaryEmployerChips,
      filterItems,
      selectedMonthly,
      onFilterChange
    );

    const reportFilters = this.getFilters();
    reportFilters.totalOptions = filterItems.length;
    const filteredLogs = this.applyEmployerFilter(allLogs, reportFilters);

    const hasEmployerFilterActive =
      selectedReports.length > 0 && selectedReports.length < filterItems.length;
    const hasDateFilterActive = Boolean(this.view.dateFrom?.value || this.view.dateTo?.value);
    this.view.setFiltersActive(hasEmployerFilterActive || hasDateFilterActive);
    const logHandlers = {
      onEdit: (log) => this.handleEdit(log),
      onDelete: (log) => this.handleDelete(log),
      onShowNote: (log) => this.handleShowNote(log),
      getEmployerColor: (log) => this.getEmployerColorForLog(log)
    };
    const archiveStructure = buildLogsArchiveStructure(filteredLogs);

    this.view.renderGroupedLogs({
      ...archiveStructure,
      expandedDays: this.expandedDays,
      expandedMonths: this.expandedMonths,
      onToggleDay: (dateStr, isOpen) => {
        if (isOpen) {
          this.expandedDays.add(dateStr);
        } else {
          this.expandedDays.delete(dateStr);
        }
      },
      onToggleMonth: (monthKey, isOpen) => {
        if (isOpen) {
          this.expandedMonths.add(monthKey);
        } else {
          this.expandedMonths.delete(monthKey);
        }
      },
      handlers: logHandlers
    });

    const totalMs = this.reportService.getTotalDurationMs(archiveStructure.todayLogs);
    this.view.renderTotal(formatDuration(totalMs));

    const monthOptions = this.buildMonthOptions(allLogs);
    if (!monthOptions.some((opt) => opt.key === this.selectedMonthKey)) {
      this.selectedMonthKey = monthOptions[0]?.key ?? null;
    }
    this.view.renderMonthOptions(monthOptions, this.selectedMonthKey);

    const referenceDate = this.resolveReferenceDate(this.selectedMonthKey);
    const monthLogs = this.reportService.getCurrentMonthLogs(allLogs, referenceDate);
    const monthlyFilters = this.getMonthlySummaryFilters();
    monthlyFilters.totalOptions = filterItems.length;
    const filteredMonthLogs = this.applyEmployerFilter(monthLogs, monthlyFilters);

    const goalProgress = this.computeMonthlyGoalProgress(filteredMonthLogs, referenceDate);

    this.view.renderMonthlySummary(this.reportService.getSummaryByEmployer(filteredMonthLogs), {
      hasMonthData: allLogs.length > 0,
      getEmployerColorByName: (name) => this.getEmployerColorByName(name),
      onOpenCalculator: () => this.openMonthlyEarningsModal(filteredMonthLogs),
      goalProgress
    });
  }

  buildMonthOptions(allLogs) {
    const now = new Date();
    const currentKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
    const map = new Map();

    map.set(currentKey, { year: now.getFullYear(), month: now.getMonth() + 1 });

    allLogs.forEach((log) => {
      const parsed = parseHebrewDate(log.date);
      if (!parsed) {
        return;
      }
      const key = `${parsed.year}-${parsed.month}`;
      if (!map.has(key)) {
        map.set(key, { year: parsed.year, month: parsed.month });
      }
    });

    return Array.from(map.entries())
      .map(([key, { year, month }]) => ({
        key,
        year,
        month,
        label:
          key === currentKey
            ? `${getHebrewMonthLabel(month, year, now)} (החודש)`
            : getHebrewMonthLabel(month, year, now)
      }))
      .sort((a, b) => b.year - a.year || b.month - a.month);
  }

  resolveReferenceDate(monthKey) {
    if (!monthKey) {
      return new Date();
    }
    const [year, month] = monthKey.split("-").map(Number);
    if (!year || !month) {
      return new Date();
    }
    return new Date(year, month - 1, 15);
  }

  computeMonthlyGoalProgress(monthLogs, referenceDate = new Date()) {
    const settings = this.employerRepo.settingsRepository.getSettings();
    const hoursPerDay = settings.monthlyTargetHoursPerDay ?? null;

    if (!hoursPerDay || hoursPerDay <= 0) {
      return null;
    }

    const now = new Date();
    const year = referenceDate.getFullYear();
    const month = referenceDate.getMonth();
    const isCurrentMonth = month === now.getMonth() && year === now.getFullYear();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // For the current month count only up to today; past months are counted in full.
    const lastDay = isCurrentMonth ? now.getDate() : daysInMonth;

    // The monthly target is derived only from working days (Sunday–Thursday).
    let expectedWorkDays = 0;
    for (let day = 1; day <= lastDay; day += 1) {
      const dayOfWeek = new Date(year, month, day).getDay();
      if (dayOfWeek >= 0 && dayOfWeek <= 4) {
        expectedWorkDays += 1;
      }
    }

    const expectedHours = expectedWorkDays * hoursPerDay;
    const actualHours = this.reportService.getTotalDurationMs(monthLogs) / 3600000;

    const percent = expectedHours > 0 ? (actualHours / expectedHours) * 100 : 0;
    const fmt = (n) =>
      Number(n || 0).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    return {
      hoursPerDay,
      expectedWorkDays,
      expectedHours,
      actualHours,
      percent,
      isCurrentMonth,
      periodLabel: isCurrentMonth ? "עד היום" : "החודש כולו",
      expectedHoursStr: `${fmt(expectedHours)} שעות`,
      actualHoursStr: `${fmt(actualHours)} שעות`,
      percentStr: `${Math.round(percent)}%`
    };
  }

  openMonthlyEarningsModal(monthLogs) {
    const employers = this.employerRepo.getAll();
    const byName = new Map(employers.map((e) => [e.name, e]));

    const totals = new Map();
    monthLogs.forEach((log) => {
      const key = log.employerName || UNKNOWN_EMPLOYER;
      totals.set(key, (totals.get(key) || 0) + (log.durationMs || 0));
    });

    const rows = Array.from(totals.entries())
      .map(([name, ms]) => {
        const hours = ms / 3600000;
        const rate = byName.get(name)?.hourlyRate ?? null;
        const amount = rate !== null ? hours * rate : null;
        return { name, hours, rate, amount };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "he"));

    const totalAmount = rows.reduce((sum, r) => sum + (r.amount || 0), 0);
    const hasAnyRate = rows.some((r) => r.rate !== null);

    const formatMoney = (n) =>
      `₪${Number(n || 0).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const formatHours = (n) =>
      Number(n || 0).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const bodyHtml = `
      <p class="modal-hint">
        חישוב שכר לפי דוחות החודש המסוננים כרגע. תעריף לשעה נקבע בהגדרות לכל מעסיק.
      </p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>מעסיק</th>
              <th>שעות</th>
              <th>₪ לשעה</th>
              <th>סה"כ</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map((r) => {
                const rateCell = r.rate === null ? "—" : formatMoney(r.rate).replace("₪", "");
                const amountCell = r.amount === null ? "—" : formatMoney(r.amount);
                return `
                  <tr>
                    <td>${this.escapeHtml(r.name)}</td>
                    <td>${formatHours(r.hours)}</td>
                    <td>${rateCell}</td>
                    <td><strong>${amountCell}</strong></td>
                  </tr>
                `;
              })
              .join("")}
            ${
              hasAnyRate
                ? `
                  <tr class="summary-row">
                    <td><strong>סה"כ</strong></td>
                    <td></td>
                    <td></td>
                    <td><strong>${formatMoney(totalAmount)}</strong></td>
                  </tr>
                `
                : ""
            }
          </tbody>
        </table>
      </div>
      ${
        hasAnyRate
          ? ""
          : `<p class="modal-hint">לא הוגדר תעריף לשעה לאף מעסיק. ניתן להוסיף בהגדרות.</p>`
      }
    `;

    this.modal.show({
      title: "🧮 מחשבון שכר",
      bodyHtml,
      confirmText: "סגור",
      onConfirm: () => this.modal.hide()
    });
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

  getFilterItems() {
    const allLogs = this.logRepo.getAll();
    const activeEmployers = this.employerRepo.getAll();
    const orphanNames = this.reportService.getEmployerFilterOptions(allLogs, activeEmployers);
    return this.view.buildFilterItems(activeEmployers, orphanNames);
  }

  getDateOnlyFilteredLogs() {
    return this.applyEmployerFilter(this.logRepo.getAll(), {
      employerFilters: [],
      dateFrom: this.view.dateFrom.value || null,
      dateTo: this.view.dateTo.value || null,
      totalOptions: 0
    });
  }

  buildExportEmployerPickerHtml(hint) {
    return `
      <p class="modal-hint">${hint}</p>
      <div class="filter-label-row">
        <span class="field-label">מעסיקים</span>
        <div class="employer-filter-actions">
          <button type="button" class="link-btn" id="exportPickerSelectAll">הכל</button>
          <button type="button" class="link-btn" id="exportPickerClearAll">נקה</button>
        </div>
      </div>
      <p class="modal-hint modal-hint-small">לא נבחר אף מעסיק = ייצוא של כולם</p>
      <div id="exportEmployerChips" class="employer-filter-chips employer-filter-chips-modal"></div>
    `;
  }

  bindExportPickerActions(filterItems, preselected = []) {
    const chipsEl = document.getElementById("exportEmployerChips");
    this.view.renderEmployerFilterChips(chipsEl, filterItems, preselected, () => {});

    document.getElementById("exportPickerSelectAll")?.addEventListener("click", () => {
      this.view.setAllEmployerChipsChecked(chipsEl, true);
    });
    document.getElementById("exportPickerClearAll")?.addEventListener("click", () => {
      this.view.setAllEmployerChipsChecked(chipsEl, false);
    });
  }

  readExportEmployerSelection() {
    return this.view.getSelectedEmployerFilters(document.getElementById("exportEmployerChips"));
  }

  showExportEmployerModal({ title, hint, logs, fileName, emptyMessage }) {
    const filterItems = this.getFilterItems();
    if (!filterItems.length) {
      alert("אין מעסיקים — הוסף מעסיק בהגדרות.");
      return;
    }

    if (!logs.length) {
      alert(emptyMessage);
      return;
    }

    const preselected = this.view.getSelectedEmployerFilters(this.view.employerFilterChips);

    this.modal.show({
      title,
      bodyHtml: this.buildExportEmployerPickerHtml(hint),
      confirmText: "ייצוא",
      onConfirm: () => {
        const selected = this.readExportEmployerSelection();
        const filtered = this.applyEmployerFilter(logs, {
          employerFilters: selected,
          totalOptions: filterItems.length
        });

        if (!filtered.length) {
          this.modal.showFeedback("אין דוחות למעסיקים שנבחרו.");
          return;
        }

        const result = this.csvExporter.exportLogs(filtered, fileName);
        if (!result.success) {
          this.modal.showFeedback(result.message || "לא ניתן לייצא.");
          return;
        }

        this.modal.hide();
      }
    });

    this.bindExportPickerActions(filterItems, preselected);
  }

  exportFiltered() {
    this.showExportEmployerModal({
      title: "ייצוא CSV",
      hint: "בחר מעסיקים לייצוא לפי הסינון הנוכחי (תאריכים).",
      logs: this.getDateOnlyFilteredLogs(),
      fileName: "שעות_עבודה_מסונן.csv",
      emptyMessage: "אין דוחות בטווח התאריכים שנבחר."
    });
  }

  exportEndDay() {
    const logs = this.reportService.getTodayLogs(this.getDateOnlyFilteredLogs());
    const today = new Date().toLocaleDateString("he-IL");
    this.showExportEmployerModal({
      title: "ייצוא סוף יום",
      hint: "בחר מעסיקים לייצוא דוחות היום.",
      logs,
      fileName: `שעות_עבודה_סוף_יום_${today}.csv`,
      emptyMessage: "אין נתוני עבודה להיום."
    });
  }

  exportCurrentMonth() {
    const logs = this.reportService.getCurrentMonthLogs(this.getDateOnlyFilteredLogs());
    const now = new Date();
    const fileName = `שעות_עבודה_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}.csv`;
    this.showExportEmployerModal({
      title: "ייצוא החודש",
      hint: "בחר מעסיקים לייצוא דוחות החודש הנוכחי.",
      logs,
      fileName,
      emptyMessage: "אין נתוני עבודה לחודש הנוכחי."
    });
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
      void (async () => {
        try {
          await this.jsonBackupService.importBackup(loadEvent.target.result);
          alert("הגיבוי שוחזר בהצלחה.");
          this.refresh();
        } catch (error) {
          alert(error.message || "שגיאה בשחזור הגיבוי.");
        }
      })();
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
