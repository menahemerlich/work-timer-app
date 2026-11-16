// Runs the app on fresh demo data in a separate folder (your real data is not touched).
// Usage: npm run demo        (add -- --keep to reuse the existing demo data)
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync, spawn } = require("child_process");
const electron = require("electron");

const root = path.join(__dirname, "..");
const demoDir = path.join(os.tmpdir(), "worktimer-demo");
const keep = process.argv.includes("--keep");

if (!keep || !fs.existsSync(path.join(demoDir, "worktimer.db"))) {
  fs.rmSync(demoDir, { recursive: true, force: true });
  const seeded = spawnSync(electron, [path.join(__dirname, "seed-demo.js"), demoDir], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }
  });
  if (seeded.status !== 0) {
    console.error("Seeding demo data failed.");
    process.exit(seeded.status || 1);
  }
}

const env = { ...process.env, WORKTIMER_USER_DATA: demoDir };
delete env.ELECTRON_RUN_AS_NODE;
const app = spawn(electron, ["."], { cwd: root, stdio: "inherit", env });
app.on("exit", (code) => process.exit(code ?? 0));
