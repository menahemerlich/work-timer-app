import { EMAIL_NOTIFICATIONS, escapeHtml, parseAddressList } from "../../core/services/EmailTemplates.js";

const TYPE_LABELS = {
  test: "מייל ניסיון",
  manual: "ידני",
  unpaidReminder: "תזכורת תשלום",
  unpaidRepeat: "תזכורת חוזרת",
  paymentRequest: "בקשת תשלום",
  monthlySummary: "סיכום חודשי",
  clientSummary: "דוח ללקוח",
  goalBehind: "פיגור ביעד",
  goalReached: "הגעה ליעד",
  backup: "גיבוי",
  syncProblem: "בעיית סנכרון"
};

function formatTime(iso) {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  return `${date.getDate()}.${date.getMonth() + 1} ${date.toLocaleTimeString("he-IL", { hour12: false })}`;
}

/** Settings → "📧 מיילים והתראות": Gmail account, client addresses and every notification. */
export class EmailSettingsController {
  constructor({ employerRepo }) {
    this.employerRepo = employerRepo;
    this.root = document.getElementById("emailSettingsSection");
    this.config = null;
    this.expanded = new Set();
    this.savedNotes = new Map();
  }

  get api() {
    return window.electronAPI?.email;
  }

  async init() {
    if (!this.root) {
      return;
    }
    if (!this.api) {
      this.root.innerHTML = `<p class="settings-hint">שליחת מיילים זמינה רק באפליקציה המותקנת.</p>`;
      return;
    }
    this.config = await this.api.getConfig();
    this.render();

    window.addEventListener("settings:changed", () => this.renderClientEmails());
    window.addEventListener("email:sent", () => void this.refreshHistory());
  }

  /** Re-reads the file after saving, so the screen shows what is really stored. */
  async applySaved(config) {
    this.config = config;
    window.dispatchEvent(new CustomEvent("email:configChanged", { detail: config }));
  }

  render() {
    this.root.innerHTML = `
      <div class="section-title">📧 מיילים והתראות</div>
      <p class="settings-hint">
        שליחה דרך חשבון Gmail שלך. המיילים האוטומטיים נבדקים כל חצי שעה כל עוד האפליקציה פתוחה,
        וכל מייל נשלח פעם אחת בלבד. ההגדרות נשמרות במחשב הזה.
      </p>
      <div class="email-card" id="emailAccountCard"></div>
      <div class="email-card" id="emailClientsCard"></div>
      <div class="email-subtitle">התראות</div>
      <div id="emailNotificationCards"></div>
      <div class="email-card" id="emailHistoryCard"></div>
    `;
    this.renderAccount();
    this.renderClientEmails();
    EMAIL_NOTIFICATIONS.forEach((def) => this.renderNotification(def));
    this.renderHistory();
  }

  // ----- Gmail account -----

