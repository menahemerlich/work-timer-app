export const FEMALE_MOTIVATION_BUCKETS = [
  {
    min: 0,
    max: 10,
    phrases: [
      "מתחילות בקטן – העיקר להתניע.",
      "כל שעה ראשונה היא ניצחון.",
      "היום את בונה מומנטום.",
      "התחלה רגועה, סיום גאה.",
      "את כבר בכיוון הנכון."
    ]
  },
  {
    min: 10,
    max: 30,
    phrases: [
      "יפה! יש תנועה – ממשיכות בקצב.",
      "צעד אחר צעד – את על המסלול.",
      "ההתקדמות כבר מורגשת.",
      "את מחממת מנועים כמו שצריך.",
      "עוד קצת וזה נהיה רציף."
    ]
  },
  {
    min: 30,
    max: 50,
    phrases: [
      "חצי הדרך מתקרבת – תני עוד דחיפה.",
      "קצב טוב – שומרת על עקביות.",
      "עוד קצת וזה נהיה קל יותר.",
      "את בונה בסיס חזק לחודש.",
      "את מתקדמת יציב, וזה מנצח."
    ]
  },
  {
    min: 50,
    max: 70,
    phrases: [
      "מעולה! את באזור החזק של החודש.",
      "עבודה יציבה – זה בדיוק זה.",
      "היעד כבר באופק.",
      "את נותנת הופעה – כל הכבוד.",
      "ככה נראית התמדה אמיתית."
    ]
  },
  {
    min: 70,
    max: 90,
    phrases: [
      "כמעט שם – סגירה יפה של החודש.",
      "נשאר פיניש קטן – ממשיכה חזק.",
      "עוד מאמץ קטן והיעד נסגר.",
      "את על גל – תני לו להמשיך.",
      "את בשלב הסגירה, אלופה."
    ]
  },
  {
    min: 90,
    max: 110,
    phrases: [
      "אלופה! היעד כמעט/כבר הושג.",
      "חודש של ביצועים – כל הכבוד.",
      "את סוגרת יעד כמו מקצוענית.",
      "עוד נגיעה קטנה וזה שלך.",
      "זה נראה ממש טוב עלייך."
    ]
  },
  {
    min: 110,
    max: 100000,
    phrases: [
      "מעבר ליעד – זה בונוס נטו.",
      "שברת שיא – כל הכבוד!",
      "החודש הזה שלך.",
      "את פשוט אש החודש.",
      "כשאת מחליטה – זה קורה."
    ]
  }
];

export function getMotivationBucketIndex(percent) {
  const p = Number(percent);
  const value = Number.isFinite(p) ? p : 0;
  const idx = FEMALE_MOTIVATION_BUCKETS.findIndex((b) => value >= b.min && value < b.max);
  return idx >= 0 ? idx : 0;
}

export function getMotivationPhrases(percent) {
  const idx = getMotivationBucketIndex(percent);
  return FEMALE_MOTIVATION_BUCKETS[idx]?.phrases || [];
}

export function pickMotivationPhrase({ percent, seed = "", index = null } = {}) {
  const phrases = getMotivationPhrases(percent);
  if (!phrases.length) {
    return "";
  }

  if (typeof index === "number" && Number.isFinite(index)) {
    return phrases[Math.abs(Math.floor(index)) % phrases.length];
  }

  // simple deterministic hash
  const bucket = FEMALE_MOTIVATION_BUCKETS[getMotivationBucketIndex(percent)];
  const key = `${seed}:${bucket.min}-${bucket.max}`;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return phrases[hash % phrases.length];
}

