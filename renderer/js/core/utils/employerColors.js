import { UNKNOWN_EMPLOYER } from "../../../../shared/constants/storageKeys.js";

export const EMPLOYER_COLOR_PALETTE = [
  "#f3e8ff",
  "#fce7f3",
  "#dbeafe",
  "#d1fae5",
  "#fef3c7",
  "#ffedd5",
  "#e0e7ff",
  "#ccfbf1",
  "#fde2e4",
  "#e9d5ff"
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
    if (!employer.color) {
      employer.color = getEmployerColorByIndex(index);
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
  }

  const name = employerName || UNKNOWN_EMPLOYER;
  const byName = activeEmployers.find((employer) => employer.name === name);
  if (byName?.color) {
    return byName.color;
  }

  return getColorForOrphanName(name);
}
