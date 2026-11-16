// Fills a separate data folder with demo data. Runs inside Electron as Node
// (ELECTRON_RUN_AS_NODE=1) because better-sqlite3 is built for Electron.
// Usage: electron scripts/seed-demo.js <userDataFolder>
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createLocalDatabase } = require("../main/db/LocalDatabaseService");

const target = process.argv[2];
if (!target) {
  console.error("Usage: seed-demo.js <userDataFolder>");
  process.exit(1);
}
fs.mkdirSync(target, { recursive: true });

// Small deterministic random so every demo run looks the same.
let seed = 20261116;
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const pick = (list) => list[Math.floor(rand() * list.length)];
const id = () => crypto.randomUUID();
const pad = (n) => String(n).padStart(2, "0");
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const heDate = (d) => d.toLocaleDateString("he-IL");
const heTime = (d) => d.toLocaleTimeString("he-IL", { hour12: false });
function formatDuration(ms) {
  const total = Math.floor(ms / 1000);
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

const db = createLocalDatabase(target);
const opts = { enqueue: false };

const today = new Date();
today.setHours(0, 0, 0, 0);
const start = new Date(today.getFullYear(), today.getMonth() - 4, 1);
const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);

const employers = [
  {
    id: id(),
    name: "סטודיו אורן",
    color: "#a78bfa",
    hourlyRate: 120,
    rateChanges: [{ rate: 135, from: isoDay(lastMonthStart) }],
    createdAt: start.toISOString()
  },
  {
    id: id(),
    name: "משרד כהן ושות׳",
    color: "#f9a8d4",
    hourlyRate: 95,
    rateChanges: [],
    createdAt: start.toISOString()
  },
  {
    id: id(),
    name: "עמותת אור לנוער",
    color: "#6ee7b7",
    hourlyRate: 80,
    rateChanges: [],
    createdAt: start.toISOString()
  }
];
employers.forEach((employer) => db.upsertEmployer(employer, opts));
const [oren, cohen, or] = employers;

const projects = [
  {
    id: id(),
    employerId: oren.id,
    name: "אתר תדמית",
    billingType: "fixed",
    fixedPrice: 4500,
    createdAt: thisMonthStart.toISOString()
  },
  {
    id: id(),
    employerId: oren.id,
    name: "תחזוקה שוטפת",
    billingType: "hourly",
    createdAt: start.toISOString()
  },
  {
    id: id(),
    employerId: cohen.id,
    name: "הקלדת תיקים",
    billingType: "unit",
    unitPrice: 35,
    unitName: "תיקים",
    unitSingular: "תיק",
    createdAt: start.toISOString()
  },
  {
    id: id(),
    employerId: or.id,
    name: "הדרכות",
    billingType: "hourly",
    createdAt: start.toISOString()
  }
];
projects.forEach((project) => db.upsertProject(project, opts));
const projectsByEmployer = new Map(
  employers.map((employer) => [employer.id, projects.filter((p) => p.employerId === employer.id)])
);

const notes = ["", "", "", "פגישה עם הלקוח", "תיקוני באגים", "עבודה מהבית", "סידור מסמכים", "שיחת טלפון ארוכה"];
let logCount = 0;
for (let day = new Date(start); day <= today; day.setDate(day.getDate() + 1)) {
  const weekday = day.getDay();
  if (weekday === 5 || weekday === 6) {
    continue; // Friday / Saturday off
  }
  if (rand() < 0.12) {
    continue; // an occasional day off
  }

  let clock = 8 * 60 + Math.floor(rand() * 90); // minutes from midnight
  const sessions = 1 + Math.floor(rand() * 3);
  for (let s = 0; s < sessions; s += 1) {
    const employer = pick(employers);
    const project = rand() < 0.75 ? pick(projectsByEmployer.get(employer.id)) : null;
    const minutes = 45 + Math.floor(rand() * 200);
    const begin = new Date(day);
    begin.setMinutes(clock);
    const end = new Date(begin.getTime() + minutes * 60 * 1000);
    if (day.getTime() === today.getTime() && end > new Date()) {
      break; // no logs in the future
    }
    const durationMs = minutes * 60 * 1000;
    const isUnit = project?.billingType === "unit";

    db.upsertLog(
      {
        id: id(),
        date: heDate(begin),
        start: heTime(begin),
        end: heTime(end),
        durationMs,
        durationStr: formatDuration(durationMs),
        employerId: employer.id,
        employerName: employer.name,
        projectId: project?.id || null,
        projectName: project?.name || null,
        unitCount: isUnit ? 2 + Math.floor(rand() * 8) : null,
        unitOpen: false,
        note: pick(notes)
      },
      opts
    );
    logCount += 1;
    clock += minutes + 20 + Math.floor(rand() * 60);
  }
}

const inDays = (n) => {
  const d = new Date(today);
  d.setDate(d.getDate() + n);
  return isoDay(d);
};
[
  { employerId: oren.id, title: "לשלוח סקיצות לדף הבית", priority: "high", dueDate: inDays(1) },
  { employerId: oren.id, title: "לעדכן תמונות בגלריה", priority: "medium", dueDate: inDays(5) },
  { employerId: oren.id, title: "גיבוי אתר חודשי", priority: "low", dueDate: inDays(-2), status: "done" },
  { employerId: cohen.id, title: "להקליד את תיקי נובמבר", priority: "high", dueDate: inDays(3) },
  { employerId: cohen.id, title: "לסדר את הארכיון", priority: "low", dueDate: null },
  { employerId: or.id, title: "להכין מערך הדרכה לחנוכה", priority: "medium", dueDate: inDays(10) }
].forEach((task) => db.upsertTask({ id: id(), notes: "", status: "todo", ...task }, opts));

const monthKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}`;
const twoMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 2, 1);
db.saveSettings(
  {
    lastSelectedEmployerId: oren.id,
    monthlyTargetHoursPerDay: 6,
    monthlyTargetDays: 20,
    earningsWindowCorner: "top-left",
    paidMonths: {
      [monthKey(twoMonthsAgo)]: employers.map((e) => e.name),
      [monthKey(lastMonthStart)]: [oren.name]
    }
  },
  opts
);

db.close();
console.log(`Demo data ready in ${target}: ${employers.length} employers, ${projects.length} projects, ${logCount} logs.`);
