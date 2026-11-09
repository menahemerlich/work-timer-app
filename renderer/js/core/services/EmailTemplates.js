// Building email content: filling {placeholders} in the editable texts and the HTML of the
// summary emails (which are generated, not editable).

/** Notification types shown in settings, in display order. */
export const EMAIL_NOTIFICATIONS = [
  {
    id: "unpaidReminder",
    icon: "💰",
    title: "תזכורת על מעסיק שלא שילם",
    description: "נשלח פעם אחת לכל מעסיק, כמה ימים אחרי סוף החודש, אם הוא עדיין לא סומן «שולם».",
    clientOption: true,
    editable: true,
    placeholders: ["לקוח", "חודש", "שעות", "ימים", "סכום", "שם"],
    params: [
      { key: "daysAfterMonthEnd", label: "ימים אחרי סוף החודש", min: 0, max: 60 },
      { key: "lookbackMonths", label: "כמה חודשים אחורה לבדוק", min: 1, max: 12 }
    ]
  },
  {
    id: "unpaidRepeat",
    icon: "🔁",
    title: "תזכורת חוזרת על תשלום פתוח",
    description: "ממשיך להזכיר כל כמה ימים, כל עוד המעסיק לא סומן «שולם». החודשים והימים נקבעים לפי התזכורת הראשונה.",
    clientOption: true,
    editable: true,
    placeholders: ["לקוח", "חודש", "שעות", "ימים", "סכום", "שם"],
    params: [{ key: "everyDays", label: "כל כמה ימים", min: 1, max: 60 }]
  },
  {
    id: "paymentRequest",
    icon: "💸",
    title: "בקשת תשלום ללקוח (ידני)",
    description: "כשפעיל — בסיכום החודשי מופיע ליד כל מעסיק שלא שילם כפתור 💸. הלחיצה פותחת חלונית שבה אפשר לערוך את הנוסח לפני השליחה.",
    clientOption: true,
    editable: true,
    manual: true,
    placeholders: ["לקוח", "חודש", "שעות", "ימים", "סכום", "שם"],
    params: []
  },
  {
    id: "monthlySummary",
    icon: "📊",
    title: "סיכום חודשי כללי",
    description: "טבלת שעות ושכר לפי מעסיק, ומי שילם ומי לא. כשפעיל — נשלח אוטומטית על החודש הקודם. אפשר תמיד לשלוח ידנית בכפתור 📧 בסיכום החודשי.",
    clientOption: false,
    editable: false,
    params: [{ key: "sendDay", label: "באיזה יום בחודש לשלוח", min: 1, max: 28 }]
  },
  {
    id: "clientSummary",
    icon: "📄",
    title: "דוח שעות חודשי ללקוח",
    description: "פירוט הדיווחים של לקוח אחד (תאריך, שעות, הערה) וסכום. כשפעיל — נשלח אוטומטית לכל לקוח על החודש הקודם. אפשר תמיד לשלוח ידנית בכפתור 📄 בסיכום החודשי.",
    clientOption: true,
    editable: false,
    params: [{ key: "sendDay", label: "באיזה יום בחודש לשלוח", min: 1, max: 28 }]
  },
  {
    id: "goalBehind",
    icon: "📉",
    title: "פיגור ביעד החודשי",
    description: "נשלח פעם בחודש, מהיום שנבחר, אם עבדת פחות מהאחוז שנקבע מהשעות שהיו צפויות עד אותו יום.",
    clientOption: false,
    editable: true,
    placeholders: ["חודש", "אחוז", "בפועל", "צפוי", "שם"],
    params: [
      { key: "checkDay", label: "מאיזה יום בחודש לבדוק", min: 1, max: 28 },
      { key: "thresholdPercent", label: "להתריע מתחת ל-% ", min: 1, max: 100 }
    ]
  },
  {
    id: "goalReached",
    icon: "🎉",
    title: "הגעה ליעד החודשי",
    description: "נשלח פעם בחודש, כשסך השעות עובר את היעד של החודש כולו.",
    clientOption: false,
    editable: true,
    placeholders: ["חודש", "בפועל", "צפוי", "שם"],
    params: []
  },
  {
    id: "backup",
    icon: "💾",
    title: "גיבוי אוטומטי במייל",
    description: "קובץ גיבוי מלא (JSON) מצורף למייל. אפשר לשחזר ממנו בדוחות ← 📥 שחזור.",
    clientOption: false,
    editable: true,
    placeholders: ["תאריך", "שם"],
    params: [
      {
        key: "frequency",
        label: "תדירות",
        type: "select",
        options: [
          { value: "weekly", label: "פעם בשבוע" },
          { value: "monthly", label: "פעם בחודש" }
        ]
      }
    ]
  },
  {
    id: "syncProblem",
    icon: "☁️",
    title: "בעיית סנכרון לענן",
    description: "נשלח לכל היותר פעם ביום, אם הסנכרון נכשל או שהצטברו יותר מדי פריטים שממתינים לסנכרון.",
    clientOption: false,
    editable: true,
    placeholders: ["מצב", "ממתינים", "שגיאה", "שם"],
    params: [{ key: "pendingThreshold", label: "להתריע מעל כמה ממתינים", min: 1, max: 1000 }]
  }
];

