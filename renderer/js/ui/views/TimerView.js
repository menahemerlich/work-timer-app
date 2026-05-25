export class TimerView {
  constructor() {
    this.elapsedTime = document.getElementById("elapsedTime");
    this.startTimeDisplay = document.getElementById("startTimeDisplay");
    this.durationDisplay = document.getElementById("durationDisplay");
    this.statusLabel = document.getElementById("statusLabel");
    this.statusBadge = document.getElementById("statusBadge");
    this.employerBadge = document.getElementById("employerBadge");
    this.employerName = document.getElementById("employerName");
    this.employerInitial = document.getElementById("employerInitial");
    this.sessionNoteBtn = document.getElementById("sessionNoteBtn");
    this.timerStage = document.getElementById("timerStage");
    this.timerHint = document.getElementById("timerHint");
    this.startBtn = document.getElementById("startBtn");
    this.pauseBtn = document.getElementById("pauseBtn");
    this.pauseLabel = document.getElementById("pauseLabel");
    this.stopBtn = document.getElementById("stopBtn");
    this.openMiniBtn = document.getElementById("openMiniBtn");
  }

  setStatus(state) {
    if (!this.statusBadge) {
      return;
    }

    this.statusBadge.classList.remove("is-working", "is-paused", "is-idle");
    this.statusBadge.classList.add(state);
  }

  render(snapshot) {
    const formatted = this.formatDuration(snapshot.elapsedMs);
    this.elapsedTime.textContent = formatted;
    this.durationDisplay.textContent = snapshot.isRunning || snapshot.elapsedMs > 0 ? formatted : "-";

    if (snapshot.originalStartTime) {
      this.startTimeDisplay.textContent = snapshot.originalStartTime.toLocaleTimeString("he-IL", {
        hour12: false
      });
    }

    if (snapshot.isRunning) {
      if (snapshot.employerName) {
        this.setEmployerChip(snapshot.employerName);
      } else {
        this.hideEmployerChip();
      }

      this.startBtn.disabled = true;
      this.pauseBtn.disabled = false;
      this.stopBtn.disabled = false;
      this.pauseLabel.textContent = snapshot.isPaused ? "▶ המשך" : "⏸ השהיה";
      this.statusLabel.textContent = snapshot.isPaused ? "מושהה" : "בעבודה";
      this.timerStage?.setAttribute("data-state", snapshot.isPaused ? "paused" : "running");
      this.timerHint.textContent = snapshot.isPaused ? "הטיימר מושהה" : "עובדים עכשיו…";
      this.setStatus(snapshot.isPaused ? "is-paused" : "is-working");
      this.showSessionNoteBtn(snapshot.hasNote);
    } else {
      this.startBtn.disabled = false;
      this.pauseBtn.disabled = true;
      this.stopBtn.disabled = true;
      this.pauseLabel.textContent = "⏸ השהיה";
      this.statusLabel.textContent = "ממתין";
      this.timerStage?.setAttribute("data-state", "idle");
      this.timerHint.textContent = "מוכן להתחלה";
      this.setStatus("is-idle");
      this.elapsedTime.textContent = "00:00:00";
      this.startTimeDisplay.textContent = "-";
      this.durationDisplay.textContent = "-";
      this.hideEmployerChip();
      this.hideSessionNoteBtn();
    }
  }

  setEmployerChip(name) {
    const trimmed = name.trim();
    if (!this.employerBadge || !trimmed) {
      this.hideEmployerChip();
      return;
    }

    this.employerName.textContent = trimmed;
    this.employerInitial.textContent = trimmed.charAt(0);
    this.employerBadge.hidden = false;
  }

  hideEmployerChip() {
    if (this.employerBadge) {
      this.employerBadge.hidden = true;
    }
  }

  showSessionNoteBtn(hasNote) {
    if (!this.sessionNoteBtn) {
      return;
    }

    this.sessionNoteBtn.hidden = false;
    this.sessionNoteBtn.classList.toggle("has-note", hasNote);
    this.sessionNoteBtn.setAttribute("aria-label", hasNote ? "ערוך הערה" : "הוסף הערה");
  }

  hideSessionNoteBtn() {
    if (this.sessionNoteBtn) {
      this.sessionNoteBtn.hidden = true;
      this.sessionNoteBtn.classList.remove("has-note");
    }
  }

  formatDuration(ms) {
    const sec = Math.floor(ms / 1000);
    const h = String(Math.floor(sec / 3600)).padStart(2, "0");
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }
}
