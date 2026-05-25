import { formatDuration } from "../utils/timeFormat.js";
import { parseTimeOnDate } from "../utils/dateParse.js";

export class LogValidationService {
  validateEdit({ date, start, end }) {
    if (!date || !start || !end) {
      return { valid: false, message: "יש למלא את כל השדות." };
    }

    const startDate = parseTimeOnDate(date, start);
    const endDate = parseTimeOnDate(date, end);

    if (!startDate || !endDate) {
      return { valid: false, message: "פורמט תאריך או שעה לא תקין." };
    }

    if (endDate <= startDate) {
      return { valid: false, message: "שעת הסיום חייבת להיות אחרי שעת ההתחלה." };
    }

    const durationMs = endDate - startDate;
    return {
      valid: true,
      durationMs,
      durationStr: formatDuration(durationMs)
    };
  }
}