export function fillTemplate(text, vars) {
  return String(text || "").replace(/\{([^{}]+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name] ?? "") : match
  );
}

export function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const WRAP_STYLE =
  "direction:rtl;text-align:right;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#333;line-height:1.6";

export function textToHtml(text) {
  return `<div dir="rtl" style="${WRAP_STYLE}">${escapeHtml(text).replace(/\n/g, "<br>")}</div>`;
}

export function todayLabel(date = new Date()) {
  return `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`;
}

/** Placeholder values for one employer's month row. */
export function rowVars(report, row, senderName) {
  return {
    לקוח: row.employerName,
    חודש: report.monthLabel,
    שעות: `${row.hoursStr} שעות`,
    ימים: row.workDays,
    סכום: row.amountStr,
    שם: senderName,
    תאריך: todayLabel()
  };
}

const TH = "padding:8px 10px;background:#ede9fe;color:#4c1d95;border:1px solid #ddd6fe;text-align:right";
const TD = "padding:8px 10px;border:1px solid #ede9fe;text-align:right";

/** General monthly summary: one row per employer. */
export function buildMonthlySummaryEmail(report, senderName) {
  const paidCount = report.rows.filter((row) => row.paid).length;
  const unpaidTotal = report.rows.filter((row) => !row.paid).reduce((sum, row) => sum + row.amount, 0);
  const money = (n) =>
    `₪${Number(n || 0).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const rowsHtml = report.rows
    .map(
      (row) => `<tr>
        <td style="${TD}">${escapeHtml(row.employerName)}</td>
        <td style="${TD}">${row.workDays}</td>
        <td style="${TD}">${row.hoursStr}</td>
        <td style="${TD}">${row.amountStr}</td>
        <td style="${TD};color:${row.paid ? "#047857" : "#b45309"};font-weight:bold">${row.paid ? "✓ שולם" : "לא שולם"}</td>
      </tr>`
    )
    .join("");

  const html = `<div dir="rtl" style="${WRAP_STYLE}">
    <h2 style="color:#6d28d9;margin:0 0 12px">📊 סיכום חודש ${escapeHtml(report.monthLabel)}</h2>
    <table style="border-collapse:collapse;width:100%;max-width:640px">
      <thead><tr>
        <th style="${TH}">מעסיק</th><th style="${TH}">ימי עבודה</th><th style="${TH}">שעות</th>
        <th style="${TH}">סכום</th><th style="${TH}">תשלום</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot><tr>
        <td style="${TD};font-weight:bold">סה"כ</td>
        <td style="${TD};font-weight:bold">${report.workDays}</td>
        <td style="${TD};font-weight:bold">${report.totalHoursStr}</td>
        <td style="${TD};font-weight:bold">${report.totalAmountStr}</td>
        <td style="${TD};font-weight:bold">${paidCount}/${report.rows.length} שולמו</td>
      </tr></tfoot>
    </table>
    <p style="margin-top:14px">ממתין לתשלום: <strong>${money(unpaidTotal)}</strong></p>
    <p style="color:#888;font-size:12px">${escapeHtml(senderName)}</p>
  </div>`;

  const text = [
    `סיכום חודש ${report.monthLabel}`,
    "",
    ...report.rows.map(
      (row) =>
        `${row.employerName}: ${row.workDays} ימים, ${row.hoursStr} שעות, ${row.amountStr} — ${row.paid ? "שולם" : "לא שולם"}`
    ),
    "",
    `סה"כ: ${report.totalHoursStr} שעות, ${report.totalAmountStr} (${paidCount}/${report.rows.length} שולמו)`,
    `ממתין לתשלום: ${money(unpaidTotal)}`
  ].join("\n");

  return { subject: `סיכום חודש ${report.monthLabel}`, html, text };
}

