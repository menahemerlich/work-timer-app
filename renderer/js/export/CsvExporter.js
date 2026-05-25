import { formatDuration } from "../core/utils/timeFormat.js";

export class CsvExporter {
  exportLogs(logs, filename = "שעות_עבודה.csv") {
    if (!logs.length) {
      return { success: false, message: "אין מה לייצא." };
    }

    let csv = "תאריך,התחלה,סיום,משך,מעסיק,הערה\n";
    logs.forEach((log) => {
      const note = (log.note || "").replace(/"/g, '""');
      csv += `${log.date},${log.start},${log.end},${log.durationStr},${log.employerName || ""},"${note}"\n`;
    });

    const total = logs.reduce((sum, log) => sum + (log.durationMs || 0), 0);
    csv += `סה\"כ זמן עבודה,,,${formatDuration(total)},\n`;

    this.downloadCsv(csv, filename);
    return { success: true };
  }

  downloadCsv(csv, filename) {
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
