const fs = require("fs");
const path = require("path");
const { safeStorage } = require("electron");
const nodemailer = require("nodemailer");
const { NOTIFICATION_DEFAULTS, defaultConfig } = require("./emailDefaults");

const CONFIG_FILE = "email-config.json";
const HISTORY_LIMIT = 40;

/**
 * Gmail sending (SMTP + app password) and the email settings file.
 * The settings stay on this computer only (not synced), so automatic emails are sent once,
 * from this machine. The app password is encrypted with the OS key store (safeStorage).
 */
class EmailService {
  constructor(userDataPath) {
    this.configPath = path.join(userDataPath, CONFIG_FILE);
  }

  readRaw() {
    const base = defaultConfig();
    let stored = {};
    try {
      if (fs.existsSync(this.configPath)) {
        stored = JSON.parse(fs.readFileSync(this.configPath, "utf8")) || {};
      }
    } catch (error) {
      console.error("Failed to read email config:", error);
    }

    const notifications = {};
    Object.keys(NOTIFICATION_DEFAULTS).forEach((id) => {
      const defaults = base.notifications[id];
      const saved = stored.notifications?.[id] || {};
      notifications[id] = {
        ...defaults,
        ...saved,
        recipients: { ...defaults.recipients, ...(saved.recipients || {}) }
      };
    });

    return {
      account: { ...base.account, ...(stored.account || {}) },
      myEmail: stored.myEmail || "",
      clientEmails: stored.clientEmails || {},
      notifications,
      sentLog: stored.sentLog || {},
      history: Array.isArray(stored.history) ? stored.history : [],
      savedAt: stored.savedAt || null
    };
  }

  writeRaw(config) {
    const data = { ...config, savedAt: new Date().toISOString() };
    const tmp = `${this.configPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmp, this.configPath);
  }

  /** Settings for the renderer — everything except the password itself. */
  getConfig() {
    const raw = this.readRaw();
    const { passwordEnc, ...account } = raw.account;
    return { ...raw, account: { ...account, hasPassword: Boolean(passwordEnc) } };
  }

  /**
   * Merges a partial update and writes it to disk. Returns the settings read back from the
   * file, so the screen shows what was actually saved.
   */
  saveConfig(patch = {}) {
    const raw = this.readRaw();

    if (patch.account) {
      const { password, ...rest } = patch.account;
      raw.account = { ...raw.account, ...rest };
      if (typeof password === "string" && password.trim()) {
        raw.account.passwordEnc = this.encrypt(password.replace(/\s+/g, ""));
      }
    }
    if (patch.myEmail !== undefined) {
      raw.myEmail = String(patch.myEmail || "").trim();
    }
    if (patch.clientEmails) {
      raw.clientEmails = { ...patch.clientEmails };
    }
    if (patch.notifications) {
      Object.entries(patch.notifications).forEach(([id, value]) => {
        if (!raw.notifications[id]) {
          return;
        }
        raw.notifications[id] = {
          ...raw.notifications[id],
          ...value,
          recipients: { ...raw.notifications[id].recipients, ...(value.recipients || {}) }
        };
      });
    }

    this.writeRaw(raw);
    return this.getConfig();
  }

  markSent(key) {
    const raw = this.readRaw();
    raw.sentLog[key] = new Date().toISOString();
    this.writeRaw(raw);
  }

  addHistory(entry) {
    const raw = this.readRaw();
    raw.history = [{ at: new Date().toISOString(), ...entry }, ...raw.history].slice(0, HISTORY_LIMIT);
    this.writeRaw(raw);
  }

  encrypt(text) {
    if (safeStorage.isEncryptionAvailable()) {
      return `enc:${safeStorage.encryptString(text).toString("base64")}`;
    }
    return `b64:${Buffer.from(text, "utf8").toString("base64")}`;
  }

  decrypt(value) {
    if (!value) {
      return "";
    }
    if (value.startsWith("enc:")) {
      return safeStorage.decryptString(Buffer.from(value.slice(4), "base64"));
    }
    if (value.startsWith("b64:")) {
      return Buffer.from(value.slice(4), "base64").toString("utf8");
    }
    return "";
  }

  createTransport() {
    const { account } = this.readRaw();
    const password = this.decrypt(account.passwordEnc);
    if (!account.address || !password) {
      throw new Error("חשבון Gmail לא הוגדר — יש למלא כתובת וסיסמת אפליקציה ולשמור.");
    }
    return {
      transport: nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: account.address, pass: password }
      }),
      account
    };
  }

  /**
   * Sends one email. mail: { to: string[], subject, text, html?, attachments?, type? }.
   * Every attempt (success or failure) is written to the history shown in settings.
   */
  async send(mail) {
    const to = (mail.to || []).map((item) => String(item).trim()).filter(Boolean);
    try {
      if (!to.length) {
        throw new Error("אין נמענים למייל.");
      }
      const { transport, account } = this.createTransport();
      const from = account.fromName ? `"${account.fromName}" <${account.address}>` : account.address;
      await transport.sendMail({
        from,
        to: to.join(", "),
        subject: mail.subject || "",
        text: mail.text || "",
        html: mail.html || undefined,
        attachments: (mail.attachments || []).map((file) => ({
          filename: file.filename,
          content: file.content,
          contentType: file.contentType || "application/octet-stream"
        }))
      });
      this.addHistory({ type: mail.type || "manual", subject: mail.subject, to, ok: true });
      return { ok: true };
    } catch (error) {
      const message = friendlyError(error);
      this.addHistory({ type: mail.type || "manual", subject: mail.subject, to, ok: false, error: message });
      return { ok: false, error: message };
    }
  }

  /** Checks the login without sending anything. */
  async verify() {
    try {
      const { transport } = this.createTransport();
      await transport.verify();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: friendlyError(error) };
    }
  }
}

function friendlyError(error) {
  const message = error?.message || String(error);
  if (/Invalid login|Username and Password not accepted|535/i.test(message)) {
    return "Gmail דחה את ההתחברות — בדוק את הכתובת ואת סיסמת האפליקציה (16 תווים).";
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|getaddrinfo/i.test(message)) {
    return "אין חיבור לאינטרנט / לשרת של Gmail.";
  }
  return message;
}

module.exports = { EmailService };