/** Hours report for one client: every log of the month. */
export function buildClientSummaryEmail(report, row, senderName) {
  const logsHtml = row.logs
    .map(
      (log) => `<tr>
        <td style="${TD}">${escapeHtml(log.date)}</td>
        <td style="${TD}">${escapeHtml(log.start)}–${escapeHtml(log.end)}</td>
        <td style="${TD}">${escapeHtml(log.durationStr)}</td>
        <td style="${TD}">${escapeHtml(log.projectName || "")}</td>
        <td style="${TD}">${escapeHtml(log.note || "")}</td>
      </tr>`
    )
    .join("");
  const fixedHtml = row.fixedProjects.length
    ? `<p>פרויקטים במחיר קבוע: ${row.fixedProjects
        .map((project) => `${escapeHtml(project.name)} (₪${Number(project.fixedPrice).toLocaleString("he-IL")})`)
        .join(", ")}</p>`
    : "";

  const html = `<div dir="rtl" style="${WRAP_STYLE}">
    <h2 style="color:#6d28d9;margin:0 0 4px">📄 דוח שעות — ${escapeHtml(row.employerName)}</h2>
    <div style="color:#666;margin-bottom:12px">חודש ${escapeHtml(report.monthLabel)}</div>
    <table style="border-collapse:collapse;width:100%;max-width:640px">
      <thead><tr>
        <th style="${TH}">תאריך</th><th style="${TH}">שעות</th><th style="${TH}">משך</th>
        <th style="${TH}">פרויקט</th><th style="${TH}">הערה</th>
      </tr></thead>
      <tbody>${logsHtml}</tbody>
    </table>
    ${fixedHtml}
    <p style="margin-top:14px">
      ימי עבודה: <strong>${row.workDays}</strong> ·
      סה"כ שעות: <strong>${row.hoursStr}</strong> ·
      סכום: <strong>${row.amountStr}</strong>
    </p>
    <p>${escapeHtml(senderName)}</p>
  </div>`;

  const text = [
    `דוח שעות — ${row.employerName} — ${report.monthLabel}`,
    "",
    ...row.logs.map(
      (log) => `${log.date}  ${log.start}–${log.end}  ${log.durationStr}${log.note ? `  ${log.note}` : ""}`
    ),
    "",
    `ימי עבודה: ${row.workDays} · שעות: ${row.hoursStr} · סכום: ${row.amountStr}`,
    "",
    senderName
  ].join("\n");

  return { subject: `דוח שעות ${report.monthLabel} — ${row.employerName}`, html, text };
}

/** Splits "a@b.com, c@d.com" into a clean list. */
export function parseAddressList(text) {
  return String(text || "")
    .split(/[,;\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.includes("@"));
}

/**
 * Who gets a notification: "me", the client (by employer id) and extra addresses.
 * Returns { to, missingClient } — missingClient is true when the client was selected
 * but has no email address set.
 */
export function resolveRecipients(config, recipients = {}, employerId = null) {
  const to = new Set();
  let missingClient = false;
  if (recipients.me) {
    const mine = config.myEmail || config.account?.address;
    if (mine) {
      to.add(mine);
    }
  }
  if (recipients.client) {
    const clientEmail = employerId ? config.clientEmails?.[employerId] : null;
    if (clientEmail) {
      to.add(clientEmail);
    } else {
      missingClient = true;
    }
  }
  parseAddressList(recipients.extra).forEach((address) => to.add(address));
  return { to: [...to], missingClient };
}