  renderAccount() {
    const card = this.root.querySelector("#emailAccountCard");
    const { account, myEmail } = this.config;
    card.innerHTML = `
      <div class="email-card-head">
        <div class="email-card-title">🔐 חשבון Gmail</div>
        <span class="email-badge ${account.hasPassword && account.address ? "is-on" : ""}">
          ${account.hasPassword && account.address ? "מוגדר" : "לא מוגדר"}
        </span>
      </div>
      <p class="settings-hint">
        צריך <strong>סיסמת אפליקציה</strong> (לא הסיסמה הרגילה): בחשבון Google מפעילים אימות דו-שלבי,
        ואז נכנסים ל-<span dir="ltr">myaccount.google.com/apppasswords</span>, יוצרים סיסמה בשם «טיימר» ומעתיקים לכאן את 16 התווים.
      </p>
      <div class="email-grid">
        <div class="goal-group">
          <label class="field-label" for="emailAddress">כתובת Gmail</label>
          <input id="emailAddress" type="email" class="field-input ltr-when-filled" value="${escapeHtml(account.address)}" placeholder="name@gmail.com" />
        </div>
        <div class="goal-group">
          <label class="field-label" for="emailPassword">סיסמת אפליקציה</label>
          <input id="emailPassword" type="password" class="field-input ltr-when-filled" autocomplete="new-password"
            placeholder="${account.hasPassword ? "•••• שמורה — השאר ריק כדי לא לשנות" : "16 תווים"}" />
        </div>
        <div class="goal-group">
          <label class="field-label" for="emailFromName">שם השולח (יופיע בחתימה)</label>
          <input id="emailFromName" type="text" class="field-input" value="${escapeHtml(account.fromName)}" placeholder="לדוגמה: מנחם" />
        </div>
        <div class="goal-group">
          <label class="field-label" for="emailMyEmail">המייל שלי (לקבלת התראות)</label>
          <input id="emailMyEmail" type="email" class="field-input ltr-when-filled" value="${escapeHtml(myEmail)}" placeholder="ברירת מחדל: כתובת ה-Gmail" />
        </div>
      </div>
      <div class="email-card-foot">
        <button type="button" class="btn-action btn-lavender-solid" data-action="save-account">💾 שמור</button>
        <button type="button" class="btn-soft" data-action="verify">🔌 בדוק חיבור</button>
        <button type="button" class="btn-soft btn-mint" data-action="test">✉️ שלח מייל ניסיון</button>
        <span class="email-status" data-status></span>
      </div>
    `;

    const status = card.querySelector("[data-status]");
    const setStatus = (text, kind = "") => {
      status.textContent = text;
      status.className = `email-status ${kind ? `is-${kind}` : ""}`;
    };
    if (this.savedNotes.get("account")) {
      setStatus(this.savedNotes.get("account"), "ok");
    }

    const markDirty = () => setStatus("● יש שינויים שלא נשמרו", "dirty");
    card.querySelectorAll("input").forEach((input) => input.addEventListener("input", markDirty));

    card.querySelector('[data-action="save-account"]').addEventListener("click", async () => {
      const address = card.querySelector("#emailAddress").value.trim();
      const password = card.querySelector("#emailPassword").value;
      const myEmailValue = card.querySelector("#emailMyEmail").value.trim();
      if (address && !address.includes("@")) {
        setStatus("כתובת ה-Gmail לא תקינה.", "error");
        return;
      }
      const saved = await this.api.saveConfig({
        account: { address, fromName: card.querySelector("#emailFromName").value.trim(), password },
        myEmail: myEmailValue
      });
      await this.applySaved(saved);
      this.savedNotes.set("account", `✓ נשמר ${formatTime(saved.savedAt)}`);
      this.renderAccount();
    });

    card.querySelector('[data-action="verify"]').addEventListener("click", async () => {
      setStatus("בודק חיבור…");
      const result = await this.api.verify();
      setStatus(result.ok ? "✓ ההתחברות ל-Gmail הצליחה" : `✗ ${result.error}`, result.ok ? "ok" : "error");
    });

    card.querySelector('[data-action="test"]').addEventListener("click", async () => {
      const to = this.config.myEmail || this.config.account.address;
      if (!to) {
        setStatus("יש לשמור קודם כתובת Gmail.", "error");
        return;
      }
      setStatus("שולח…");
      const text = "זה מייל ניסיון מטיימר שעות עבודה. אם קיבלת אותו — הכול מוגדר נכון ✓";
      const result = await this.api.send({
        type: "test",
        to: [to],
        subject: "מייל ניסיון — טיימר שעות עבודה",
        text,
        html: `<div dir="rtl" style="font-family:Arial;font-size:14px">${text}</div>`
      });
      window.dispatchEvent(new CustomEvent("email:sent", { detail: result }));
      setStatus(result.ok ? `✓ נשלח אל ${to}` : `✗ ${result.error}`, result.ok ? "ok" : "error");
    });
  }

  // ----- Client addresses -----

