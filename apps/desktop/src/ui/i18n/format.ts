import { i18n } from "./index";

export const formatDate = (
  value: Date | string | number,
  opts?: Intl.DateTimeFormatOptions,
): string => new Date(value).toLocaleDateString(i18n.language, opts);

export const formatTime = (
  value: Date | string | number,
  opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" },
): string => new Date(value).toLocaleTimeString(i18n.language, opts);

export const formatNumber = (
  value: number,
  opts?: Intl.NumberFormatOptions,
): string => value.toLocaleString(i18n.language, opts);
