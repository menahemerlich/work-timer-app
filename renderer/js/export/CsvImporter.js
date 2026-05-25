import { UNKNOWN_EMPLOYER } from "../../../shared/constants/storageKeys.js";
import { WorkLog } from "../core/models/WorkLog.js";
import { parseDurationToMs } from "../core/utils/timeFormat.js";
import { generateId } from "../core/utils/uuid.js";

export class CsvImporter {
  constructor({ logRepo }) {
    this.logRepo = logRepo;
  }

  importFromText(text) {
    const lines = text.split(/\r?\n/);
    const logs = [];

    for (let i = 1; i < lines.length; i += 1) {
      const row = lines[i].trim();
      if (!row) {
        continue;
      }

      const columns = this.parseCsvRow(row);
      if (columns[0].startsWith("סה\"כ")) {
        continue;
      }

      if (columns.length < 4) {
        continue;
      }

      const durationStr = columns[3];
      logs.push(
        new WorkLog({
          id: generateId(),
          date: columns[0],
          start: columns[1],
          end: columns[2],
          durationStr,
          durationMs: parseDurationToMs(durationStr),
          employerId: null,
          employerName: columns[4]?.trim() || UNKNOWN_EMPLOYER,
          note: (columns[5] || "").replace(/^"|"$/g, "").replace(/""/g, '"').trim()
        })
      );
    }

    this.logRepo.saveAll(logs);
    return logs;
  }

  parseCsvRow(row) {
    const result = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < row.length; i += 1) {
      const char = row[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }

    result.push(current);
    return result;
  }
}
