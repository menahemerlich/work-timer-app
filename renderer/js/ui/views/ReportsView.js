import { getColorForOrphanName } from "../../core/utils/employerColors.js";

export class ReportsView {
  constructor() {
    this.employerFilterChips = document.getElementById("employerFilterChips");
    this.employerFilterSelectAll = document.getElementById("employerFilterSelectAll");
    this.employerFilterClearAll = document.getElementById("employerFilterClearAll");
    this.dateFrom = document.getElementById("dateFrom");
    this.dateTo = document.getElementById("dateTo");
    this.dateFilterClear = document.getElementById("dateFilterClear");
    this.logsTableBody = document.querySelector("#logsTable tbody");
    this.noLogsMsg = document.getElementById("noLogsMsg");
    this.logsTable = document.getElementById("logsTable");
    this.tableCard = document.querySelector(".table-card");
    this.todayDateLabel = document.getElementById("todayDateLabel");
    this.logsArchive = document.getElementById("logsArchive");
    this.totalDuration = document.getElementById("totalDuration");
    this.monthlySummaryBody = document.getElementById("monthlySummaryBody");
    this.monthlySummaryBox = document.getElementById("monthlySummaryBox");
    this.monthlyGoalBox = document.getElementById("monthlyGoalBox");
    this.monthlySummaryEmployerChips = document.getElementById("monthlySummaryEmployerChips");
    this.monthlySummarySelectAll = document.getElementById("monthlySummarySelectAll");
    this.monthlySummaryClearAll = document.getElementById("monthlySummaryClearAll");
    this.exportFilteredBtn = document.getElementById("exportFilteredBtn");
    this.exportEndDayBtn = document.getElementById("exportEndDayBtn");
    this.exportCurrentMonthBtn = document.getElementById("exportCurrentMonthBtn");
    this.loadFromFileBtn = document.getElementById("loadFromFileBtn");
    this.resetBtn = document.getElementById("resetBtn");
    this.exportBackupBtn = document.getElementById("exportBackupBtn");
    this.importBackupBtn = document.getElementById("importBackupBtn");
    this.fileInput = document.getElementById("fileInput");
    this.backupInput = document.getElementById("backupInput");
    this.addManualLogBtn = document.getElementById("addManualLogBtn");
  }

  buildFilterItems(activeEmployers, orphanNames) {
    const items = activeEmployers.map((employer) => ({
      value: employer.id,
      label: employer.name,
      color: employer.color || getColorForOrphanName(employer.name)
    }));

    orphanNames.forEach((name) => {
      if (!items.some((item) => item.label === name)) {
        items.push({
          value: `name:${name}`,
          label: name,
          color: null
        });
      }
    });

    return items.sort((a, b) => a.label.localeCompare(b.label, "he"));
  }

  getSelectedEmployerFilters(container) {
    if (!container) {
      return [];
    }

    return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map(
      (input) => input.value
    );
  }

  renderEmployerFilterChips(container, items, selectedValues, onChange) {
    if (!container) {
      return;
    }

    const validValues = new Set(items.map((item) => item.value));
    const preserved = selectedValues.filter((value) => validValues.has(value));

    container.innerHTML = "";

    if (!items.length) {
      container.innerHTML = `<p class="filter-empty-hint">אין מעסיקים — הוסף בהגדרות</p>`;
      return;
    }

    items.forEach((item) => {
      const label = document.createElement("label");
      label.className = "employer-chip-filter";
      if (item.color) {
        label.style.setProperty("--chip-color", item.color);
      } else {
        label.classList.add("employer-chip-filter--no-color");
      }

      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = item.value;
      input.checked = preserved.includes(item.value);
      input.addEventListener("change", onChange);

      const text = document.createElement("span");
      text.className = "employer-chip-label";
      text.textContent = item.label;

      label.append(input, text);
      container.appendChild(label);
    });
  }