  renderClientEmails() {
    const card = this.root?.querySelector("#emailClientsCard");
    if (!card || !this.config) {
      return;
    }
    const employers = this.employerRepo.getAll();
    const rows = employers.length
      ? employers
          .map(
            (employer) => `
          <div class="email-client-row">
            <span class="email-client-name">${escapeHtml(employer.name)}</span>
            <input type="email" class="field-input ltr-when-filled" data-employer-id="${escapeHtml(employer.id)}"
              value="${escapeHtml(this.config.clientEmails?.[employer.id] || "")}" placeholder="client@example.com" />
          </div>`
          )
          .join("")
      : `<p class="settings-hint">אין עדיין מעסיקים.</p>`;

    card.innerHTML = `
      <div class="email-card-head">
        <div class="email-card-title">👥 כתובות מייל של לקוחות</div>
      </div>
      <p class="settings-hint">לכתובות האלה נשלחים מיילים שמסומן בהם «ללקוח».</p>
      <div class="email-client-list">${rows}</div>
      <div class="email-card-foot">
        <button type="button" class="btn-action btn-lavender-solid" data-action="save-clients">💾 שמור שינויים</button>
        <span class="email-status" data-status></span>
      </div>
    `;
    const status = card.querySelector("[data-status]");
    if (this.savedNotes.get("clients")) {
      status.textContent = this.savedNotes.get("clients");
      status.className = "email-status is-ok";
    }
    card.querySelectorAll("input").forEach((input) =>
      input.addEventListener("input", () => {
        status.textContent = "● יש שינויים שלא נשמרו";
        status.className = "email-status is-dirty";
      })
    );
    card.querySelector('[data-action="save-clients"]').addEventListener("click", async () => {
      const clientEmails = { ...this.config.clientEmails };
      let invalid = "";
      card.querySelectorAll("input[data-employer-id]").forEach((input) => {
        const value = input.value.trim();
        if (value && !value.includes("@")) {
          invalid = value;
        }
        if (value) {
          clientEmails[input.dataset.employerId] = value;
        } else {
          delete clientEmails[input.dataset.employerId];
        }
      });
      if (invalid) {
        status.textContent = `הכתובת «${invalid}» לא תקינה.`;
        status.className = "email-status is-error";
        return;
      }
      const saved = await this.api.saveConfig({ clientEmails });
      await this.applySaved(saved);
      this.savedNotes.set("clients", `✓ נשמר ${formatTime(saved.savedAt)}`);
      this.renderClientEmails();
    });
  }

  // ----- Notifications -----

