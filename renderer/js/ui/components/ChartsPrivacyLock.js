import { isMoneyRevealed, onMoneyRevealChange } from "../../../../shared/privacy/moneyMask.js";

/**
 * The charts page is all about money, so it is blurred as a whole. Entering the page opens the
 * psalm gate right away; once it completes the page stays visible until the user leaves it.
 */
export class ChartsPrivacyLock {
  constructor(tabId = "charts") {
    this.tabId = tabId;
    this.panel = document.querySelector(`[data-panel="${tabId}"]`);
    this.active = false;
    this.unlocked = false;
    this.overlay = null;
  }

  init() {
    if (!this.panel) {
      return;
    }
    this.panel.setAttribute("data-money-skip", "");
    this.panel.classList.add("charts-privacy");
    this.overlay = this.createOverlay();
    this.panel.prepend(this.overlay);
    this.lock();

    const api = window.electronAPI?.privacy;
    api?.onChartsUnlocked(() => {
      if (this.active) {
        this.unlock();
      }
    });
    api?.onGateCancelled((payload) => {
      if (payload?.mode === "charts" && this.active && !this.unlocked) {
        this.setOverlayText("הדף נשאר מוסתר. אפשר לפתוח אותו בכל רגע.");
      }
    });
    // A global reveal (from any amount's eye) also opens the page until the user leaves it.
    onMoneyRevealChange((revealed) => {
      if (revealed && this.active) {
        this.unlock();
      }
    });
  }

  createOverlay() {
    const overlay = document.createElement("div");
    overlay.className = "charts-lock-overlay";
    overlay.innerHTML = `
      <div class="charts-lock-box">
        <button type="button" class="charts-lock-eye" aria-label="הצגת הגרפים"></button>
        <div class="charts-lock-title">הגרפים מוסתרים</div>
        <div class="charts-lock-text"></div>
      </div>
    `;
    overlay.querySelector(".charts-lock-eye").addEventListener("click", () => this.requestUnlock());
    return overlay;
  }

  setOverlayText(text) {
    const el = this.overlay?.querySelector(".charts-lock-text");
    if (el) {
      el.textContent = text;
    }
  }

  lock() {
    this.unlocked = false;
    this.panel.classList.add("is-locked");
    this.panel.scrollTop = 0;
    this.setOverlayText("לחצו על העין כדי לומר מזמור לתודה ולפתוח את הדף.");
  }

  unlock() {
    this.unlocked = true;
    this.panel.classList.remove("is-locked");
  }

  requestUnlock() {
    this.setOverlayText("פותחים את מזמור לתודה…");
    window.electronAPI?.privacy?.requestReveal("charts");
  }

  onTabChange(tabId) {
    if (!this.panel) {
      return;
    }
    const wasActive = this.active;
    this.active = tabId === this.tabId;

    if (!this.active) {
      if (wasActive) {
        this.lock();
      }
      return;
    }
    if (wasActive) {
      return;
    }
    if (isMoneyRevealed()) {
      this.unlock();
      return;
    }
    this.lock();
    this.requestUnlock();
  }
}
