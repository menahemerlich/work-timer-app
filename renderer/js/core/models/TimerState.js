export class TimerState {
  constructor({
    elapsedMs = 0,
    isPaused = false,
    isRunning = false,
    employerId = null,
    employerName = null,
    originalStartTime = null,
    segmentStartTime = null,
    sessionNote = ""
  } = {}) {
    this.elapsedMs = elapsedMs;
    this.isPaused = isPaused;
    this.isRunning = isRunning;
    this.employerId = employerId;
    this.employerName = employerName;
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
      originalStartTime: data.originalStartTime ? new Date(data.originalStartTime) : null,
      segmentStartTime: data.segmentStartTime ? new Date(data.segmentStartTime) : null,
      sessionNote: data.sessionNote || ""
    });
  }
}
