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
    this.employerProject = document.getElementById("employerProject");
    this.employerProjectFixed = document.getElementById("employerProjectFixed");
    this.unitCounter = document.getElementById("unitCounter");
    this.unitCountValue = document.getElementById("unitCountValue");
    this.unitCountLabel = document.getElementById("unitCountLabel");
    this.unitDoneCount = document.getElementById("unitDoneCount");
    this.unitPlusBtn = document.getElementById("unitPlusBtn");
    this.unitMinusBtn = document.getElementById("unitMinusBtn");
    this.sessionNoteBtn = document.getElementById("sessionNoteBtn");
    this.timerStage = document.getElementById("timerStage");
    this.timerHint = document.getElementById("timerHint");
    this.startBtn = document.getElementById("startBtn");
    this.pauseBtn = document.getElementById("pauseBtn");
    this.pauseLabel = document.getElementById("pauseLabel");
    this.stopBtn = document.getElementById("stopBtn");
    this.openMiniBtn = document.getElementById("openMiniBtn");
    this.motivationBanner = document.getElementById("motivationBanner");
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
        this.setEmployerChip(snapshot.employerName, snapshot.projectName, snapshot.projectBillingLabel);
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
      if (snapshot.projectIsFixed) {
        this.timerHint.textContent += " · לפי עבודה, לא נספר בשכר";
      } else if (snapshot.projectIsUnit) {
        this.timerHint.textContent += " · משולם לפי יחידה";
      }
      this.setStatus(snapshot.isPaused ? "is-paused" : "is-working");
      this.showSessionNoteBtn(snapshot.hasNote);
      this.renderUnitCounter(snapshot);
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
      this.renderUnitCounter(null);
    }
  }

  renderUnitCounter(snapshot) {
    if (!this.unitCounter) {
      return;
    }

    const count = snapshot?.unitCount;
    if (count === null || count === undefined || !snapshot.currentUnitNumber) {
      this.unitCounter.hidden = true;
      this.lastUnitCount = null;
      return;
    }

    this.unitCounter.hidden = false;
    this.unitCountValue.textContent = String(snapshot.currentUnitNumber);
    this.unitCountLabel.textContent = `${snapshot.unitSingular || "יחידה"} מס'`;
    this.unitDoneCount.textContent = String(count);
    this.unitMinusBtn.hidden = count <= 0;

    if (this.lastUnitCount !== null && this.lastUnitCount !== undefined && count !== this.lastUnitCount) {
      this.unitCounter.classList.remove("is-bumped");
      // eslint-disable-next-line no-unused-expressions
      this.unitCounter.offsetHeight;
      this.unitCounter.classList.add("is-bumped");
    }
    this.lastUnitCount = count;
  }

  setMotivation(text) {
    if (!this.motivationBanner) {
      return;
    }
    const value = String(text || "").trim();
    if (!value) {
      this.motivationBanner.hidden = true;
      this.motivationBanner.innerHTML = "";
      return;
    }
    const currentText = this.motivationBanner.querySelector?.(".motivation-text")?.textContent || "";
    const changed = currentText !== value;
    this.motivationBanner.hidden = false;
    if (changed) {
      this.motivationBanner.classList.remove("is-changing");
      // force reflow for restart animation
      // eslint-disable-next-line no-unused-expressions
      this.motivationBanner.offsetHeight;
      this.motivationBanner.classList.add("is-changing");
      window.setTimeout(() => this.motivationBanner?.classList.remove("is-changing"), 550);
    }
    // Keep stars markup stable for animations
    if (!this.motivationBanner.querySelector(".motivation-stars")) {
      this.motivationBanner.innerHTML = `
        <span class="motivation-text"></span>
        <span class="motivation-stars" aria-hidden="true">
          <span class="star star-1">✦</span>
          <span class="star star-2">✦</span>
          <span class="star star-3">✦</span>
        </span>
      `;
    }
    const textEl = this.motivationBanner.querySelector(".motivation-text");
    if (textEl) {
      textEl.textContent = value;
    }
  }

  setEmployerChip(name, projectName = null, billingLabel = null) {
    const trimmed = name.trim();
    if (!this.employerBadge || !trimmed) {
      this.hideEmployerChip();
      return;
    }

    this.employerName.textContent = trimmed;
    this.employerInitial.textContent = trimmed.charAt(0);
    if (this.employerProject) {
      this.employerProject.textContent = projectName || "";
      this.employerProject.hidden = !projectName;
    }
    if (this.employerProjectFixed) {
      this.employerProjectFixed.textContent = billingLabel || "";
      this.employerProjectFixed.hidden = !(projectName && billingLabel);
    }
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