  renderNotification(def) {
    const container = this.root.querySelector("#emailNotificationCards");
    let card = container.querySelector(`[data-notification="${def.id}"]`);
    if (!card) {
      card = document.createElement("div");
      card.className = "email-card email-notification";
      card.dataset.notification = def.id;
      container.appendChild(card);
    }
    const settings = this.config.notifications[def.id];
    const isOpen = this.expanded.has(def.id);

    const paramsHtml = def.params
      .map((param) => {
        if (param.type === "select") {
          return `<div class="goal-group">
            <label class="field-label">${param.label}</label>
            <select class="field-input" data-param="${param.key}">
              ${param.options
                .map(
                  (opt) =>
                    `<option value="${opt.value}" ${settings[param.key] === opt.value ? "selected" : ""}>${opt.label}</option>`
                )
                .join("")}
            </select>
          </div>`;
        }
        return `<div class="goal-group">
          <label class="field-label">${param.label}</label>
          <input type="number" class="field-input" data-param="${param.key}" min="${param.min}" max="${param.max}" step="1"
            value="${escapeHtml(settings[param.key] ?? "")}" />
        </div>`;
      })
      .join("");

    const recipients = settings.recipients || {};
    const templateHtml = def.editable
      ? `<div class="email-template">
          <label class="field-label">נושא</label>
          <input type="text" class="field-input" data-field="subject" value="${escapeHtml(settings.subject)}" />
          <label class="field-label">נוסח</label>
          <textarea class="field-input email-template-body" data-field="body" rows="8">${escapeHtml(settings.body)}</textarea>
          <div class="email-placeholders">
            <span>אפשר להשתמש ב:</span>
            ${(def.placeholders || []).map((name) => `<button type="button" class="email-placeholder" data-insert="{${name}}">{${name}}</button>`).join("")}
          </div>
        </div>`
      : `<p class="settings-hint">התוכן נבנה אוטומטית מהנתונים (טבלה מסודרת), ולכן אין נוסח לעריכה.</p>`;

    card.classList.toggle("is-enabled", Boolean(settings.enabled));
    card.innerHTML = `
      <div class="email-card-head">
        <label class="email-toggle" title="פעיל / לא פעיל">
          <input type="checkbox" data-field="enabled" ${settings.enabled ? "checked" : ""} />
          <span class="email-toggle-track"><span class="email-toggle-thumb"></span></span>
          <span class="email-toggle-text">${settings.enabled ? "פעיל" : "לא פעיל"}</span>
        </label>
        <div class="email-card-title">${def.icon} ${def.title}</div>
        <button type="button" class="link-btn email-expand" data-action="expand">${isOpen ? "▲ סגור" : "✏️ הגדרות ונוסח"}</button>
      </div>
      <div class="email-card-body" ${isOpen ? "" : "hidden"}>
        <p class="settings-hint">${def.description}</p>
        ${paramsHtml ? `<div class="email-grid">${paramsHtml}</div>` : ""}
        <div class="email-recipients">
          <span class="field-label">מי מקבל:</span>
          <label class="email-check"><input type="checkbox" data-recipient="me" ${recipients.me ? "checked" : ""} /> אליי</label>
          ${def.clientOption ? `<label class="email-check"><input type="checkbox" data-recipient="client" ${recipients.client ? "checked" : ""} /> ללקוח</label>` : ""}
          <input type="text" class="field-input email-extra ltr-when-filled" data-recipient="extra"
            value="${escapeHtml(recipients.extra || "")}" placeholder="כתובות נוספות, מופרדות בפסיק" />
        </div>
        ${templateHtml}
      </div>
      <div class="email-card-foot">
        <button type="button" class="btn-action btn-lavender-solid" data-action="save">💾 שמור שינויים</button>
        <span class="email-status" data-status></span>
      </div>
    `;

    const status = card.querySelector("[data-status]");
    if (this.savedNotes.get(def.id)) {
      status.textContent = this.savedNotes.get(def.id);
      status.className = "email-status is-ok";
    }
    const markDirty = () => {
      status.textContent = "● יש שינויים שלא נשמרו";
      status.className = "email-status is-dirty";
    };
    card.querySelectorAll("input, textarea, select").forEach((field) => {
      field.addEventListener("input", markDirty);
      field.addEventListener("change", markDirty);
    });
    const enabledInput = card.querySelector('[data-field="enabled"]');
    enabledInput.addEventListener("change", () => {
      card.querySelector(".email-toggle-text").textContent = enabledInput.checked ? "פעיל" : "לא פעיל";
    });

    card.querySelector('[data-action="expand"]').addEventListener("click", () => {
      if (this.expanded.has(def.id)) {
        this.expanded.delete(def.id);
      } else {
        this.expanded.add(def.id);
      }
      const body = card.querySelector(".email-card-body");
      body.hidden = !this.expanded.has(def.id);
      card.querySelector('[data-action="expand"]').textContent = body.hidden ? "✏️ הגדרות ונוסח" : "▲ סגור";
    });

    let lastFocusedText = null;
    card.querySelectorAll('[data-field="subject"], [data-field="body"]').forEach((field) =>
      field.addEventListener("focus", () => {
        lastFocusedText = field;
      })
    );
    card.querySelectorAll("[data-insert]").forEach((button) =>
      button.addEventListener("click", () => {
        const field = lastFocusedText || card.querySelector('[data-field="body"]');
        const start = field.selectionStart ?? field.value.length;
        const end = field.selectionEnd ?? field.value.length;
        field.value = field.value.slice(0, start) + button.dataset.insert + field.value.slice(end);
        field.focus();
        field.selectionStart = field.selectionEnd = start + button.dataset.insert.length;
        markDirty();
      })
    );

    card.querySelector('[data-action="save"]').addEventListener("click", () => void this.saveNotification(def, card));
  }

