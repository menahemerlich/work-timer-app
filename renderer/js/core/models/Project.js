export const BILLING_TYPES = {
  HOURLY: "hourly",
  FIXED: "fixed",
  UNIT: "unit"
};

export const DEFAULT_UNIT_NAME = "יחידות";
export const DEFAULT_UNIT_SINGULAR = "יחידה";

function normalizeBillingType(value) {
  return Object.values(BILLING_TYPES).includes(value) ? value : BILLING_TYPES.HOURLY;
}

export class Project {
  constructor({
    id,
    employerId,
    name,
    billingType = BILLING_TYPES.HOURLY,
    fixedPrice = null,
    unitPrice = null,
    unitName = null,
    unitSingular = null,
    createdAt,
    deletedAt = null
  }) {
    this.id = id;
    this.employerId = employerId;
    this.name = name;
    this.billingType = normalizeBillingType(billingType);
    this.fixedPrice = fixedPrice ?? null;
    this.unitPrice = unitPrice ?? null;
    this.unitName = unitName || null;
    this.unitSingular = unitSingular || null;
    this.createdAt = createdAt;
    this.deletedAt = deletedAt || null;
  }

  get isFixed() {
    return this.billingType === BILLING_TYPES.FIXED;
  }

  get isUnit() {
    return this.billingType === BILLING_TYPES.UNIT;
  }

  /** Time on this project is not paid by the employer's hourly rate. */
  get isNonHourly() {
    return this.isFixed || this.isUnit;
  }

  get displayUnitName() {
    return this.unitName || DEFAULT_UNIT_NAME;
  }

  get displayUnitSingular() {
    return this.unitSingular || DEFAULT_UNIT_SINGULAR;
  }

  static create(
    {
      employerId,
      name,
      billingType = BILLING_TYPES.HOURLY,
      fixedPrice = null,
      unitPrice = null,
      unitName = null,
      unitSingular = null
    },
    idFactory
  ) {
    const type = normalizeBillingType(billingType);
    return new Project({
      id: idFactory(),
      employerId,
      name: name.trim(),
      billingType: type,
      fixedPrice: type === BILLING_TYPES.FIXED ? fixedPrice : null,
      unitPrice: type === BILLING_TYPES.UNIT ? unitPrice : null,
      unitName: type === BILLING_TYPES.UNIT ? (unitName || "").trim() || null : null,
      unitSingular: type === BILLING_TYPES.UNIT ? (unitSingular || "").trim() || null : null,
      createdAt: new Date().toISOString()
    });
  }

  toJSON() {
    return {
      id: this.id,
      employerId: this.employerId,
      name: this.name,
      billingType: this.billingType,
      fixedPrice: this.fixedPrice,
      unitPrice: this.unitPrice,
      unitName: this.unitName,
      unitSingular: this.unitSingular,
      createdAt: this.createdAt
    };
  }
}
