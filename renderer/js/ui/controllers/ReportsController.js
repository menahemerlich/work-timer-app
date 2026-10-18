import { WorkLog } from "../../core/models/WorkLog.js";
import { UNKNOWN_EMPLOYER } from "../../../../shared/constants/storageKeys.js";
import {
  formatDateInputValue,
  formatHebrewDateFromInput,
  parseHebrewDate,
  getHebrewMonthLabel
} from "../../core/utils/dateParse.js";
import { formatDuration, formatHoursMinutes } from "../../core/utils/timeFormat.js";
import { computeLogsPay, findEmployerForLog, getRateForDate } from "../../core/utils/employerRates.js";
import { generateId } from "../../core/utils/uuid.js";
import { resolveEmployerColor } from "../../core/utils/employerColors.js";
import { buildLogsArchiveStructure } from "../../core/utils/logGrouping.js";
import { confirmDialog } from "../components/ConfirmDialog.js";
import {
  effectiveHourlyRate,
  formatMoney,
  getFixedProjectsIncomeForDate,
  getFixedProjectsIncomeForMonth,
  sumMsByProject
} from "../../core/utils/projectBilling.js";

export class ReportsController {
  constructor({
    view,
    modal,
    logRepo,
    employerRepo,
    projectRepo,
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
    this.projectRepo = projectRepo;
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

    window.addEventListener("projects:changed", () => this.refresh());

    this.refresh();
  }

  /** Current project name (falls back to the name saved on the log) and billing type. */
  getProjectInfo(log) {
    if (!log?.projectId) {
      return null;
    }
    const project = this.projectRepo?.getById(log.projectId, { includeDeleted: true });
    return {
      name: project?.name || log.projectName || "פרויקט",
      isFixed: Boolean(project?.isFixed),
      isUnit: Boolean(project?.isUnit),
      unitName: project?.displayUnitName || null
    };
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
      getEmployerColor: (log) => this.getEmployerColorForLog(log),
      getProjectInfo: (log) => this.getProjectInfo(log)
    };
    const archiveStructure = buildLogsArchiveStructure(filteredLogs);

    this.view.renderGroupedLogs({
      ...archiveStructure,
      summarizeDay: (dateStr, logs) => this.summarizeDay(dateStr, logs, reportFilters),
      summarizeMonth: (monthKey, logs) => this.summarizeMonth(monthKey, logs, reportFilters),
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
    const todaySummary = this.summarizeDay(archiveStructure.todayStr, archiveStructure.todayLogs, reportFilters);
    this.view.renderTotal(formatDuration(totalMs), todaySummary.payStr);
    this.view.renderDailyGoal(this.computeDailyGoalProgress(totalMs));

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
      onOpenCalculator: () =>
        this.openMonthlyEarningsModal(filteredMonthLogs, referenceDate, monthlyFilters),
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

  /** Today's hours against the daily target (Sunday–Thursday only, like the monthly goal). */
  computeDailyGoalProgress(totalMs, referenceDate = new Date()) {
    const hoursPerDay = this.employerRepo.settingsRepository.getSettings().monthlyTargetHoursPerDay ?? null;
    if (!hoursPerDay || hoursPerDay <= 0 || referenceDate.getDay() > 4) {
      return null;
    }

    const actualHours = totalMs / 3600000;
    const percent = (actualHours / hoursPerDay) * 100;
    const fmt = (n) =>
      Number(n || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

    return {
      percent,
      actualHoursStr: `${formatHoursMinutes(totalMs)} שעות`,
      expectedHoursStr: `${fmt(hoursPerDay)} שעות`,
      percentStr: `${Math.round(percent)}%`
    };
  }

  getPayContext() {
    return {
      employers: this.employerRepo.getAll(),
      projectsById: { get: (id) => this.projectRepo?.getById(id, { includeDeleted: true }) }
    };
  }

  /** Active employers' fixed-price projects that pass the given employer filter. */
  getFixedIncomeProjects(selectFn, filters) {
    const activeEmployerIds = new Set(this.employerRepo.getAll().map((employer) => employer.id));
    return selectFn(this.projectRepo?.getAll() || [], activeEmployerIds).filter((project) =>
      this.projectMatchesEmployerFilter(project, filters)
    );
  }

  /**
   * Hours (all of them, also time that isn't paid by the hour) and pay of one day:
   * hourly at that day's rate + units + fixed-price projects created that day.
   */
  summarizeDay(dateStr, logs, filters) {
    const ms = this.reportService.getTotalDurationMs(logs);
    const fixed = this.getFixedIncomeProjects(
      (projects, ids) => getFixedProjectsIncomeForDate(projects, dateStr, ids),
      filters
    );
    const pay =
      computeLogsPay(logs, this.getPayContext()).total +
      fixed.reduce((sum, project) => sum + project.fixedPrice, 0);
    return { hoursStr: formatHoursMinutes(ms), payStr: formatMoney(pay) };
  }

  /** Same as summarizeDay for a whole month; matches the pay calculator's total. */
  summarizeMonth(monthKey, logs, filters) {
    const ms = this.reportService.getTotalDurationMs(logs);
    const fixed = this.getFixedIncomeProjects(
      (projects, ids) => getFixedProjectsIncomeForMonth(projects, this.resolveReferenceDate(monthKey), ids),
      filters
    );
    const pay =
      computeLogsPay(logs, this.getPayContext()).total +
      fixed.reduce((sum, project) => sum + project.fixedPrice, 0);
    return { hoursStr: formatHoursMinutes(ms), payStr: formatMoney(pay) };
  }

  projectMatchesEmployerFilter(project, filters) {
    const { employerFilters = [], totalOptions = employerFilters.length } = filters || {};
    if (!this.shouldFilterByEmployers(employerFilters, totalOptions)) {
      return true;
    }
    const employer = this.employerRepo.getById(project.employerId);
    const pseudoLog = { employerId: project.employerId, employerName: employer?.name || "" };
    return employerFilters.some((filter) => this.logMatchesEmployerFilter(pseudoLog, filter));
  }

  openMonthlyEarningsModal(monthLogs, referenceDate = new Date(), monthlyFilters = null) {
    const employers = this.employerRepo.getAll();

    // Time on fixed-price and per-unit projects is tracked but not paid by the hour.
    const isNonHourly = (log) => Boolean(this.projectRepo?.isNonHourlyLog(log));
    const hourlyLogs = monthLogs.filter((log) => !isNonHourly(log));
    const fixedLogs = monthLogs.filter(
      (log) => this.projectRepo?.getById(log.projectId, { includeDeleted: true })?.isFixed
    );

    // Each log is paid at the rate in effect on its date (raises apply from their date on).
    const totals = new Map();
    hourlyLogs.forEach((log) => {
      const key = log.employerName || UNKNOWN_EMPLOYER;
      if (!totals.has(key)) {
        totals.set(key, { ms: 0, amount: 0, rates: new Set() });
      }
      const entry = totals.get(key);
      const ms = log.durationMs || 0;
      const rate = getRateForDate(findEmployerForLog(log, employers), log.date);
      entry.ms += ms;
      if (rate !== null && rate !== undefined) {
        entry.amount += (ms / 3600000) * rate;
        entry.rates.add(rate);
      }
    });

    const rows = Array.from(totals.entries())
      .map(([name, { ms, amount, rates }]) => {
        const rateList = Array.from(rates).sort((a, b) => a - b);
        return {
          name,
          hours: ms / 3600000,
          rates: rateList,
          amount: rateList.length ? amount : null
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "he"));

    const totalAmount = rows.reduce((sum, r) => sum + (r.amount || 0), 0);
    const hasAnyRate = rows.some((r) => r.rates.length > 0);

    const formatHours = (n) =>
      Number(n || 0).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Fixed-price income counts in the month the project was created.
    const activeEmployerIds = new Set(employers.map((employer) => employer.id));
    const incomeProjects = getFixedProjectsIncomeForMonth(
      this.projectRepo?.getAll() || [],
      referenceDate,
      activeEmployerIds
    ).filter((project) => this.projectMatchesEmployerFilter(project, monthlyFilters));
    const incomeIds = new Set(incomeProjects.map((project) => project.id));
    const projectsTotal = incomeProjects.reduce((sum, project) => sum + project.fixedPrice, 0);

    const monthMsByProject = sumMsByProject(fixedLogs);
    const allMsByProject = sumMsByProject(this.logRepo.getAll());
    const fixedProjectIds = new Set([...incomeIds, ...monthMsByProject.keys()]);
    const fixedRows = Array.from(fixedProjectIds)
      .map((projectId) => {
        const project = this.projectRepo.getById(projectId, { includeDeleted: true });
        const sampleLog = fixedLogs.find((log) => log.projectId === projectId);
        const monthMs = monthMsByProject.get(projectId) || 0;
        const totalMs = allMsByProject.get(projectId) || 0;
        const employerName =
          this.employerRepo.getById(project?.employerId)?.name || sampleLog?.employerName || "";
        let priceCell = "—";
        if (project?.fixedPrice !== null && project?.fixedPrice !== undefined) {
          priceCell = incomeIds.has(projectId)
            ? formatMoney(project.fixedPrice)
            : `<span class="calc-sub">${formatMoney(project.fixedPrice)}<br />${this.describeIncomeMonth(project)}</span>`;
        }
        return {
          name: project?.name || sampleLog?.projectName || "פרויקט",
          employerName,
          monthMs,
          totalMs,
          priceCell,
          effectiveRate: effectiveHourlyRate(project?.fixedPrice ?? null, totalMs)
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "he"));

    const fixedSectionHtml = fixedRows.length
      ? `
      <p class="modal-hint modal-hint-small">מחיר הפרויקט נספר בחודש שבו הפרויקט נוצר. הזמן מוצג לידיעתך בלבד.</p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>פרויקט</th>
              <th>שעות החודש</th>
              <th>שעות סה"כ</th>
              <th>מחיר</th>
              <th>₪ לשעה בפועל</th>
            </tr>
          </thead>
          <tbody>
            ${fixedRows
              .map(
                (r) => `
                  <tr>
                    <td>${this.escapeHtml(r.name)}<div class="calc-sub">${this.escapeHtml(r.employerName)}</div></td>
                    <td>${formatHours(r.monthMs / 3600000)}</td>
                    <td>${formatHours(r.totalMs / 3600000)}</td>
                    <td>${r.priceCell}</td>
                    <td><strong>${r.effectiveRate === null ? "—" : formatMoney(r.effectiveRate)}</strong></td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `
      : `<p class="modal-hint modal-hint-small">אין החודש פרויקטים לפי עבודה.</p>`;

    const hourlyTableHtml = rows.length
      ? `
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
                const rateCell = r.rates.length
                  ? r.rates.map((rate) => formatMoney(rate).replace("₪", "")).join(" → ")
                  : "—";
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
          </tbody>
        </table>
      </div>
      ${
        hasAnyRate
          ? ""
          : `<p class="modal-hint">לא הוגדר תעריף לשעה לאף מעסיק. ניתן להוסיף בהגדרות.</p>`
      }
    `
      : `<p class="modal-hint">אין החודש שעות לתשלום לפי שעה.</p>`;


    // Per-unit income: units done this month × the project's unit price.
    const unitLogs = monthLogs.filter((log) => this.projectRepo?.getById(log.projectId, { includeDeleted: true })?.isUnit);
    const unitRows = Array.from(new Set(unitLogs.map((log) => log.projectId)))
      .map((projectId) => {
        const project = this.projectRepo.getById(projectId, { includeDeleted: true });
        const projectLogs = unitLogs.filter((log) => log.projectId === projectId);
        const units = projectLogs.reduce((sum, log) => sum + (log.unitCount || 0), 0);
        const ms = projectLogs.reduce((sum, log) => sum + (log.durationMs || 0), 0);
        const amount = project?.unitPrice !== null && project?.unitPrice !== undefined ? units * project.unitPrice : null;
        return {
          name: project?.name || projectLogs[0]?.projectName || "פרויקט",
          employerName: projectLogs[0]?.employerName || "",
          unitName: project?.displayUnitName || "יחידות",
          units,
          ms,
          unitPrice: project?.unitPrice ?? null,
          amount,
          effectiveRate: effectiveHourlyRate(amount, ms)
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "he"));
    const unitsTotal = unitRows.reduce((sum, r) => sum + (r.amount || 0), 0);

    const unitSectionHtml = unitRows.length
      ? `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>פרויקט</th>
              <th>כמות</th>
              <th>₪ ליחידה</th>
              <th>סה"כ</th>
              <th>₪ לשעה בפועל</th>
            </tr>
          </thead>
          <tbody>
            ${unitRows
              .map(
                (r) => `
                  <tr>
                    <td>${this.escapeHtml(r.name)}<div class="calc-sub">${this.escapeHtml(r.employerName)}</div></td>
                    <td>${r.units} <span class="calc-sub">${this.escapeHtml(r.unitName)}</span><div class="calc-sub">${formatHours(r.ms / 3600000)} שעות</div></td>
                    <td>${r.unitPrice === null ? "—" : formatMoney(r.unitPrice).replace("₪", "")}</td>
                    <td><strong>${r.amount === null ? "—" : formatMoney(r.amount)}</strong></td>
                    <td>${r.effectiveRate === null ? "—" : formatMoney(r.effectiveRate)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `
      : `<p class="modal-hint modal-hint-small">אין החודש עבודה לפי יחידה.</p>`;

    const grandTotal = totalAmount + projectsTotal + unitsTotal;

    // Each income type is a collapsed group; clicking its line opens the details.
    const group = (label, amount, contentHtml) => `
      <details class="calc-group">
        <summary class="calc-total-line">
          <span class="calc-group-label">${label}</span>
          <span>${formatMoney(amount)}</span>
        </summary>
        <div class="calc-group-body">${contentHtml}</div>
      </details>
    `;

    const totalsHtml = `
      <div class="calc-totals">
        ${group("⏱️ מהשעות", totalAmount, hourlyTableHtml)}
        ${group(`📁 מפרויקטים (${incomeProjects.length})`, projectsTotal, fixedSectionHtml)}
        ${group("🔢 מיחידות", unitsTotal, unitSectionHtml)}
        <div class="calc-total-line calc-total-grand"><span>סה"כ החודש</span><span>${formatMoney(grandTotal)}</span></div>
      </div>
    `;

    const bodyHtml = `
      <p class="modal-hint">
        חישוב שכר לפי דוחות החודש המסוננים כרגע. תעריף לשעה נקבע בהגדרות לכל מעסיק.
      </p>
      ${totalsHtml}
    `;

    this.modal.show({
      title: "🧮 מחשבון שכר",
      bodyHtml,
      confirmText: "סגור",
      onConfirm: () => this.modal.hide()
    });
  }

  describeIncomeMonth(project) {
    const created = new Date(project.createdAt);
    if (Number.isNaN(created.getTime())) {
      return "";
    }
    return `נספר ב${getHebrewMonthLabel(created.getMonth() + 1, created.getFullYear())}`;
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
      <label class="field-label">פרויקט</label>
      <select id="logFormProject" class="field-input">
        ${this.buildLogFormProjectOptions(log ? log.employerId || "" : selectedEmployerId, log)}
      </select>
      <div id="logFormUnitsWrap" hidden>
        <label class="field-label" for="logFormUnits" id="logFormUnitsLabel">כמות</label>
        <input id="logFormUnits" type="number" class="field-input" min="0" step="1" value="${log?.unitCount ?? 0}" />
      </div>
      <label class="field-label">הערה</label>
      <textarea id="logFormNote" class="field-input note-textarea" placeholder="הערה אופציונלית…">${this.escapeHtml(log?.note || "")}</textarea>
    `;
  }

  buildLogFormProjectOptions(employerId, log = null) {
    const selectedId = log?.projectId || "";
    const projects = employerId ? this.projectRepo?.getByEmployer(employerId) || [] : [];
    const options = [`<option value="">ללא פרויקט</option>`];

    projects.forEach((project) => {
      options.push(
        `<option value="${project.id}" ${project.id === selectedId ? "selected" : ""}>${this.escapeHtml(project.name)}${project.isFixed ? " (לפי עבודה)" : project.isUnit ? " (לפי יחידה)" : ""}</option>`
      );
    });

    // Keep a log's current project selectable even if it was deleted or belongs elsewhere.
    if (selectedId && !projects.some((project) => project.id === selectedId) && log.employerId === (employerId || null)) {
      const info = this.getProjectInfo(log);
      options.push(`<option value="${selectedId}" selected>${this.escapeHtml(info?.name || "")} (נמחק)</option>`);
    }

    return options.join("");
  }

  bindLogFormProjectPicker(log = null) {
    const employerSelect = document.getElementById("logFormEmployer");
    const projectSelect = document.getElementById("logFormProject");
    const syncUnits = () => {
      const project = this.projectRepo?.getById(projectSelect?.value, { includeDeleted: true });
      const wrap = document.getElementById("logFormUnitsWrap");
      const label = document.getElementById("logFormUnitsLabel");
      if (wrap) {
        wrap.hidden = !project?.isUnit;
      }
      if (label && project?.isUnit) {
        label.textContent = `כמה ${project.displayUnitName}?`;
      }
    };

    employerSelect?.addEventListener("change", () => {
      projectSelect.innerHTML = this.buildLogFormProjectOptions(employerSelect.value, log);
      syncUnits();
    });
    projectSelect?.addEventListener("change", syncUnits);
    syncUnits();
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

    const projectId = document.getElementById("logFormProject")?.value || null;
    let projectName = null;
    let unitCount = null;
    if (projectId) {
      const project = this.projectRepo?.getById(projectId, { includeDeleted: true });
      projectName = project?.name || existingLog?.projectName || null;
      if (project?.isUnit) {
        const raw = document.getElementById("logFormUnits")?.value ?? "";
        unitCount = raw === "" ? 0 : Number(raw);
        if (!Number.isInteger(unitCount) || unitCount < 0) {
          this.modal.showFeedback("כמות חייבת להיות מספר שלם, 0 או יותר.");
          return null;
        }
      }
    }

    return {
      date,
      start,
      end,
      durationMs: validation.durationMs,
      durationStr: validation.durationStr,
      employerId: employerId || null,
      employerName,
      projectId,
      projectName,
      unitCount,
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
    this.bindLogFormProjectPicker();
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
    this.bindLogFormProjectPicker(log);
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
