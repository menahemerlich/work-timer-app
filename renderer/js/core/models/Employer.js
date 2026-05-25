export class Employer {
  constructor({ id, name, createdAt }) {
    this.id = id;
    this.name = name;
    this.createdAt = createdAt;
  }

  static create(name, idFactory) {
    return new Employer({
      id: idFactory(),
      name: name.trim(),
      createdAt: new Date().toISOString()
    });
  }
}
