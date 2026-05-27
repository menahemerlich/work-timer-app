import { WorkLog } from "../models/WorkLog.js";
import { TimerState } from "../models/TimerState.js";
import { formatDuration } from "../utils/timeFormat.js";

export class TimerService {
  constructor({ timerStateRepo, logRepo }) {
    this.timerStateRepo = timerStateRepo;
    this.logRepo = logRepo;
    this.state = timerStateRepo.loadRuntimeState();
    this.listeners = new Set();
    this.intervalId = null;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.listeners.forEach((listener) => listener(this.getSnapshot()));
  }

  getSnapshot() {
    return {
      elapsedMs: this.getCurrentElapsedMs(),
      isPaused: this.state.isPaused,
      isRunning: this.state.isRunning,
      employerId: this.state.employerId,
      employerName: this.state.employerName,
      originalStartTime: this.state.originalStartTime,
      sessionNote: this.state.sessionNote || "",
      hasNote: Boolean((this.state.sessionNote || "").trim())
    };
  }

  getCurrentElapsedMs() {
    if (this.state.segmentStartTime) {
      return this.state.elapsedMs + (Date.now() - this.state.segmentStartTime.getTime());
    }

    return this.state.elapsedMs;
  }

  persistState() {
    const persisted = new TimerState({
      elapsedMs: this.getCurrentElapsedMs(),
      isPaused: this.state.isPaused,
      isRunning: this.state.isRunning,
      employerId: this.state.employerId,
      employerName: this.state.employerName
    });

    this.timerStateRepo.savePersistedState(persisted);
  }

  startTimerInterval() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.intervalId = setInterval(() => {
      if (this.state.isRunning && !this.state.isPaused) {
        this.persistState();
        this.notify();
      }
    }, 1000);
  }

  stopTimerInterval() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  start({ employerId, employerName }) {
    const now = new Date();
    this.state = new TimerState({
      elapsedMs: 0,
      isPaused: false,
      isRunning: true,
      employerId,
      employerName,
      originalStartTime: now,
      segmentStartTime: now,
      sessionNote: ""
    });

    this.startTimerInterval();
    this.persistState();
    this.notify();
  }

  togglePause() {
    if (!this.state.isRunning) {
      return null;
    }

    if (!this.state.isPaused) {
      this.state.elapsedMs = this.getCurrentElapsedMs();
      this.state.segmentStartTime = null;
      this.state.isPaused = true;
      this.stopTimerInterval();
    } else {
      this.state.segmentStartTime = new Date();
      this.state.isPaused = false;
      this.startTimerInterval();
    }

    this.persistState();
    this.notify();
    return this.getSnapshot();
  }

  stop() {
    return this.stopAsync();
  }

  async stopAsync() {
    if (!this.state.isRunning && this.state.elapsedMs === 0) {
      return null;
    }

    const now = new Date();
    if (this.state.segmentStartTime) {
      this.state.elapsedMs += now.getTime() - this.state.segmentStartTime.getTime();
    }

    this.stopTimerInterval();

    const durationMs = this.state.elapsedMs;
    const log = WorkLog.fromSession({
      originalStartTime: this.state.originalStartTime || now,
      endTime: now,
      durationMs,
      employerId: this.state.employerId,
      employerName: this.state.employerName,
      note: this.state.sessionNote || ""
    });

    await this.logRepo.add(log);

    this.state = new TimerState();
    this.timerStateRepo.clearState();
    this.notify();

    return log;
  }

  resetRunningSession() {
    this.stopTimerInterval();
    this.state = new TimerState();
    this.timerStateRepo.clearState();
    this.notify();
  }

  restoreRunningSession() {
    if (this.state.isRunning && !this.state.isPaused) {
      this.startTimerInterval();
    }

    this.notify();
  }

  setSessionNote(note) {
    if (!this.state.isRunning) {
      return;
    }

    this.state.sessionNote = (note || "").trim();
    this.persistState();
    this.notify();
  }

  async pollCommand(handlers) {
    const api = window.electronAPI?.db?.timer;
    const command = api ? await api.getCommand() : null;
    if (!command) {
      return;
    }

    if (command === "toggle" && this.state.isRunning && handlers.onToggle) {
      handlers.onToggle();
    }

    if (api) {
      await api.clearCommand();
    } else {
      this.timerStateRepo.clearCommand();
    }
  }
}
