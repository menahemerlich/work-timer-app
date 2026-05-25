export class ReportsView {
  constructor() {
    this.employerFilter = document.getElementById("employerFilter");
    this.dateFrom = document.getElementById("dateFrom");
    this.dateTo = document.getElementById("dateTo");
    this.logsTableBody = document.querySelector("#logsTable tbody");
    this.noLogsMsg = document.getElementById("noLogsMsg");
    this.logsTable = document.getElementById("logsTable");
    this.tableCard = document.querySelector(".table-card");
    this.totalDuration = document.getElementById("totalDuration");
    this.monthlySummaryBody = document.getElementById("monthlySummaryBody");
    this.monthlySummaryBox = document.getElementById("monthlySummaryBox");
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

  setEmployerFilterOptions(options, activeEmployers) {
    this.employerFilter.innerHTML = `<option value="all">הכל</option>`;

    activeEmployers.forEach((employer) => {
      const option = document.createElement("option");
      option.value = employer.id;
      option.textContent = employer.name;
      this.employerFilter.appendChild(option);
    });

    options.forEach((name) => {
      const exists = Array.from(this.employerFilter.options).some(
        (option) => option.textContent === name
      );
      if (!exists) {
        const option = document.createElement("option");
        option.value = `name:${name}`;
        option.textContent = name;
        this.employerFilter.appendChild(option);
      }
    });
  }

  renderLogs(logs, { onEdit, onDelete, onShowNote }) {
    this.logsTableBody.innerHTML = "";

    if (!logs.length) {
      this.tableCard?.classList.remove("has-logs");
      this.noLogsMsg.style.display = "block";
      this.logsTable.style.display = "none";
      return;
    }

    this.tableCard?.classList.add("has-logs");
    this.noLogsMsg.style.display = "none";
    this.logsTable.style.display = "table";

    logs.forEach((log) => {
      const row = document.createElement("tr");
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

      this.logsTableBody.appendChild(row);
    });
  }

  renderTotal(totalStr) {
    this.totalDuration.textContent = totalStr;
  }

  renderMonthlySummary(summary) {
    this.monthlySummaryBody.innerHTML = "";

    if (!summary.rows.length) {
      this.monthlySummaryBox.style.display = "none";
      return;
    }

    this.monthlySummaryBox.style.display = "block";

    summary.rows.forEach((row) => {
      const tr = document.createElement("tr");
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
