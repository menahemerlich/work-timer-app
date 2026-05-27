const { safeStorage } = require("electron");
const fs = require("fs");
const path = require("path");

const SESSION_FILE = "supabase-session.json";

function getSessionPath(userDataPath) {
  return path.join(userDataPath, SESSION_FILE);
}

function saveSession(userDataPath, session) {
  const payload = JSON.stringify(session);
  const filePath = getSessionPath(userDataPath);

  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(payload);
    fs.writeFileSync(filePath, encrypted);
  } else {
    fs.writeFileSync(filePath, payload, "utf8");
  }
}

function loadSession(userDataPath) {
  const filePath = getSessionPath(userDataPath);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath);
    if (safeStorage.isEncryptionAvailable()) {
      return JSON.parse(safeStorage.decryptString(raw));
    }
    return JSON.parse(raw.toString("utf8"));
  } catch {
    return null;
  }
}

function clearSession(userDataPath) {
  const filePath = getSessionPath(userDataPath);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

module.exports = { saveSession, loadSession, clearSession };
