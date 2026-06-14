const { createClient } = require("@supabase/supabase-js");

function normalizeSupabaseUrl(url) {
  if (!url) {
    return "";
  }

  let normalized = url.trim().replace(/\/+$/, "");

  // Users sometimes copy the REST URL from the dashboard by mistake.
  normalized = normalized.replace(/\/rest\/v1$/i, "");

  return normalized;
}

class SupabaseService {
  constructor({ url, anonKey, userDataPath, authSession }) {
    this.url = normalizeSupabaseUrl(url);
    this.anonKey = anonKey || "";
    this.userDataPath = userDataPath;
    this.authSession = authSession;
    this.client = null;
    this.session = null;
  }

  isConfigured() {
    return Boolean(this.url && this.anonKey);
  }

  getClient() {
    if (!this.isConfigured()) {
      return null;
    }

    if (!this.client) {
      this.client = createClient(this.url, this.anonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: true
        }
      });
    }

    return this.client;
  }

  async restoreSession() {
    const client = this.getClient();
    if (!client) {
      return null;
    }

    const saved = this.authSession.loadSession(this.userDataPath);
    if (!saved) {
      return null;
    }

    const { data, error } = await client.auth.setSession(saved);
    if (error) {
      this.authSession.clearSession(this.userDataPath);
      return null;
    }

    this.session = data.session;
    return this.session;
  }

  async resolveEmailByUsername(client, username) {
    const { data, error } = await client.rpc("email_for_username", {
      p_username: username
    });
    if (error) {
      throw new Error(
        "התחברות עם שם משתמש אינה זמינה כרגע — התחבר עם כתובת האימייל, או הגדר את הפונקציה בענן."
      );
    }
    if (!data) {
      throw new Error("שם המשתמש או הסיסמה שגויים.");
    }
    return data;
  }

  async signIn(identifier, password) {
    const client = this.getClient();
    if (!client) {
      throw new Error("Supabase לא מוגדר — הוסף SUPABASE_URL ו-SUPABASE_ANON_KEY ל-.env");
    }

    let email = String(identifier || "").trim();
    // Allow logging in with a username instead of an email address.
    if (email && !email.includes("@")) {
      email = await this.resolveEmailByUsername(client, email);
    }

    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      throw error;
    }

    this.session = data.session;
    this.authSession.saveSession(this.userDataPath, {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token
    });
    return { user: data.user, session: data.session };
  }

  async signUp(email, password, username) {
    const client = this.getClient();
    if (!client) {
      throw new Error("Supabase לא מוגדר — הוסף SUPABASE_URL ו-SUPABASE_ANON_KEY ל-.env");
    }

    const trimmedUsername = String(username || "").trim();
    if (!trimmedUsername) {
      throw new Error("יש להזין שם משתמש.");
    }

    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: trimmedUsername
        }
      }
    });
    if (error) {
      throw error;
    }

    if (data.session) {
      this.session = data.session;
      this.authSession.saveSession(this.userDataPath, {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token
      });
    }

    return { user: data.user, session: data.session };
  }

  async signOut() {
    const client = this.getClient();
    if (client) {
      await client.auth.signOut();
    }
    this.session = null;
    this.authSession.clearSession(this.userDataPath);
  }

  getSession() {
    return this.session;
  }

  getUserId() {
    return this.session?.user?.id || null;
  }

  getDisplayName() {
    const user = this.session?.user;
    if (!user) {
      return null;
    }

    const username = user.user_metadata?.username;
    if (username && String(username).trim()) {
      return String(username).trim();
    }

    return user.email || null;
  }

  getSessionUser() {
    const user = this.session?.user;
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      username: user.user_metadata?.username || null,
      displayName: this.getDisplayName()
    };
  }

  async ping() {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      const client = this.getClient();
      const { error } = await client.from("employers").select("id").limit(1);
      return !error || error.code === "PGRST116";
    } catch {
      return false;
    }
  }

  async pushEmployer(userId, employer, operation) {
    const client = this.getClient();
    if (!client || !userId) {
      throw new Error("אין חיבור לענן — התחבר מחדש");
    }

    if (operation === "delete") {
      const { error } = await client
        .from("employers")
        .delete()
        .eq("id", employer.id)
        .eq("user_id", userId);
      if (error) {
        throw error;
      }
      return;
    }

    const { error } = await client.from("employers").upsert({
      id: employer.id,
      user_id: userId,
      name: employer.name,
      created_at: employer.createdAt,
      color: employer.color || null,
      hourly_rate: employer.hourlyRate ?? null,
      updated_at: employer.updatedAt || new Date().toISOString(),
      deleted_at: null
    });
    if (error) {
      throw error;
    }
  }

  async pushWorkLog(userId, log, operation) {
    const client = this.getClient();
    if (!client || !userId) {
      throw new Error("אין חיבור לענן — התחבר מחדש");
    }

    if (operation === "delete") {
      const { error } = await client
        .from("work_logs")
        .delete()
        .eq("id", log.id)
        .eq("user_id", userId);
      if (error) {
        throw error;
      }
      return;
    }

    const { error } = await client.from("work_logs").upsert({
      id: log.id,
      user_id: userId,
      date: log.date,
      start_time: log.start,
      end_time: log.end,
      duration_ms: log.durationMs,
      duration_str: log.durationStr,
      employer_id: log.employerId || null,
      employer_name: log.employerName,
      note: log.note || "",
      updated_at: log.updatedAt || new Date().toISOString(),
      deleted_at: null
    });
    if (error) {
      throw error;
    }
  }

  async pushAppSetting(userId, setting) {
    const client = this.getClient();
    if (!client || !userId) {
      throw new Error("אין חיבור לענן — התחבר מחדש");
    }

    const { error } = await client.from("app_settings").upsert({
      user_id: userId,
      key: setting.key,
      value: JSON.stringify(setting.value),
      updated_at: setting.updatedAt || new Date().toISOString()
    });
    if (error) {
      throw error;
    }
  }

  async pushTimerState(userId, state, operation) {
    const client = this.getClient();
    if (!client || !userId) {
      throw new Error("אין חיבור לענן — התחבר מחדש");
    }

    if (operation === "delete") {
      const { error } = await client.from("timer_state").delete().eq("user_id", userId);
      if (error) {
        throw error;
      }
      return;
    }

    const { error } = await client.from("timer_state").upsert({
      user_id: userId,
      elapsed_ms: state.elapsedMs || 0,
      is_paused: !!state.isPaused,
      is_running: !!state.isRunning,
      employer_id: state.employerId || null,
      employer_name: state.employerName || null,
      original_start_time: state.originalStartTime || null,
      segment_start_time: state.segmentStartTime || null,
      session_note: state.sessionNote || "",
      updated_at: state.updatedAt || new Date().toISOString()
    });
    if (error) {
      throw error;
    }
  }

  async pullChanges(userId, since) {
    const client = this.getClient();
    if (!client || !userId) {
      return { employers: [], workLogs: [], appSettings: [], timerState: null };
    }

    const sinceFilter = since || "1970-01-01T00:00:00.000Z";

    const [employersRes, logsRes, settingsRes, timerRes] = await Promise.all([
      client.from("employers").select("*").eq("user_id", userId).gt("updated_at", sinceFilter),
      client.from("work_logs").select("*").eq("user_id", userId).gt("updated_at", sinceFilter),
      client.from("app_settings").select("*").eq("user_id", userId).gt("updated_at", sinceFilter),
      client.from("timer_state").select("*").eq("user_id", userId).maybeSingle()
    ]);

    for (const res of [employersRes, logsRes, settingsRes, timerRes]) {
      if (res.error) {
        throw res.error;
      }
    }

    return {
      employers: employersRes.data || [],
      workLogs: logsRes.data || [],
      appSettings: settingsRes.data || [],
      timerState: timerRes.data || null
    };
  }
}

module.exports = { SupabaseService };
