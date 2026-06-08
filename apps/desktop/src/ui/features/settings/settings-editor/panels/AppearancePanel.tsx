import { useT } from "@/ui/i18n";
import {
  DENSITIES,
  useDensity,
  useFpsCounter,
  useLocale,
  usePanelShadows,
  useSetDensity,
  useSetFpsCounter,
  useSetLocale,
  useSetPanelShadows,
} from "@/ui/stores/appearance-store";
import SettingRow from "../components/SettingRow";
import LocaleSelect from "../components/LocaleSelect";
import DensitySlider from "../components/DensitySlider";
import OnOffToggle from "../components/OnOffToggle";

const AppearancePanel = () => {
  const t = useT();
  const density = useDensity();
  const setDensity = useSetDensity();
  const locale = useLocale();
  const setLocale = useSetLocale();
  const panelShadows = usePanelShadows();
  const setPanelShadows = useSetPanelShadows();
  const fpsCounter = useFpsCounter();
  const setFpsCounter = useSetFpsCounter();

  return (
    <section className="flex flex-col gap-4">
      <SettingRow
        title={t("settings.appearance.language.title")}
        description={
          <span>{t("settings.appearance.language.description")}</span>
        }
      >
        <LocaleSelect locale={locale} onSelect={setLocale} />
      </SettingRow>
      <SettingRow
        title={t("settings.appearance.textSize.title")}
        description={
          <span>{t("settings.appearance.textSize.description")}</span>
        }
      >
        <div className="w-72">
          <DensitySlider
            density={density}
            densities={DENSITIES}
            onSelect={setDensity}
          />
        </div>
      </SettingRow>
      <SettingRow
        title={t("settings.appearance.panelShadows.title")}
        description={
          <span>{t("settings.appearance.panelShadows.description")}</span>
        }
      >
        <OnOffToggle
          value={panelShadows}
          onChange={setPanelShadows}
          onLabel={t("common.enabled")}
          offLabel={t("common.disabled")}
        />
      </SettingRow>
      <SettingRow
        title={t("settings.appearance.fpsCounter.title")}
        description={
          <span>{t("settings.appearance.fpsCounter.description")}</span>
        }
      >
        <OnOffToggle
          value={fpsCounter}
          onChange={setFpsCounter}
          onLabel={t("common.enabled")}
          offLabel={t("common.disabled")}
        />
      </SettingRow>
    </section>
  );
};

export default AppearancePanel;
