const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const CONFIG_FILE = "supabase.config.json";

function getConfigPath(userDataPath) {
  return path.join(userDataPath, CONFIG_FILE);
}

function readSavedConfig(userDataPath) {
  const configPath = getConfigPath(userDataPath);
  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (parsed?.url && parsed?.anonKey) {
      return { url: parsed.url, anonKey: parsed.anonKey };
    }
  } catch {
    // ignore invalid config
  }

  return null;
}

function saveConfig(userDataPath, { url, anonKey }) {
  if (!url || !anonKey) {
    return;
  }

  fs.writeFileSync(
    getConfigPath(userDataPath),
    JSON.stringify({ url, anonKey }, null, 2),
    "utf8"
  );
}

function loadDotEnvFromCandidates(app) {
  const userDataPath = app.getPath("userData");
  const candidates = [
    path.join(userDataPath, ".env"),
    path.join(path.dirname(process.execPath), ".env"),
    path.join(process.resourcesPath, ".env"),
    path.join(__dirname, "../../.env")
  ];

  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      return envPath;
    }
  }

  return null;
}

function loadSupabaseCredentials(app) {
  const userDataPath = app.getPath("userData");
  loadDotEnvFromCandidates(app);

  const fromEnv = {
    url: process.env.SUPABASE_URL || "",
    anonKey: process.env.SUPABASE_ANON_KEY || ""
  };

  if (fromEnv.url && fromEnv.anonKey) {
    saveConfig(userDataPath, fromEnv);
    return fromEnv;
  }

  const saved = readSavedConfig(userDataPath);
  if (saved) {
    return saved;
  }

  return { url: "", anonKey: "" };
}

module.exports = {
  loadSupabaseCredentials,
  getConfigPath,
  readSavedConfig
};
