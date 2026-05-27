import { UNKNOWN_EMPLOYER } from "../../../../shared/constants/storageKeys.js";

export const EMPLOYER_COLOR_PALETTE = [
  "#ddd6fe",
  "#bbf7d0",
  "#bae6fd",
  "#fde68a",
  "#fda4af",
  "#a7f3d0",
  "#93c5fd",
  "#fcd34d",
  "#f9a8d4",
  "#5eead4"
];

export function getEmployerColorByIndex(index) {
  return EMPLOYER_COLOR_PALETTE[Math.abs(index) % EMPLOYER_COLOR_PALETTE.length];
}

export function getColorForOrphanName(name) {
  const key = name || UNKNOWN_EMPLOYER;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash + key.charCodeAt(i)) % EMPLOYER_COLOR_PALETTE.length;
  }
  return EMPLOYER_COLOR_PALETTE[hash];
}

export function assignMissingEmployerColors(employers) {
  let changed = false;
  employers.forEach((employer, index) => {
    const nextColor = getEmployerColorByIndex(index);
    if (employer.color !== nextColor) {
      employer.color = nextColor;
      changed = true;
    }
  });
  return { employers, changed };
}

export function resolveEmployerColor({ employerId, employerName }, activeEmployers) {
  if (employerId) {
    const byId = activeEmployers.find((employer) => employer.id === employerId);
    if (byId?.color) {
      return byId.color;
    }
    return null;
  }

  const name = employerName || UNKNOWN_EMPLOYER;
  const byName = activeEmployers.find((employer) => employer.name === name);
  if (byName?.color) {
    return byName.color;
  }

  return null;
}
