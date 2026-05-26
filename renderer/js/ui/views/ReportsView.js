import { UNKNOWN_EMPLOYER } from "../../../../shared/constants/storageKeys.js";
import { getColorForOrphanName } from "../../core/utils/employerColors.js";

export class ReportsView {
  constructor() {
    this.employerFilterChips = document.getElementById("employerFilterChips");
    this.employerFilterSelectAll = document.getElementById("employerFilterSelectAll");
    this.employerFilterClearAll = document.getElementById("employerFilterClearAll");
    this.dateFrom = document.getElementById("dateFrom");
    this.dateTo = document.getElementById("dateTo");
    this.logsTableBody = document.querySelector("#logsTable tbody");
    this.noLogsMsg = document.getElementById("noLogsMsg");
    this.logsTable = document.getElementById("logsTable");
    this.tableCard = document.querySelector(".table-card");
    this.todayDateLabel = document.getElementById("todayDateLabel");
    this.logsArchive = document.getElementById("logsArchive");
    this.totalDuration = document.getElementById("totalDuration");
    this.monthlySummaryBody = document.getElementById("monthlySummaryBody");
    this.monthlySummaryBox = document.getElementById("monthlySummaryBox");
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
          color: getColorForOrphanName(name)
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
      label.style.setProperty("--chip-color", item.color);

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

  setAllEmployerChipsChecked(container, checked) {
    container?.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.checked = checked;
    });
  }

  appendLogRows(tbody, logs, { onEdit, onDelete, onShowNote, getEmployerColor }) {
    logs.forEach((log) => {
      const row = document.createElement("tr");
      const color = getEmployerColor?.(log) || getColorForOrphanName(log.employerName);
      row.style.backgroundColor = color;

      const noteCell = log.note?.trim()
        ? `<button type="button" class="note-indicator" title="הצג הערה" aria-label="הצג הערה">!</button>`
        : `<span class="note-empty">—</span>`;

      row.innerHTML = `
        <td>${log.date}</td>
        <td>${log.start}</td>
        <td>${log.end}</td>
        <td>${log.durationStr}</td>
        <td><span class="employer-tag">${log.employerName || ""}</span></td>
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

  createDayFolder(dateStr, logs, { expanded, onToggle, handlers }) {
    const wrap = document.createElement("div");
    wrap.className = "log-folder log-folder-day";

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
    content.appendChild(this.createLogsTable(logs, handlers));

    trigger.addEventListener("click", () => {
      const isOpen = content.classList.toggle("is-collapsed");
      const nowExpanded = !isOpen;
      trigger.classList.toggle("is-open", nowExpanded);
      trigger.setAttribute("aria-expanded", String(nowExpanded));
      onToggle?.(dateStr, nowExpanded);
    });

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
    content.className = `folder-content folder-content-nested${expanded ? "" : " is-collapsed"}`;

    days.forEach((day) => {
      content.appendChild(
        this.createDayFolder(day.dateStr, day.logs, {
          expanded: expandedDays.has(day.dateStr),
          onToggle: onToggleDay,
          handlers
        })
      );
    });

    trigger.addEventListener("click", () => {
      const isOpen = content.classList.toggle("is-collapsed");
      const nowExpanded = !isOpen;
      trigger.classList.toggle("is-open", nowExpanded);
      trigger.setAttribute("aria-expanded", String(nowExpanded));
      onToggle?.(monthKey, nowExpanded);
    });

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

    archiveItems.forEach((item) => {
      if (item.type === "day") {
        this.logsArchive.appendChild(
          this.createDayFolder(item.dateStr, item.logs, {
            expanded: expandedDays.has(item.dateStr),
            onToggle: onToggleDay,
            handlers
          })
        );
        return;
      }

      this.logsArchive.appendChild(
        this.createMonthFolder(item, {
          expanded: expandedMonths.has(item.monthKey),
          onToggle: onToggleMonth,
          handlers,
          expandedDays,
          onToggleDay
        })
      );
    });
  }

  renderTotal(totalStr) {
    this.totalDuration.textContent = totalStr;
  }

  renderMonthlySummary(summary, { hasMonthData = false, getEmployerColorByName } = {}) {
    this.monthlySummaryBody.innerHTML = "";

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

    summary.rows.forEach((row) => {
      const tr = document.createElement("tr");
      const color =
        getEmployerColorByName?.(row.employerName) ||
        getColorForOrphanName(row.employerName || UNKNOWN_EMPLOYER);
      tr.style.backgroundColor = color;
      tr.innerHTML = `
        <td>${row.employerName}</td>
        <td>${row.workDays}</td>
        <td>${row.totalStr}</td>
      `;
      this.monthlySummaryBody.appendChild(tr);
    });

    const overallRow = document.createElement("tr");
    overallRow.className = "summary-row";
    overallRow.innerHTML = `
      <td><strong>סה"כ כללי</strong></td>
      <td><strong>${summary.overall.workDays}</strong></td>
      <td><strong>${summary.overall.totalStr}</strong></td>
    `;
    this.monthlySummaryBody.appendChild(overallRow);
  }
}