  clearDateFilters() {
    if (this.dateFrom) {
      this.dateFrom.value = "";
    }
    if (this.dateTo) {
      this.dateTo.value = "";
    }
  }

  setAllEmployerChipsChecked(container, checked) {
    container?.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.checked = checked;
    });
  }

  appendLogRows(tbody, logs, { onEdit, onDelete, onShowNote, getEmployerColor }) {
    logs.forEach((log) => {
      const row = document.createElement("tr");
      const color = getEmployerColor?.(log);
      if (color) {
        row.style.backgroundColor = color;
      }

      const noteCell = log.note?.trim()
        ? `<button type="button" class="note-indicator" title="הצג הערה" aria-label="הצג הערה">!</button>`
        : `<span class="note-empty">—</span>`;

      row.innerHTML = `
        <td>${log.date}</td>
        <td>${log.start}</td>
        <td>${log.end}</td>
        <td>${log.durationStr}</td>
        <td>${log.employerName || ""}</td>
        <td class="note-cell">${noteCell}</td>
        <td class="actions-cell">
          <button type="button" class="btn-small btn-edit" data-id="${log.id}">עריכה</button>
          <button type="button" class="btn-small btn-delete" data-id="${log.id}">מחיקה</button>
        </td>
      `;

      row.querySelector(".btn-edit").addEventListener("click", () => onEdit(log));
      row.querySelector(".btn-delete").addEventListener("click", () => onDelete(log));

      const noteBtn = row.querySelector(".note-indicator");
      if (noteBtn) {
        noteBtn.addEventListener("click", () => onShowNote(log));
      }

      tbody.appendChild(row);
    });
  }

  createLogsTable(logs, handlers) {
    const table = document.createElement("table");
    table.className = "logs-table-nested";
    table.innerHTML = `
      <thead>
        <tr>
          <th>תאריך</th>
          <th>התחלה</th>
          <th>סיום</th>
          <th>משך</th>
          <th>מעסיק</th>
          <th>הערה</th>
          <th>פעולות</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    this.appendLogRows(table.querySelector("tbody"), logs, handlers);
    return table;
  }

  createDayFolder(dateStr, logs, { expanded, onToggle, handlers, nested = false }) {
    const wrap = document.createElement("div");
    wrap.className = `log-folder log-folder-day${nested ? " log-folder-day-nested" : ""}`;

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = `folder-trigger${expanded ? " is-open" : ""}`;
    trigger.setAttribute("aria-expanded", String(expanded));
    trigger.innerHTML = `
      <span class="folder-icon" aria-hidden="true">📁</span>
      <span class="folder-label">${dateStr}</span>
      <span class="folder-meta">${logs.length} דוחות</span>
      <span class="folder-chevron" aria-hidden="true"></span>
    `;

    const content = document.createElement("div");
    content.className = `folder-content${expanded ? "" : " is-collapsed"}`;

    const branch = document.createElement("div");
    branch.className = "folder-branch folder-branch-open";

    const context = document.createElement("p");
    context.className = "folder-open-context";
    context.textContent = `דוחות מ־${dateStr}`;

    branch.append(context, this.createLogsTable(logs, handlers));
    content.appendChild(branch);

    trigger.addEventListener("click", () => {
      const isOpen = content.classList.toggle("is-collapsed");
      const nowExpanded = !isOpen;
      trigger.classList.toggle("is-open", nowExpanded);
      wrap.classList.toggle("is-expanded", nowExpanded);
      trigger.setAttribute("aria-expanded", String(nowExpanded));
      onToggle?.(dateStr, nowExpanded);
    });

    if (expanded) {
      wrap.classList.add("is-expanded");
    }

    wrap.append(trigger, content);
    return wrap;
  }

  createMonthFolder({ monthKey, monthLabel, days }, { expanded, onToggle, handlers, expandedDays, onToggleDay }) {
    const totalLogs = days.reduce((sum, day) => sum + day.logs.length, 0);
    const wrap = document.createElement("div");
    wrap.className = "log-folder log-folder-month";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = `folder-trigger folder-trigger-month${expanded ? " is-open" : ""}`;
    trigger.setAttribute("aria-expanded", String(expanded));
    trigger.innerHTML = `
      <span class="folder-icon" aria-hidden="true">📂</span>
      <span class="folder-label">${monthLabel}</span>
      <span class="folder-meta">${totalLogs} דוחות</span>
      <span class="folder-chevron" aria-hidden="true"></span>
    `;

    const content = document.createElement("div");
    content.className = `folder-content folder-content-month${expanded ? "" : " is-collapsed"}`;

    const branch = document.createElement("div");
    branch.className = "folder-branch";

    const branchLabel = document.createElement("div");
    branchLabel.className = "folder-branch-label";
    branchLabel.textContent = `ימים ב־${monthLabel}`;

    const daysRow = document.createElement("div");
    daysRow.className = "folder-days-row";

    days.forEach((day) => {
      daysRow.appendChild(
        this.createDayFolder(day.dateStr, day.logs, {
          expanded: expandedDays.has(day.dateStr),
          onToggle: onToggleDay,
          handlers,
          nested: true
        })
      );
    });

    branch.append(branchLabel, daysRow);
    content.appendChild(branch);

    trigger.addEventListener("click", () => {
      const isOpen = content.classList.toggle("is-collapsed");
      const nowExpanded = !isOpen;
      trigger.classList.toggle("is-open", nowExpanded);
      wrap.classList.toggle("is-expanded", nowExpanded);
      trigger.setAttribute("aria-expanded", String(nowExpanded));
      onToggle?.(monthKey, nowExpanded);
    });

    if (expanded) {
      wrap.classList.add("is-expanded");
    }

    wrap.append(trigger, content);
    return wrap;
  }

  renderGroupedLogs({
    todayStr,
    todayLogs,
    archiveItems,
    expandedDays,
    expandedMonths,
    onToggleDay,
    onToggleMonth,
    handlers
  }) {
    this.todayDateLabel.textContent = todayStr;
    this.logsTableBody.innerHTML = "";
    this.logsArchive.innerHTML = "";

    const hasArchive = archiveItems.length > 0;
    const hasToday = todayLogs.length > 0;
    const hasAny = hasToday || hasArchive;

    if (!hasAny) {
      this.tableCard?.classList.remove("has-logs", "has-today-logs");
      this.noLogsMsg.style.display = "block";
      this.noLogsMsg.querySelector("p").textContent = "אין עדיין דוחות — התחל לעבוד!";
      this.logsTable.style.display = "none";
      this.logsArchive.hidden = true;
      return;
    }

    this.tableCard?.classList.add("has-logs");
    this.tableCard?.classList.toggle("has-today-logs", hasToday);
    this.logsArchive.hidden = !hasArchive;
    const tfoot = this.logsTable?.querySelector("tfoot");
    if (tfoot) {
      tfoot.style.display = hasToday ? "" : "none";
    }

    if (hasToday) {
      this.noLogsMsg.style.display = "none";
      this.logsTable.style.display = "table";
      this.appendLogRows(this.logsTableBody, todayLogs, handlers);
    } else {
      this.noLogsMsg.style.display = "block";
      this.noLogsMsg.querySelector("p").textContent = "אין דוחות להיום";
      this.logsTable.style.display = "none";
    }

    const dayItems = archiveItems.filter((item) => item.type === "day");
    const monthItems = archiveItems.filter((item) => item.type === "month");

    if (dayItems.length) {
      const daysSection = document.createElement("div");
      daysSection.className = "archive-section archive-section-days";

      const daysLabel = document.createElement("div");
      daysLabel.className = "archive-section-label";
      daysLabel.textContent = "ימים קודמים";

      const daysRow = document.createElement("div");
      daysRow.className = "archive-days-row";

      dayItems.forEach((item) => {
        daysRow.appendChild(
          this.createDayFolder(item.dateStr, item.logs, {
            expanded: expandedDays.has(item.dateStr),
            onToggle: onToggleDay,
            handlers
          })
        );
      });

      daysSection.append(daysLabel, daysRow);
      this.logsArchive.appendChild(daysSection);
    }

    if (monthItems.length) {
      const monthsSection = document.createElement("div");
      monthsSection.className = "archive-section archive-section-months";

      const monthsLabel = document.createElement("div");
      monthsLabel.className = "archive-section-label archive-section-label-month";
      monthsLabel.textContent = "חודשים קודמים";

      const monthsRow = document.createElement("div");
      monthsRow.className = "archive-months-row";

      monthItems.forEach((item) => {
        monthsRow.appendChild(
          this.createMonthFolder(item, {
            expanded: expandedMonths.has(item.monthKey),
            onToggle: onToggleMonth,
            handlers,
            expandedDays,
            onToggleDay
          })
        );
      });

      monthsSection.append(monthsLabel, monthsRow);
      this.logsArchive.appendChild(monthsSection);
    }
  }

  renderTotal(totalStr) {
    this.totalDuration.textContent = totalStr;
  }

  renderMonthlySummary(
    summary,
    {
      hasMonthData = false,
      getEmployerColorByName,
      onOpenCalculator = null,
      goalProgress = null
    } = {}
  ) {
    this.monthlySummaryBody.innerHTML = "";
    if (this.monthlyGoalBox) {
      this.monthlyGoalBox.hidden = true;
      this.monthlyGoalBox.innerHTML = "";
    }

    if (!hasMonthData) {
      this.monthlySummaryBox.style.display = "none";
      return;
    }

    this.monthlySummaryBox.style.display = "block";

    if (!summary.rows.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="3" class="empty-summary">אין נתונים למעסיקים שנבחרו בחודש זה</td>`;
      this.monthlySummaryBody.appendChild(tr);
      return;
    }

    if (goalProgress && this.monthlyGoalBox) {
      const pct = Math.max(0, Math.min(100, goalProgress.percent || 0));
      this.monthlyGoalBox.hidden = false;
      this.monthlyGoalBox.innerHTML = `
        <div class="goal-box">
          <div class="goal-title">יעד חודשי (עד היום)</div>
          <div class="goal-metrics">
            <span><strong>${goalProgress.actualHoursStr}</strong> בפועל</span>
            <span>מתוך <strong>${goalProgress.expectedHoursStr}</strong> צפוי</span>
            <span class="goal-pct"><strong>${goalProgress.percentStr}</strong></span>
          </div>
          <div class="goal-bar" aria-hidden="true">
            <div class="goal-bar-fill" style="width:${pct}%"></div>
          </div>
        </div>
      `;
    }

    summary.rows.forEach((row) => {
      const tr = document.createElement("tr");
      const color = getEmployerColorByName?.(row.employerName);
      if (color) {
        tr.style.backgroundColor = color;
      }
      tr.innerHTML = `
        <td>${row.employerName}</td>
        <td>${row.workDays}</td>
        <td>${row.totalStr}</td>
      `;
      this.monthlySummaryBody.appendChild(tr);
    });

    const overallRow = document.createElement("tr");
    overallRow.className = "summary-row";
    const calcBtn = onOpenCalculator
      ? `<button type="button" class="calc-btn" id="monthlyCalcBtn" title="חישוב שכר" aria-label="חישוב שכר">🧮</button>`
      : "";
    overallRow.innerHTML = `
      <td>
        <div class="summary-overall-cell">
          <strong>סה"כ כללי</strong>
          ${calcBtn}
        </div>
      </td>
      <td><strong>${summary.overall.workDays}</strong></td>
      <td><strong>${summary.overall.totalStr}</strong></td>
    `;
    this.monthlySummaryBody.appendChild(overallRow);

    if (onOpenCalculator) {
      overallRow.querySelector("#monthlyCalcBtn")?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpenCalculator();
      });
    }
  }
}
