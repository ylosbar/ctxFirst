import i18n from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import fr from "./messages/fr.json";
import en from "./messages/en.json";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./locales";

const APPEARANCE_STORAGE_KEY = "ui.appearance";

const readPersistedLocale = (): Locale => {
  try {
    if (typeof window === "undefined") return DEFAULT_LOCALE;
    const blob = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (!blob) return DEFAULT_LOCALE;
    const parsed = JSON.parse(blob) as { state?: { locale?: unknown } };
    const lng = parsed?.state?.locale;
    return isLocale(lng) ? lng : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
};

const initialLocale = readPersistedLocale();

void i18n.use(initReactI18next).init({
  resources: {
    fr: { app: fr },
    en: { app: en },
  },
  lng: initialLocale,
  fallbackLng: "fr",
  defaultNS: "app",
  interpolation: { escapeValue: false },
  returnNull: false,
  returnEmptyString: false,
  saveMissing: import.meta.env.DEV,
  missingKeyHandler: import.meta.env.DEV
    ? (lngs, ns, key) =>
        console.warn(`[i18n] missing: ${lngs.join(",")}/${ns}/${key}`)
    : undefined,
});

export { i18n };
export type { Locale };

export const useT = () => {
  const { t } = useTranslation("app");
  return t;
};
