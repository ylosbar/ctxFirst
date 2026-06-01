import { type ReactNode, useEffect } from "react";
import { I18nextProvider } from "react-i18next";
import { i18n } from "./index";
import { useAppearanceStore } from "../stores/appearance-store";

type Props = { children: ReactNode };

const I18nProvider = ({ children }: Props) => {
  const locale = useAppearanceStore((s) => s.locale);
  useEffect(() => {
    if (i18n.language !== locale) void i18n.changeLanguage(locale);
  }, [locale]);
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
};

export default I18nProvider;
