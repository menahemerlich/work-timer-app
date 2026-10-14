export class TimerState {
  constructor({
    elapsedMs = 0,
    isPaused = false,
    isRunning = false,
    employerId = null,
    employerName = null,
    projectId = null,
    projectName = null,
    unitCount = null,
    originalStartTime = null,
    segmentStartTime = null,
    sessionNote = ""
  } = {}) {
    this.elapsedMs = elapsedMs;
    this.isPaused = isPaused;
    this.isRunning = isRunning;
    this.employerId = employerId;
    this.employerName = employerName;
    this.projectId = projectId || null;
    this.projectName = projectId ? projectName || null : null;
    this.unitCount = projectId && unitCount !== null && unitCount !== undefined ? unitCount : null;
    this.originalStartTime = originalStartTime;
    this.segmentStartTime = segmentStartTime;
    this.sessionNote = sessionNote || "";
  }

  toPersistedJSON() {
    return {
      elapsedMs: this.elapsedMs,
      isPaused: this.isPaused,
      isRunning: this.isRunning,
      employerId: this.employerId,
      employerName: this.employerName,
      projectId: this.projectId,
      projectName: this.projectName,
      unitCount: this.unitCount,
      sessionNote: this.sessionNote || ""
    };
  }

  toRuntimeJSON() {
    return {
      ...this.toPersistedJSON(),
      originalStartTime: this.originalStartTime,
      segmentStartTime: this.segmentStartTime
    };
  }

  static fromJSON(data) {
    if (!data) {
      return new TimerState();
    }

    return new TimerState({
      elapsedMs: data.elapsedMs || 0,
      isPaused: !!data.isPaused,
      isRunning: !!data.isRunning,
      employerId: data.employerId || null,
      employerName: data.employerName || null,
      projectId: data.projectId || null,
      projectName: data.projectName || null,
      unitCount: data.unitCount ?? null,
      originalStartTime: data.originalStartTime ? new Date(data.originalStartTime) : null,
      segmentStartTime: data.segmentStartTime ? new Date(data.segmentStartTime) : null,
      sessionNote: data.sessionNote || ""
    });
  }
}
