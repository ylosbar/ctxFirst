const DAY_NAMES = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
] as const;

const MONTH_NAMES = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

const formatTime = (hour: number, minute: number): string => {
  if (minute === 0) return `${hour}h`;
  return `${hour}h${String(minute).padStart(2, "0")}`;
};

const formatDayOfMonth = (n: number): string =>
  n === 1 ? "le 1er" : `le ${n}`;

/**
 * Convert a 5-field cron expression to a French natural-language phrase.
 * Returns `null` for expressions outside the supported subset (handled
 * patterns mirror the presets exposed in `cron-presets.ts`).
 */
export const humanizeCron = (cron: string): string | null => {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [m, h, dom, mon, dow] = parts;

  const stepMinutes = m.match(/^\*\/(\d+)$/);
  if (stepMinutes && h === "*" && dom === "*" && mon === "*" && dow === "*") {
    const n = Number(stepMinutes[1]);
    if (Number.isFinite(n) && n > 0) {
      return n === 1 ? "chaque minute" : `toutes les ${n} minutes`;
    }
  }

  const stepHours = h.match(/^\*\/(\d+)$/);
  if (m === "0" && stepHours && dom === "*" && mon === "*" && dow === "*") {
    const n = Number(stepHours[1]);
    if (Number.isFinite(n) && n > 0) {
      return n === 1 ? "toutes les heures" : `toutes les ${n} heures`;
    }
  }

  if (
    m === "0" &&
    h === "*" &&
    dom === "*" &&
    mon === "*" &&
    dow === "*"
  ) {
    return "toutes les heures";
  }

  const minute = Number(m);
  const hour = Number(h);
  const minuteOk = Number.isInteger(minute) && minute >= 0 && minute < 60;
  const hourOk = Number.isInteger(hour) && hour >= 0 && hour < 24;

  if (minuteOk && hourOk && dom === "*" && mon === "*" && dow === "*") {
    return `tous les jours à ${formatTime(hour, minute)}`;
  }

  if (minuteOk && hourOk && dom === "*" && mon === "*" && /^[0-7]$/.test(dow)) {
    const dayIndex = Number(dow) % 7;
    const dayName = DAY_NAMES[dayIndex];
    return `tous les ${dayName}s à ${formatTime(hour, minute)}`;
  }

  if (
    minuteOk &&
    hourOk &&
    /^\d{1,2}$/.test(dom) &&
    mon === "*" &&
    dow === "*"
  ) {
    const n = Number(dom);
    if (n >= 1 && n <= 31) {
      return `${formatDayOfMonth(n)} de chaque mois à ${formatTime(hour, minute)}`;
    }
  }

  if (
    minuteOk &&
    hourOk &&
    /^\d{1,2}$/.test(dom) &&
    /^\d{1,2}$/.test(mon) &&
    dow === "*"
  ) {
    const dayN = Number(dom);
    const monN = Number(mon);
    if (dayN >= 1 && dayN <= 31 && monN >= 1 && monN <= 12) {
      const monthName = MONTH_NAMES[monN - 1];
      return `chaque année le ${dayN} ${monthName} à ${formatTime(hour, minute)}`;
    }
  }

  return null;
};
