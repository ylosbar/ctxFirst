import { Button } from "@/components/ui/button";
import { LOCALES, LOCALE_LABEL, type Locale } from "@/ui/i18n/locales";

type LocaleSelectProps = {
  locale: Locale;
  onSelect: (locale: Locale) => void;
};

const LocaleSelect = ({ locale, onSelect }: LocaleSelectProps) => (
  <div className="inline-flex rounded-md border border-border p-0.5">
    {LOCALES.map((l) => {
      const isActive = l === locale;
      return (
        <Button
          key={l}
          size="xs"
          variant={isActive ? "default" : "ghost"}
          onClick={() => onSelect(l)}
          aria-pressed={isActive}
        >
          {LOCALE_LABEL[l]}
        </Button>
      );
    })}
  </div>
);

export default LocaleSelect;
