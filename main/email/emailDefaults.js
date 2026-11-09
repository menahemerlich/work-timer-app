// Default settings for every email notification. Texts use {placeholders} that are filled in
// when the email is built (see renderer/js/core/services/EmailTemplates.js).

const NOTIFICATION_DEFAULTS = {
  unpaidReminder: {
    enabled: false,
    recipients: { me: true, client: false, extra: "" },
    daysAfterMonthEnd: 5,
    lookbackMonths: 1,
    subject: "תזכורת: {לקוח} עדיין לא שילם על {חודש}",
    body:
      "שלום,\n\n" +
      "זו תזכורת שהתשלום של {לקוח} עבור חודש {חודש} עדיין לא סומן כשולם.\n\n" +
      "שעות: {שעות}\n" +
      "ימי עבודה: {ימים}\n" +
      "סכום לתשלום: {סכום}\n\n" +
      "{שם}"
  },
  unpaidRepeat: {
    enabled: false,
    recipients: { me: true, client: false, extra: "" },
    everyDays: 7,
    subject: "תזכורת חוזרת: התשלום של {לקוח} על {חודש} עדיין פתוח",
    body:
      "שלום,\n\n" +
      "התשלום של {לקוח} עבור חודש {חודש} עדיין לא התקבל.\n" +
      "סכום לתשלום: {סכום} ({שעות}).\n\n" +
      "{שם}"
  },
  paymentRequest: {
    enabled: true,
    recipients: { me: false, client: true, extra: "" },
    subject: "בקשת תשלום עבור {חודש}",
    body:
      "שלום {לקוח},\n\n" +
      "מצורף פירוט העבודה לחודש {חודש}:\n" +
      "ימי עבודה: {ימים}\n" +
      "שעות: {שעות}\n" +
      "סכום לתשלום: {סכום}\n\n" +
      "אשמח להסדרת התשלום בהקדם.\n\n" +
      "תודה,\n{שם}"
  },
  monthlySummary: {
    enabled: false,
    recipients: { me: true, extra: "" },
    sendDay: 1
  },
  clientSummary: {
    enabled: false,
    recipients: { me: false, client: true, extra: "" },
    sendDay: 1
  },
  goalBehind: {
    enabled: false,
    recipients: { me: true, extra: "" },
    checkDay: 15,
    thresholdPercent: 80,
    subject: "היעד החודשי של {חודש}: את/ה ב-{אחוז}",
    body:
      "היי,\n\n" +
      "עד היום עבדת {בפועל} מתוך {צפוי} שהיו צפויים עד עכשיו ({אחוז}).\n" +
      "יש עוד זמן להשלים — בהצלחה!\n\n" +
      "{שם}"
  },
  goalReached: {
    enabled: false,
    recipients: { me: true, extra: "" },
    subject: "🎉 הגעת ליעד החודשי של {חודש}!",
    body:
      "כל הכבוד!\n\n" +
      "עבדת {בפועל} החודש — עברת את היעד החודשי של {צפוי}.\n\n" +
      "{שם}"
  },
  backup: {
    enabled: false,
    recipients: { me: true, extra: "" },
    frequency: "weekly",
    subject: "גיבוי טיימר שעות עבודה — {תאריך}",
    body:
      "מצורף קובץ גיבוי של כל הנתונים מתאריך {תאריך}.\n" +
      "לשחזור: דוחות ← 📥 שחזור ← בחירת הקובץ.\n\n" +
      "{שם}"
  },
  syncProblem: {
    enabled: false,
    recipients: { me: true, extra: "" },
    pendingThreshold: 20,
    subject: "בעיה בסנכרון לענן",
    body:
      "שים/י לב — הסנכרון של טיימר שעות עבודה לענן לא תקין.\n\n" +
      "מצב: {מצב}\n" +
      "פריטים שממתינים לסנכרון: {ממתינים}\n" +
      "שגיאה אחרונה: {שגיאה}\n\n" +
      "הנתונים שמורים במחשב ולא אבדו.\n\n" +
      "{שם}"
  }
};

function defaultConfig() {
  return {
    account: { address: "", fromName: "", passwordEnc: "" },
    myEmail: "",
    clientEmails: {},
    notifications: JSON.parse(JSON.stringify(NOTIFICATION_DEFAULTS)),
    sentLog: {},
    history: []
  };
}

module.exports = { NOTIFICATION_DEFAULTS, defaultConfig };