  async saveNotification(def, card) {
    const status = card.querySelector("[data-status]");
    const value = {
      enabled: card.querySelector('[data-field="enabled"]').checked,
      recipients: {
        me: Boolean(card.querySelector('[data-recipient="me"]')?.checked),
        client: Boolean(card.querySelector('[data-recipient="client"]')?.checked),
        extra: card.querySelector('[data-recipient="extra"]').value.trim()
      }
    };

    const extraRaw = value.recipients.extra;
    if (extraRaw && parseAddressList(extraRaw).length !== extraRaw.split(/[,;\s]+/).filter(Boolean).length) {
      status.textContent = "יש כתובת לא תקינה בכתובות הנוספות.";
      status.className = "email-status is-error";
      return;
    }
    if (value.enabled && !value.recipients.me && !value.recipients.client && !extraRaw) {
      status.textContent = "יש לבחור לפחות נמען אחד.";
      status.className = "email-status is-error";
      return;
    }

    for (const param of def.params) {
      const field = card.querySelector(`[data-param="${param.key}"]`);
      if (param.type === "select") {
        value[param.key] = field.value;
        continue;
      }
      const num = Number(field.value);
      if (!Number.isFinite(num) || num < param.min || num > param.max) {
        status.textContent = `«${param.label.trim()}» צריך להיות בין ${param.min} ל-${param.max}.`;
        status.className = "email-status is-error";
        return;
      }
      value[param.key] = num;
    }

    if (def.editable) {
      value.subject = card.querySelector('[data-field="subject"]').value;
      value.body = card.querySelector('[data-field="body"]').value;
      if (!value.subject.trim() || !value.body.trim()) {
        status.textContent = "הנושא והנוסח לא יכולים להיות ריקים.";
        status.className = "email-status is-error";
        return;
      }
    }

    const saved = await this.api.saveConfig({ notifications: { [def.id]: value } });
    await this.applySaved(saved);

    // Confirm against what was read back from the file.
    const stored = saved.notifications[def.id];
    const matches =
      stored.enabled === value.enabled &&
      (!def.editable || (stored.subject === value.subject && stored.body === value.body));
    this.savedNotes.set(
      def.id,
      matches
        ? `✓ נשמר ${formatTime(saved.savedAt)} · ${stored.enabled ? "פעיל" : "לא פעיל"}`
        : "✗ השמירה לא הצליחה — נסה שוב"
    );
    this.renderNotification(def);
  }

  // ----- History -----

  async refreshHistory() {
    this.config = await this.api.getConfig();
    this.renderHistory();
  }

  renderHistory() {
    const card = this.root.querySelector("#emailHistoryCard");
    const history = (this.config.history || []).slice(0, 12);
    const rows = history.length
      ? history
          .map(
            (item) => `
          <div class="email-history-row ${item.ok ? "is-ok" : "is-error"}">
            <span class="email-history-icon">${item.ok ? "✓" : "✗"}</span>
            <span class="email-history-time">${formatTime(item.at)}</span>
            <span class="email-history-type">${TYPE_LABELS[item.type] || item.type}</span>
            <span class="email-history-subject">${escapeHtml(item.subject || "")}</span>
            <span class="email-history-to" dir="ltr">${escapeHtml((item.to || []).join(", "))}</span>
            ${item.ok ? "" : `<span class="email-history-error">${escapeHtml(item.error || "")}</span>`}
          </div>`
          )
          .join("")
      : `<p class="settings-hint">עדיין לא נשלחו מיילים.</p>`;
    card.innerHTML = `
      <div class="email-card-head">
        <div class="email-card-title">🧾 יומן שליחות</div>
        <button type="button" class="link-btn" data-action="refresh-history">רענן</button>
      </div>
      <div class="email-history">${rows}</div>
    `;
    card.querySelector('[data-action="refresh-history"]').addEventListener("click", () => void this.refreshHistory());
  }
}
