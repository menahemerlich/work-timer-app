import { STORAGE_KEYS, TIMER_COMMANDS } from "../../../../shared/constants/storageKeys.js";
import { TimerState } from "../../core/models/TimerState.js";

export class TimerStateRepository {
  constructor(storage) {
    this.storage = storage;
  }

  loadRuntimeState() {
    try {
      const raw = this.storage.getItem(STORAGE_KEYS.TIMER_STATE);
      return TimerState.fromJSON(raw ? JSON.parse(raw) : null);
    } catch {
      return new TimerState();
    }
  }

  saveRuntimeState(state) {
    this.storage.setItem(
      STORAGE_KEYS.TIMER_STATE,
      JSON.stringify(state.toRuntimeJSON())
    );
  }

  savePersistedState(state) {
    this.storage.setItem(
      STORAGE_KEYS.TIMER_STATE,
      JSON.stringify(state.toPersistedJSON())
    );
  }

  clearState() {
    this.storage.removeItem(STORAGE_KEYS.TIMER_STATE);
  }

  getCommand() {
    return this.storage.getItem(STORAGE_KEYS.TIMER_COMMAND);
  }

  setCommand(command) {
    this.storage.setItem(STORAGE_KEYS.TIMER_COMMAND, command);
  }

  clearCommand() {
    this.storage.removeItem(STORAGE_KEYS.TIMER_COMMAND);
  }

  static isValidCommand(command) {
    return Object.values(TIMER_COMMANDS).includes(command);
  }
}
