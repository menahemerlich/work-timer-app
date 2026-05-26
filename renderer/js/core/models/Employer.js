import { getEmployerColorByIndex } from "../utils/employerColors.js";

export class Employer {
  constructor({ id, name, createdAt, color = null }) {
    this.id = id;
    this.name = name;
    this.createdAt = createdAt;
    this.color = color;
  }

  static create(name, idFactory, colorIndex = 0) {
    return new Employer({
      id: idFactory(),
      name: name.trim(),
      createdAt: new Date().toISOString(),
      color: getEmployerColorByIndex(colorIndex)
    });
  }
}
