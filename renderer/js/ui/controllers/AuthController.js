export class AuthController {
  constructor({ modal }) {
    this.modal = modal;
    this.authBtn = document.getElementById("authBtn");
    this.authStatus = document.getElementById("authStatus");
    this.authMode = "signIn";
  }

  init() {
    this.authBtn?.addEventListener("click", () => this.openAuthModal());
    this.refresh();
  }

  async refresh() {
    if (!this.authStatus || !window.electronAPI?.auth) {
      return;
    }

    const configured = await window.electronAPI.auth.isConfigured();
    if (!configured) {
      this.authStatus.textContent = "מקומי";
      this.authBtn.textContent = "ענן";
      this.authBtn.title = "Supabase לא מוגדר";
      return;
    }

    const session = await window.electronAPI.auth.getSession();
    if (session) {
      this.authStatus.textContent = session.displayName || session.username || session.email;
      this.authBtn.textContent = "התנתק";
    } else {
      this.authStatus.textContent = "לא מחובר";
      this.authBtn.textContent = "התחבר";
    }
  }

  openAuthModal() {
    window.electronAPI?.auth?.isConfigured().then(async (configured) => {
      if (!configured) {
        this.modal.show({
          title: "סנכרון ענן",
          bodyHtml: `
            <p class="modal-hint">הגדרות Supabase לא נמצאו.</p>
            <p class="modal-hint">בפיתוח: הוסף קובץ <code>.env</code> בשורש הפרויקט עם:</p>
            <pre class="env-example">SUPABASE_URL=...\nSUPABASE_ANON_KEY=...</pre>
            <p class="modal-hint">בגרסה מותקנת: שים את אותו קובץ <code>.env</code> ליד קובץ ההפעלה, או הרץ פעם אחת מ<code>npm start</code> כדי לשמור את ההגדרות.</p>
          `,
          confirmText: "סגור",
          onConfirm: () => this.modal.hide()
        });
        return;
      }

      const session = await window.electronAPI.auth.getSession();
      if (session) {
        await window.electronAPI.auth.signOut();
        this.refresh();
        return;
      }

      this.authMode = "signIn";
      this.renderAuthForm();
    });
  }

  renderAuthForm() {
    const isSignUp = this.authMode === "signUp";

    this.modal.show({
      title: isSignUp ? "הרשמה לענן" : "התחברות לענן",
      bodyHtml: `
        ${
          isSignUp
            ? `
          <label class="field-label" for="authUsername">שם משתמש</label>
          <input id="authUsername" type="text" class="field-input" autocomplete="nickname" maxlength="32" />
        `
            : ""
        }
        <label class="field-label" for="authEmail">אימייל</label>
        <input id="authEmail" type="email" class="field-input" autocomplete="username" />
        <label class="field-label" for="authPassword">סיסמה</label>
        <input id="authPassword" type="password" class="field-input" autocomplete="${
          isSignUp ? "new-password" : "current-password"
        }" />
        <p class="modal-hint">${
          isSignUp
            ? "שם המשתמש יוצג באפליקציה. האימייל משמש רק להתחברות."
            : "האפליקציה עובדת גם offline. הסנכרון לענן דורש התחברות."
        }</p>
        <div class="auth-modal-actions">
          <button type="button" id="authToggleModeBtn" class="btn-soft">${
            isSignUp ? "יש לי חשבון" : "הרשמה"
          }</button>
          <button type="button" id="authSubmitBtn" class="btn-action btn-start">${
            isSignUp ? "הירשם" : "התחבר"
          }</button>
        </div>
      `,
      hideConfirm: true,
      onDismiss: () => {}
    });

    document.getElementById("authSubmitBtn")?.addEventListener("click", () => {
      if (this.authMode === "signUp") {
        this.handleSignUp();
      } else {
        this.handleSignIn();
      }
    });

    document.getElementById("authToggleModeBtn")?.addEventListener("click", () => {
      this.authMode = this.authMode === "signUp" ? "signIn" : "signUp";
      this.renderAuthForm();
    });
  }

  getCredentials() {
    const email = document.getElementById("authEmail")?.value?.trim();
    const password = document.getElementById("authPassword")?.value || "";
    const username = document.getElementById("authUsername")?.value?.trim() || "";
    return { email, password, username };
  }

  async handleSignIn() {
    const { email, password } = this.getCredentials();
    if (!email || !password) {
      this.modal.showFeedback("יש למלא אימייל וסיסמה.");
      return;
    }

    try {
      await window.electronAPI.auth.signIn(email, password);
      this.modal.hide();
      this.refresh();
    } catch (error) {
      this.modal.showFeedback(error.message || "שגיאה בהתחברות.");
    }
  }

  async handleSignUp() {
    const { email, password, username } = this.getCredentials();
    if (!username) {
      this.modal.showFeedback("יש להזין שם משתמש.");
      return;
    }
    if (!email || !password) {
      this.modal.showFeedback("יש למלא אימייל וסיסמה.");
      return;
    }

    try {
      const result = await window.electronAPI.auth.signUp(email, password, username);
      if (result.needsConfirmation) {
        this.modal.showFeedback("נרשמת בהצלחה — בדוק אימייל לאישור.", "success");
        return;
      }
      this.modal.hide();
      this.refresh();
    } catch (error) {
      this.modal.showFeedback(error.message || "שגיאה בהרשמה.");
    }
  }
}
