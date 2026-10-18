import { getEmployerColorByIndex } from "../utils/employerColors.js";
import { normalizeRateChanges } from "../utils/employerRates.js";

export class Employer {
  constructor({ id, name, createdAt, color = null, hourlyRate = null, rateChanges = [] }) {
    this.id = id;
    this.name = name;
    this.createdAt = createdAt;
    this.color = color;
    // Base rate; raises in rateChanges ({ rate, from: "YYYY-MM-DD" }) apply from their date on.
    this.hourlyRate = hourlyRate;
    this.rateChanges = normalizeRateChanges(rateChanges);
  }

  static create(name, idFactory, colorIndex = 0) {
    return new Employer({
      id: idFactory(),
      name: name.trim(),
      createdAt: new Date().toISOString(),
      color: getEmployerColorByIndex(colorIndex),
      hourlyRate: null
    });
  }
}
