import { STORAGE_KEYS, TIMER_COMMANDS } from "../../../../shared/constants/storageKeys.js";
import { TimerState } from "../../core/models/TimerState.js";

function getApi() {
  return window.electronAPI?.db?.timer;
}

export class TimerStateRepository {
  constructor() {
    this.cachedState = new TimerState();
    this.initialized = false;
  }

  async init() {
    const api = getApi();
    if (!api) {
      this.initialized = true;
      return;
    }

    const data = await api.load();
    this.cachedState = TimerState.fromJSON(data);
    this.initialized = true;
  }

  loadRuntimeState() {
    return TimerState.fromJSON(this.cachedState.toRuntimeJSON());
  }

  saveRuntimeState(state) {
    this.cachedState = TimerState.fromJSON(state.toRuntimeJSON());
    getApi()
      ?.save(this.cachedState.toRuntimeJSON(), { runtime: true, enqueue: false })
      .catch(console.error);
  }

  savePersistedState(state) {
    const next = new TimerState({
      ...state.toPersistedJSON(),
      originalStartTime: state.isRunning ? this.cachedState.originalStartTime : null,
      segmentStartTime: state.isRunning ? this.cachedState.segmentStartTime : null,
      sessionNote: this.cachedState.sessionNote || state.sessionNote || ""
    });

    this.cachedState = next;
    getApi()
      ?.save(next.toRuntimeJSON(), {
        runtime: !!state.isRunning,
        enqueue: !state.isRunning
      })
      .catch(console.error);
  }

  clearState() {
    this.cachedState = new TimerState();
    getApi()?.clear().catch(console.error);
  }

  getCommand() {
    return null;
  }

  setCommand(command) {
    getApi()?.setCommand(command).catch(console.error);
  }

  clearCommand() {
    getApi()?.clearCommand().catch(console.error);
  }

  static isValidCommand(command) {
    return Object.values(TIMER_COMMANDS).includes(command);
  }

  async pollCommandAsync() {
    const api = getApi();
    if (!api) {
      return null;
    }
    return api.getCommand();
  }
}

export { TIMER_COMMANDS };
