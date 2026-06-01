const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

const formatAbs = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Caller gates on `< WEEK`, so DAY bucket covers everything that reaches here.
const formatUnit = (diff: number): string => {
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h`;
  return `${Math.floor(diff / DAY)} j`;
};

/**
 * Short French relative time. For past dates returns "il y a Xm" / "à
 * l'instant". For future dates returns "dans Xm". Falls back to the
 * absolute local date string beyond ~1 week, where a relative phrasing
 * stops being useful.
 */
export const formatRelative = (iso: string, now: number): string => {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return iso;
  const diff = ts - now;
  const abs = Math.abs(diff);

  if (abs < MINUTE) return "à l'instant";
  if (abs >= WEEK) return formatAbs(iso);

  const unit = formatUnit(abs);
  return diff >= 0 ? `dans ${unit}` : `il y a ${unit}`;
};

export const formatAbsolute = (iso: string): string => formatAbs(iso);
