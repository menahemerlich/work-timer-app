import { UNKNOWN_EMPLOYER } from "../../../../shared/constants/storageKeys.js";
import { formatDuration } from "../utils/timeFormat.js";
import { generateId } from "../utils/uuid.js";

export class WorkLog {
  constructor({
    id,
    date,
    start,
    end,
    durationMs,
    durationStr,
    employerId = null,
    employerName = UNKNOWN_EMPLOYER,
    projectId = null,
    projectName = null,
    unitCount = null,
    unitOpen = false,
    note = ""
  }) {
    this.id = id;
    this.date = date;
    this.start = start;
    this.end = end;
    this.durationMs = durationMs;
    this.durationStr = durationStr;
    this.employerId = employerId;
    this.employerName = employerName;
    this.projectId = projectId || null;
    this.projectName = projectId ? projectName || null : null;
    this.unitCount = projectId && unitCount !== null && unitCount !== undefined ? unitCount : null;
    this.unitOpen = Boolean(projectId && unitOpen);
    this.note = note || "";
  }

  static fromSession({
    originalStartTime,
    endTime,
    durationMs,
    employerId,
    employerName,
    projectId = null,
    projectName = null,
    unitCount = null,
    unitOpen = false,
    note = ""
  }) {
    return new WorkLog({
      id: generateId(),
      date: originalStartTime.toLocaleDateString("he-IL"),
      start: originalStartTime.toLocaleTimeString("he-IL", { hour12: false }),
      end: endTime.toLocaleTimeString("he-IL", { hour12: false }),
      durationMs,
      durationStr: formatDuration(durationMs),
      employerId,
      employerName,
      projectId,
      projectName,
      unitCount,
      unitOpen,
      note: note || ""
    });
  }

  toJSON() {
    return {
      id: this.id,
      date: this.date,
      start: this.start,
      end: this.end,
      durationMs: this.durationMs,
      durationStr: this.durationStr,
      employerId: this.employerId,
      employerName: this.employerName,
      projectId: this.projectId,
      projectName: this.projectName,
      unitCount: this.unitCount,
      unitOpen: this.unitOpen,
      note: this.note || ""
    };
  }

  static fromJSON(data) {
    return new WorkLog(data);
  }
}
