import {
  buildClientSummaryEmail,
  buildMonthlySummaryEmail,
  escapeHtml,
  fillTemplate,
  parseAddressList,
  resolveRecipients,
  rowVars,
  textToHtml,
  todayLabel
} from "../../core/services/EmailTemplates.js";

const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const SYNC_STATE_LABELS = {
  error: "שגיאה בסנכרון",
  pending_auth: "לא מחובר לענן",
  offline_pending: "אין אינטרנט",
  pending_sync: "ממתין לסנכרון",
  syncing: "מסנכרן",
  synced: "מסונכרן",
  saved_local: "שמור מקומית",
  local_only: "מקומי בלבד"
};

function monthKeyOf(date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}`;
}

function isoDay(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Sends the emails: automatic checks while the app is open (every 30 minutes) and the
 * manual "compose" window opened from the monthly summary.
 */
export class EmailNotifier {
  constructor({ reportsController, jsonBackupService, modal }) {
    this.reports = reportsController;
    this.backupService = jsonBackupService;
    this.modal = modal;
    this.config = null;
    this.failedAt = new Map();
    this.running = false;
  }

  get api() {
    return window.electronAPI?.email;
  }

  async init() {
    if (!this.api) {
      return;
    }
    await this.reloadConfig();
    window.addEventListener("email:configChanged", (event) => {
      if (event.detail) {
        this.config = event.detail;
      }
    });
    setTimeout(() => void this.runChecks(), FIRST_CHECK_DELAY_MS);
    setInterval(() => void this.runChecks(), CHECK_INTERVAL_MS);
  }

  async reloadConfig() {
    this.config = await this.api.getConfig();
    return this.config;
  }

  isConfigured() {
    return Boolean(this.config?.account?.address && this.config?.account?.hasPassword);
  }

  isEnabled(id) {
    return Boolean(this.config?.notifications?.[id]?.enabled);
  }

  senderName() {
    return this.config?.account?.fromName || this.config?.account?.address || "";
  }

  async send(mail) {
    const result = await this.api.send(mail);
    window.dispatchEvent(new CustomEvent("email:sent", { detail: result }));
    return result;
  }

  /** Sends an automatic email once per key. Failures are retried after a few hours. */
  async sendOnce(key, mail) {
    if (this.config.sentLog?.[key]) {
      return;
    }
    const failedAt = this.failedAt.get(key);
    if (failedAt && Date.now() - failedAt < RETRY_AFTER_FAILURE_MS) {
      return;
    }
    if (!mail.to?.length) {
      return;
    }
    const result = await this.send(mail);
    if (result.ok) {
      await this.api.markSent(key);
      this.config.sentLog = { ...this.config.sentLog, [key]: new Date().toISOString() };
      this.failedAt.delete(key);
    } else {
      this.failedAt.set(key, Date.now());
    }
  }

  async runChecks() {
    if (this.running || !this.api) {
      return;
    }
    this.running = true;
    try {
      await this.reloadConfig();
      if (!this.isConfigured()) {
        return;
      }
      const now = new Date();
      await this.checkUnpaid(now);
      await this.checkMonthlySummaries(now);
      await this.checkGoals(now);
      await this.checkBackup(now);
      await this.checkSync(now);
    } catch (error) {
      console.error("Email checks failed:", error);
    } finally {
      this.running = false;
    }
  }

  async checkUnpaid(now) {
    const first = this.config.notifications.unpaidReminder;
    const repeat = this.config.notifications.unpaidRepeat;
    if (!first.enabled && !repeat.enabled) {
      return;
    }
    const lookback = Math.max(1, Number(first.lookbackMonths) || 1);
    const daysAfter = Math.max(0, Number(first.daysAfterMonthEnd) || 0);

    for (let i = 1; i <= lookback; i += 1) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      if (now.getTime() < monthEnd.getTime() + (daysAfter + 1) * DAY_MS) {
        continue;
      }
      const report = this.reports.buildMonthReport(monthKeyOf(monthStart));
      for (const row of report.rows) {
        if (row.paid || (row.totalMs <= 0 && row.amount <= 0)) {
          continue;
        }
        const firstKey = `unpaid:${report.monthKey}:${row.employerName}`;
        const repeatKey = `unpaidRepeat:${report.monthKey}:${row.employerName}`;
        const vars = rowVars(report, row, this.senderName());

        if (first.enabled && !this.config.sentLog[firstKey]) {
          await this.sendOnce(firstKey, this.buildTemplated("unpaidReminder", first, vars, row.employerId));
          continue;
        }
        if (!repeat.enabled) {
          continue;
        }
        const times = [this.config.sentLog[firstKey], this.config.sentLog[repeatKey]]
          .filter(Boolean)
          .map((iso) => new Date(iso).getTime());
        const last = times.length ? Math.max(...times) : null;
        const everyDays = Math.max(1, Number(repeat.everyDays) || 7);
        const due = last === null ? !first.enabled : now.getTime() - last >= everyDays * DAY_MS;
        if (due) {
          // The repeat key is reused: clear it so sendOnce sends again, then it's marked with the new time.
          const sentLog = { ...this.config.sentLog };
          delete sentLog[repeatKey];
          this.config.sentLog = sentLog;
          await this.sendOnce(repeatKey, this.buildTemplated("unpaidRepeat", repeat, vars, row.employerId));
        }
      }
    }
  }

  async checkMonthlySummaries(now) {
    const general = this.config.notifications.monthlySummary;
    const client = this.config.notifications.clientSummary;
    const prevKey = monthKeyOf(new Date(now.getFullYear(), now.getMonth() - 1, 1));

    if (general.enabled && now.getDate() >= (Number(general.sendDay) || 1)) {
      const report = this.reports.buildMonthReport(prevKey);
      if (report.rows.length) {
        const content = buildMonthlySummaryEmail(report, this.senderName());
        const { to } = resolveRecipients(this.config, general.recipients);
        await this.sendOnce(`monthlySummary:${prevKey}`, { ...content, to, type: "monthlySummary" });
      }
    }

    if (client.enabled && now.getDate() >= (Number(client.sendDay) || 1)) {
      const report = this.reports.buildMonthReport(prevKey);
      for (const row of report.rows) {
        const content = buildClientSummaryEmail(report, row, this.senderName());
        const { to } = resolveRecipients(this.config, client.recipients, row.employerId);
        await this.sendOnce(`clientSummary:${prevKey}:${row.employerName}`, {
          ...content,
          to,
          type: "clientSummary"
        });
      }
    }
  }

  async checkGoals(now) {
    const behind = this.config.notifications.goalBehind;
    const reached = this.config.notifications.goalReached;
    if (!behind.enabled && !reached.enabled) {
      return;
    }
    const monthKey = monthKeyOf(now);
    const report = this.reports.buildMonthReport(monthKey);
    const allLogs = report.rows.flatMap((row) => row.logs);
    const fmt = (n) =>
      `${Number(n || 0).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} שעות`;

    if (behind.enabled && now.getDate() >= (Number(behind.checkDay) || 15)) {
      const progress = this.reports.computeMonthlyGoalProgress(allLogs, now);
      if (progress && progress.percent < (Number(behind.thresholdPercent) || 80)) {
        const vars = {
          חודש: report.monthLabel,
          אחוז: progress.percentStr,
          בפועל: progress.actualHoursStr,
          צפוי: progress.expectedHoursStr,
          שם: this.senderName()
        };
        await this.sendOnce(`goalBehind:${monthKey}`, this.buildTemplated("goalBehind", behind, vars));
      }
    }

    if (reached.enabled) {
      const target = this.reports.computeFullMonthTargetHours(now);
      const actual = report.totalMs / 3600000;
      if (target && actual >= target) {
        const vars = { חודש: report.monthLabel, בפועל: fmt(actual), צפוי: fmt(target), שם: this.senderName() };
        await this.sendOnce(`goalReached:${monthKey}`, this.buildTemplated("goalReached", reached, vars));
      }
    }
  }

  async checkBackup(now) {
    const backup = this.config.notifications.backup;
    if (!backup.enabled) {
      return;
    }
    let key;
    if (backup.frequency === "monthly") {
      key = `backup:m:${monthKeyOf(now)}`;
    } else {
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
      key = `backup:w:${isoDay(weekStart)}`;
    }
    if (this.config.sentLog[key]) {
      return;
    }
    const vars = { תאריך: todayLabel(now), שם: this.senderName() };
    const mail = this.buildTemplated("backup", backup, vars);
    mail.attachments = [
      {
        filename: `work-timer-backup-${isoDay(now)}.json`,
        content: JSON.stringify(this.backupService.buildPayload(), null, 2),
        contentType: "application/json"
      }
    ];
    await this.sendOnce(key, mail);
  }

  async checkSync(now) {
    const syncProblem = this.config.notifications.syncProblem;
    if (!syncProblem.enabled || !window.electronAPI?.sync?.getStatus) {
      return;
    }
    const status = await window.electronAPI.sync.getStatus();
    const pending = Number(status?.pending ?? status?.pendingCount ?? 0);
    const threshold = Number(syncProblem.pendingThreshold) || 20;
    if (status?.state !== "error" && pending < threshold) {
      return;
    }
    const vars = {
      מצב: SYNC_STATE_LABELS[status?.state] || status?.state || "",
      ממתינים: pending,
      שגיאה: status?.error || status?.lastError || "—",
      שם: this.senderName()
    };
    await this.sendOnce(`sync:${isoDay(now)}`, this.buildTemplated("syncProblem", syncProblem, vars));
  }

  buildTemplated(type, settings, vars, employerId = null) {
    const text = fillTemplate(settings.body, vars);
    const { to } = resolveRecipients(this.config, settings.recipients, employerId);
    return { type, to, subject: fillTemplate(settings.subject, vars), text, html: textToHtml(text) };
  }

  // ----- Manual sending from the monthly summary -----

  async openPaymentRequest(monthKey, employerName) {
    await this.reloadConfig();
    const settings = this.config.notifications.paymentRequest;
    const report = this.reports.buildMonthReport(monthKey);
    const row = report.rows.find((item) => item.employerName === employerName);
    if (!row) {
      return;
    }
    const vars = rowVars(report, row, this.senderName());
    const { to, missingClient } = resolveRecipients(this.config, settings.recipients, row.employerId);
    this.openComposer({
      title: `💸 בקשת תשלום — ${employerName}`,
      type: "paymentRequest",
      to,
      subject: fillTemplate(settings.subject, vars),
      body: fillTemplate(settings.body, vars),
      warning: missingClient ? `ל«${employerName}» לא הוגדרה כתובת מייל (הגדרות ← מיילים ← כתובות לקוחות).` : ""
    });
  }

  async openClientSummary(monthKey, employerName) {
    await this.reloadConfig();
    const settings = this.config.notifications.clientSummary;
    const report = this.reports.buildMonthReport(monthKey);
    const row = report.rows.find((item) => item.employerName === employerName);
    if (!row) {
      return;
    }
    const content = buildClientSummaryEmail(report, row, this.senderName());
    const { to, missingClient } = resolveRecipients(this.config, settings.recipients, row.employerId);
    this.openComposer({
      title: `📄 דוח שעות — ${employerName}`,
      type: "clientSummary",
      to,
      subject: content.subject,
      previewHtml: content.html,
      text: content.text,
      warning: missingClient ? `ל«${employerName}» לא הוגדרה כתובת מייל (הגדרות ← מיילים ← כתובות לקוחות).` : ""
    });
  }

  async openMonthlySummary(monthKey) {
    await this.reloadConfig();
    const settings = this.config.notifications.monthlySummary;
    const report = this.reports.buildMonthReport(monthKey);
    const content = buildMonthlySummaryEmail(report, this.senderName());
    const { to } = resolveRecipients(this.config, settings.recipients);
    this.openComposer({
      title: `📊 סיכום חודש ${report.monthLabel}`,
      type: "monthlySummary",
      to,
      subject: content.subject,
      previewHtml: content.html,
      text: content.text
    });
  }

  /**
   * The compose window. With `body` the text is editable; with `previewHtml` (summaries)
   * the content is shown as a preview and only the recipients and subject can be changed.
   */
  openComposer({ title, type, to, subject, body = null, previewHtml = null, text = "", warning = "" }) {
    if (!this.isConfigured()) {
      this.modal.show({
        title: "📧 חשבון Gmail לא הוגדר",
        bodyHtml: `<p class="modal-hint">כדי לשלוח מיילים יש להגדיר קודם את חשבון ה-Gmail: הגדרות ← 📧 מיילים והתראות.</p>`,
        hideConfirm: true,
        cancelText: "סגור"
      });
      return;
    }

    const contentHtml =
      body !== null
        ? `<label class="field-label" for="composeBody">נוסח</label>
           <textarea id="composeBody" class="field-input compose-body" rows="12">${escapeHtml(body)}</textarea>`
        : `<div class="field-label">תצוגה מקדימה</div>
           <div class="compose-preview">${previewHtml}</div>`;

    this.modal.show({
      title,
      wide: true,
      confirmText: "📤 שלח",
      bodyHtml: `
        <div class="compose-form">
          ${warning ? `<div class="modal-feedback is-error">${escapeHtml(warning)}</div>` : ""}
          <label class="field-label" for="composeTo">אל (אפשר כמה כתובות, מופרדות בפסיק)</label>
          <input id="composeTo" type="text" class="field-input ltr-when-filled" value="${escapeHtml(to.join(", "))}" />
          <label class="field-label" for="composeSubject">נושא</label>
          <input id="composeSubject" type="text" class="field-input" value="${escapeHtml(subject)}" />
          ${contentHtml}
        </div>`,
      onConfirm: () => void this.sendFromComposer({ type, previewHtml, text })
    });
  }

  async sendFromComposer({ type, previewHtml, text }) {
    const toList = parseAddressList(document.getElementById("composeTo")?.value);
    const subject = document.getElementById("composeSubject")?.value || "";
    const bodyField = document.getElementById("composeBody");
    if (!toList.length) {
      this.modal.showFeedback("יש להזין לפחות כתובת מייל אחת.");
      return;
    }
    const confirmBtn = this.modal.confirmBtn;
    confirmBtn.disabled = true;
    this.modal.showFeedback("שולח…", "success");

    const mailText = bodyField ? bodyField.value : text;
    const result = await this.send({
      type,
      to: toList,
      subject,
      text: mailText,
      html: bodyField ? textToHtml(mailText) : previewHtml
    });
    confirmBtn.disabled = false;

    if (result.ok) {
      this.modal.showFeedback(`✓ המייל נשלח אל ${toList.join(", ")}`, "success");
      setTimeout(() => this.modal.hide(), 1500);
    } else {
      this.modal.showFeedback(`השליחה נכשלה: ${result.error}`);
    }
  }
}
