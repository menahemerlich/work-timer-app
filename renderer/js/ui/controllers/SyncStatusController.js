const STATUS_LABELS = {
  saved_local: "שמור מקומית",
  synced: "מסונכרן",
  syncing: "מסנכרן...",
  pending_sync: "ממתין לסנכרון",
  offline_pending: "ממתין · לא מקוון",
  pending_auth: "לא מחובר לענן",
  error: "שגיאת סנכרון",
  local_only: "מקומי בלבד"
};

export class SyncStatusController {
  constructor() {
    this.badge = document.getElementById("syncStatusBadge");
    this.forceBtn = document.getElementById("syncForceBtn");
  }

  init() {
    this.forceBtn?.addEventListener("click", () => this.forceSync());
    this.refresh();
    window.electronAPI?.sync?.onStatus?.((status) => this.render(status));
  }

  async refresh() {
    if (!window.electronAPI?.sync) {
      this.render({ state: "local_only", pendingCount: 0 });
      return;
    }

    const status = await window.electronAPI.sync.getStatus();
    this.render(status);
  }

  render(status) {
    if (!this.badge) {
      return;
    }

    const baseLabel = STATUS_LABELS[status.state] || STATUS_LABELS.saved_local;
    const pending = status.pendingCount || 0;

    if (pending > 0 && status.state !== "syncing") {
      this.badge.textContent = `${baseLabel} (${pending})`;
    } else {
      this.badge.textContent = baseLabel;
    }

    this.badge.dataset.state = status.state;
    this.lastStatus = status;

    if (status.lastError) {
      this.badge.title = status.lastError;
    } else if (pending > 0) {
      this.badge.title = `${pending} שינויים ממתינים לסנכרון לענן. לחץ ↻ לסנכרון מיידי.`;
    } else if (status.state === "synced") {
      this.badge.title = "כל השינויים נשמרו מקומית וסונכרנו לענן.";
    } else if (status.state === "pending_auth") {
      this.badge.title = "הנתונים נשמרים במחשב. התחבר לענן כדי לסנכרן.";
    } else {
      this.badge.title = "הנתונים נשמרים מיד במחשב.";
    }

    if (this.forceBtn) {
      const needsAttention = pending > 0 || status.state === "error";
      this.forceBtn.classList.toggle("needs-attention", needsAttention);
    }
  }

  forceSync() {
    if (!window.electronAPI?.sync) {
      return;
    }

    this.render({ ...this.lastStatus, state: "syncing" });

    void window.electronAPI.sync
      .forceSync()
      .then((status) => {
        this.render(status);
      })
      .catch((error) => {
        this.render({ state: "error", pendingCount: 0, lastError: error.message });
      });
  }
}
