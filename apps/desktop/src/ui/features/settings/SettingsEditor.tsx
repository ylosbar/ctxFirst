import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useLocation, useNavigate } from "react-router";
import { Dialog } from "@base-ui/react/dialog";
import { Slider } from "@base-ui/react/slider";
import {
  Brain,
  Check,
  ChevronRight,
  Copy,
  Layers,
  Link2,
  Package,
  Palette,
  Play,
  Plug,
  Plus,
  Puzzle,
  Settings2,
  Star,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useActiveChannel } from "../../channels/ChannelProvider";
import CreateChannelDialog from "../../channels/CreateChannelDialog";
import ChannelIcon from "../../channels/ChannelIcon";
import type { ChannelView } from "../../../domain/workflow/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormLabel } from "@/components/ui/form-label";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { PasswordInput } from "@/components/ui/password-input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Section } from "@/components/ui/section";
import { useCollapsibleState } from "@/components/ui/use-collapsible-state";
import { Textarea } from "@/components/ui/textarea";
import {
  clearPersistedAppearance,
  DENSITIES,
  useDensity,
  useLocale,
  usePanelShadows,
  useSetDensity,
  useSetLocale,
  useSetPanelShadows,
  type DensityDescriptor,
  type DensityId,
} from "../../stores/appearance-store";
import { Trans } from "react-i18next";
import { i18n, useT } from "../../i18n";
import { LOCALES, LOCALE_LABEL, type Locale } from "../../i18n/locales";
import { useServices } from "../../di/services-provider";
import type {
  GitLabTokenStatus,
  LinearApiKeyStatus,
} from "../../../domain/settings/types";
import type {
  McpInvokeResult,
  McpServerStatus,
  McpToolInfo,
  McpToolParamInfo,
  OpenRouterStatus,
  OpenRouterTestResult,
} from "../../../application/ports/settings-gateway";
import type {
  PluginListEntry,
  PluginPermissionMeta,
} from "../../../domain/plugin/types";
import { rendererPluginRegistry } from "../../../plugins/plugin-registry";

type CoreCategoryId =
  | "appearance"
  | "channels"
  | "integrations"
  | "llm"
  | "mcp"
  | "plugins"
  | "general";
type CategoryId = CoreCategoryId | string;

type Category = {
  readonly id: CategoryId;
  readonly label: string;
  readonly icon: LucideIcon;
};

type CoreCategoryDef = {
  readonly id: CoreCategoryId;
  readonly labelKey: string;
  readonly icon: LucideIcon;
};

const CORE_CATEGORY_DEFS: readonly CoreCategoryDef[] = [
  { id: "appearance", labelKey: "settings.categories.appearance", icon: Palette },
  { id: "channels", labelKey: "settings.categories.channels", icon: Layers },
  { id: "integrations", labelKey: "settings.categories.integrations", icon: Link2 },
  { id: "llm", labelKey: "settings.categories.llm", icon: Brain },
  { id: "mcp", labelKey: "settings.categories.mcp", icon: Plug },
  { id: "plugins", labelKey: "settings.categories.plugins", icon: Puzzle },
  { id: "general", labelKey: "settings.categories.general", icon: Settings2 },
];

const DEFAULT_CATEGORY: CoreCategoryId = "appearance";
const SETTINGS_PREFIX = "/settings";

const usePluginSettingsTabs = () =>
  useSyncExternalStore(
    rendererPluginRegistry.subscribeSettingsTabs,
    rendererPluginRegistry.listSettingsTabs,
    rendererPluginRegistry.listSettingsTabs,
  );

const categoryFromPath = (pathname: string): string | null => {
  if (pathname === SETTINGS_PREFIX || pathname === `${SETTINGS_PREFIX}/`) {
    return null;
  }
  if (!pathname.startsWith(`${SETTINGS_PREFIX}/`)) return null;
  const rest = pathname.slice(`${SETTINGS_PREFIX}/`.length);
  const slash = rest.indexOf("/");
  const segment = slash === -1 ? rest : rest.slice(0, slash);
  return segment ? decodeURIComponent(segment) : null;
};

const SettingsEditor = () => {
  const t = useT();
  const location = useLocation();
  const navigate = useNavigate();
  const pluginTabs = usePluginSettingsTabs();

  const categories: readonly Category[] = useMemo(
    () => [
      ...CORE_CATEGORY_DEFS.map((c) => ({
        id: c.id,
        label: t(c.labelKey),
        icon: c.icon,
      })),
      ...pluginTabs.map((pt) => ({
        id: pt.id,
        label: pt.label,
        icon: pt.icon ?? Package,
      })),
    ],
    [t, pluginTabs],
  );

  const requestedCategory = categoryFromPath(location.pathname);
  const isValidCategory = useMemo(
    () =>
      requestedCategory != null &&
      categories.some((c) => c.id === requestedCategory),
    [requestedCategory, categories],
  );
  const activeCategoryId: CategoryId = isValidCategory
    ? (requestedCategory as CategoryId)
    : DEFAULT_CATEGORY;

  // Defensive rewrite: if the URL points to a category that doesn't exist
  // (yet — plugins boot asynchronously), wait one tick before falling back to
  // the default. This avoids stomping `/settings/openrouter` on startup when
  // the plugin tab will be registered shortly after mount.
  useEffect(() => {
    if (requestedCategory == null) return;
    if (isValidCategory) return;
    const handle = window.setTimeout(() => {
      navigate(`${SETTINGS_PREFIX}/${DEFAULT_CATEGORY}`, { replace: true });
    }, 50);
    return () => window.clearTimeout(handle);
  }, [requestedCategory, isValidCategory, navigate]);

  // First-mount canonicalization: `/settings` → `/settings/appearance`.
  // The settings editor is a singleton — its panel stays mounted in the dock
  // even after the user navigates to another activity, so this effect keeps
  // running with the *new* pathname. `categoryFromPath` returns null both for
  // the bare `/settings` root AND for any non-settings route, so only
  // canonicalize when we're actually on the settings root; otherwise we'd yank
  // the user back to `/settings` the moment they leave it.
  useEffect(() => {
    if (requestedCategory != null) return;
    const onSettingsRoot =
      location.pathname === SETTINGS_PREFIX ||
      location.pathname === `${SETTINGS_PREFIX}/`;
    if (!onSettingsRoot) return;
    navigate(`${SETTINGS_PREFIX}/${DEFAULT_CATEGORY}`, { replace: true });
  }, [requestedCategory, location.pathname, navigate]);

  const setActiveCategory = useCallback(
    (id: CategoryId) => {
      navigate(`${SETTINGS_PREFIX}/${encodeURIComponent(id)}`, {
        replace: true,
      });
    },
    [navigate],
  );

  const activePluginTab =
    pluginTabs.find((pt) => pt.id === activeCategoryId) ?? null;
  const categoryLabel =
    categories.find((c) => c.id === activeCategoryId)?.label ?? "";

  return (
    <div className="flex h-full min-w-0 flex-row bg-background text-foreground">
      <CategoryNav
        categories={categories}
        active={activeCategoryId}
        onSelect={setActiveCategory}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader className="px-6" title={categoryLabel} />
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-8 px-6 py-6">
            {activeCategoryId === "appearance" && <AppearancePanel />}
            {activeCategoryId === "channels" && <ChannelsPanel />}
            {activeCategoryId === "integrations" && <IntegrationsPanel />}
            {activeCategoryId === "llm" && <LlmProviderPanel />}
            {activeCategoryId === "mcp" && <McpPanel />}
            {activeCategoryId === "plugins" && <PluginsPanel />}
            {activeCategoryId === "general" && <GeneralPanel />}
            {activePluginTab && (
              <div className="flex flex-col gap-4">
                {activePluginTab.element}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

type CategoryNavProps = {
  readonly categories: readonly Category[];
  readonly active: CategoryId;
  readonly onSelect: (id: CategoryId) => void;
};

const CategoryNav = ({ categories, active, onSelect }: CategoryNavProps) => {
  const t = useT();
  return (
    <nav className="flex w-56 shrink-0 flex-col gap-0.5 border-r border-border bg-sidebar px-2 py-4">
      <h3 className="px-2 pb-2 text-2xs font-semibold tracking-wide uppercase text-muted-foreground">
        {t("settings.options")}
      </h3>
      {categories.map((c) => {
        const Icon = c.icon;
        const isActive = c.id === active;
        return (
          <Button
            key={c.id}
            variant="ghost"
            size="sm"
            aria-pressed={isActive}
            onClick={() => onSelect(c.id)}
            className={cn(
              "w-full justify-start gap-2 px-2 py-1.5 text-sm",
              isActive
                ? "bg-accent text-accent-foreground hover:bg-accent"
                : "text-muted-foreground",
            )}
          >
            <Icon className="size-4" />
            <span>{c.label}</span>
          </Button>
        );
      })}
    </nav>
  );
};

type SettingRowProps = {
  readonly title: string;
  readonly description?: ReactNode;
  readonly children: ReactNode;
};

const SettingRow = ({ title, description, children }: SettingRowProps) => {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-border pb-4 last:border-b-0 last:pb-0">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm font-medium">{title}</p>
        {description && (
          <div className="text-xs text-muted-foreground">{description}</div>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
};

const AppearancePanel = () => {
  const t = useT();
  const density = useDensity();
  const setDensity = useSetDensity();
  const locale = useLocale();
  const setLocale = useSetLocale();
  const panelShadows = usePanelShadows();
  const setPanelShadows = useSetPanelShadows();

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
    </section>
  );
};

const GeneralPanel = () => {
  const t = useT();
  const { settingsGateway } = useServices();
  const [busy, setBusy] = useState(false);

  const onResetAll = async () => {
    const confirmed = window.confirm(t("settings.general.resetAll.confirm"));
    if (!confirmed) return;
    setBusy(true);
    try {
      await settingsGateway.clearAllSettings();
      // Préférences purement renderer (thème/langue/densité).
      clearPersistedAppearance();
      toast.success(t("settings.general.resetAll.success"));
      // Repart sur un état propre : recharge la fenêtre.
      window.location.reload();
    } catch (err) {
      setBusy(false);
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const onWipeAll = async () => {
    const confirmed = window.confirm(t("settings.general.wipeAll.confirm"));
    if (!confirmed) return;
    setBusy(true);
    try {
      // Efface aussi les préférences renderer avant la fermeture : le main vide
      // la base + le disque puis tue le process, mais le localStorage lui
      // survit (il est lié à l'origine du renderer).
      clearPersistedAppearance();
      // Ne résout jamais : le main tue l'app aussitôt la base wipée.
      // L'utilisateur rouvrira l'app lui-même.
      await settingsGateway.factoryReset();
    } catch (err) {
      setBusy(false);
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/5 p-4">
        <div className="flex items-start justify-between gap-6">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-medium text-destructive">
              {t("settings.general.resetAll.title")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("settings.general.resetAll.description")}
            </p>
          </div>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => void onResetAll()}
            disabled={busy}
            className="shrink-0"
          >
            <Trash2 className="size-4" />
            {t("settings.general.resetAll.button")}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/5 p-4">
        <div className="flex items-start justify-between gap-6">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-medium text-destructive">
              {t("settings.general.wipeAll.title")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("settings.general.wipeAll.description")}
            </p>
          </div>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => void onWipeAll()}
            disabled={busy}
            className="shrink-0"
          >
            <Trash2 className="size-4" />
            {t("settings.general.wipeAll.button")}
          </Button>
        </div>
      </div>
    </section>
  );
};

type OnOffToggleProps = {
  value: boolean;
  onChange: (value: boolean) => void;
  onLabel: string;
  offLabel: string;
};

const OnOffToggle = ({ value, onChange, onLabel, offLabel }: OnOffToggleProps) => (
  <div className="inline-flex rounded-md border border-border p-0.5">
    <Button
      size="xs"
      variant={value ? "default" : "ghost"}
      onClick={() => onChange(true)}
      aria-pressed={value}
    >
      {onLabel}
    </Button>
    <Button
      size="xs"
      variant={value ? "ghost" : "default"}
      onClick={() => onChange(false)}
      aria-pressed={!value}
    >
      {offLabel}
    </Button>
  </div>
);

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

type DensitySliderProps = {
  density: DensityId;
  densities: readonly DensityDescriptor[];
  onSelect: (id: DensityId) => void;
};

const DensitySlider = ({ density, densities, onSelect }: DensitySliderProps) => {
  const activeIndex = Math.max(
    0,
    densities.findIndex((d) => d.id === density),
  );
  const activeDensity = densities[activeIndex];
  const lastIndex = densities.length - 1;

  return (
    <div className="flex flex-col gap-3 px-1 pt-1">
      <Slider.Root
        value={activeIndex}
        min={0}
        max={lastIndex}
        step={1}
        onValueChange={(v) => {
          const next = densities[v];
          if (next) onSelect(next.id);
        }}
      >
        <Slider.Control className="relative flex h-5 w-full touch-none items-center select-none">
          <Slider.Track className="relative h-1.5 w-full rounded-full bg-muted">
            <Slider.Indicator className="absolute h-full rounded-full bg-primary" />
            {densities.map((d, i) => (
              <span
                key={d.id}
                aria-hidden
                className={cn(
                  "absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border",
                  i <= activeIndex
                    ? "border-primary bg-primary"
                    : "border-border bg-background",
                )}
                style={{ left: `${(i / lastIndex) * 100}%` }}
              />
            ))}
          </Slider.Track>
          <Slider.Thumb className="size-4 rounded-full border-2 border-primary bg-background shadow-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />
        </Slider.Control>
      </Slider.Root>
      <div className="relative h-5 w-full">
        {densities.map((d, i) => {
          const selected = d.id === density;
          const alignClass =
            i === 0
              ? "-translate-x-0 text-left"
              : i === lastIndex
                ? "-translate-x-full text-right"
                : "-translate-x-1/2 text-center";
          return (
            <Button
              key={d.id}
              variant="ghost"
              size="xs"
              aria-pressed={selected}
              onClick={() => onSelect(d.id)}
              className={cn(
                "absolute top-0 h-auto whitespace-nowrap px-0 py-0 text-xs hover:bg-transparent",
                alignClass,
                selected
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              style={{ left: `${(i / lastIndex) * 100}%` }}
            >
              {d.label}
            </Button>
          );
        })}
      </div>
      {activeDensity && (
        <p className="text-xs text-muted-foreground">
          {activeDensity.description}
        </p>
      )}
    </div>
  );
};

const IntegrationsPanel = () => {
  return (
    <section className="flex flex-col gap-6">
      <LinearApiKeyRow />
      <GitLabTokenRow />
    </section>
  );
};

const LinearApiKeyRow = () => {
  const t = useT();
  const { getLinearApiKeyStatus, setLinearApiKey, clearLinearApiKey } =
    useServices();

  const [status, setStatus] = useState<LinearApiKeyStatus | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getLinearApiKeyStatus()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch((err) => {
        if (!cancelled) setError(formatError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [getLinearApiKeyStatus]);

  const onSave = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setError(t("common.keyEmpty"));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const next = await setLinearApiKey(trimmed);
      setStatus(next);
      setDraft("");
      setSavedAt(Date.now());
    } catch (err) {
      setError(formatError(err));
    } finally {
      setSaving(false);
    }
  };

  const onClear = async () => {
    setError(null);
    setSaving(true);
    try {
      const next = await clearLinearApiKey();
      setStatus(next);
      setSavedAt(null);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 border-b border-border pb-6 last:border-b-0 last:pb-0">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">
          {t("settings.integrations.linear.title")}
        </p>
        <p className="text-xs text-muted-foreground">
          <Trans
            t={t}
            i18nKey="settings.integrations.linear.description"
            components={{ code: <code /> }}
          />
        </p>
      </div>

      {status?.hasKey ? (
        <p className="text-xs text-muted-foreground">
          <Trans
            t={t}
            i18nKey="settings.integrations.linear.configured"
            values={{ lastFour: status.lastFour }}
            components={{ mono: <span className="font-mono" /> }}
          />
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          <Trans
            t={t}
            i18nKey="settings.integrations.linear.notConfigured"
            components={{ em: <em /> }}
          />
        </p>
      )}

      <div className="flex items-stretch gap-2">
        <PasswordInput
          id="linear-api-key"
          placeholder="lin_api_…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={saving}
          revealLabel={t("common.showKey")}
          hideLabel={t("common.hideKey")}
          className="font-mono"
        />
        <Button
          type="button"
          onClick={onSave}
          disabled={saving || draft.trim().length === 0}
        >
          {saving ? t("common.saving") : t("common.save")}
        </Button>
        {status?.hasKey && (
          <Button
            type="button"
            variant="destructive"
            onClick={onClear}
            disabled={saving}
          >
            {t("common.delete")}
          </Button>
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      {!error && savedAt && (
        <p className="text-xs text-muted-foreground">
          {t("settings.integrations.linear.updated")}
        </p>
      )}
    </div>
  );
};

const GitLabTokenRow = () => {
  const t = useT();
  const { getGitLabTokenStatus, setGitLabAccessToken, clearGitLabAccessToken } =
    useServices();

  const [status, setStatus] = useState<GitLabTokenStatus | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getGitLabTokenStatus()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch((err) => {
        if (!cancelled) setError(formatError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [getGitLabTokenStatus]);

  const onSave = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setError(t("common.keyEmpty"));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const next = await setGitLabAccessToken(trimmed);
      setStatus(next);
      setDraft("");
      setSavedAt(Date.now());
    } catch (err) {
      setError(formatError(err));
    } finally {
      setSaving(false);
    }
  };

  const onClear = async () => {
    setError(null);
    setSaving(true);
    try {
      const next = await clearGitLabAccessToken();
      setStatus(next);
      setSavedAt(null);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 border-b border-border pb-6 last:border-b-0 last:pb-0">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">
          {t("settings.integrations.gitlab.title")}
        </p>
        <p className="text-xs text-muted-foreground">
          <Trans
            t={t}
            i18nKey="settings.integrations.gitlab.description"
            components={{ code: <code /> }}
          />
        </p>
      </div>

      {status?.hasToken ? (
        <p className="text-xs text-muted-foreground">
          <Trans
            t={t}
            i18nKey="settings.integrations.gitlab.configured"
            values={{ lastFour: status.lastFour }}
            components={{ mono: <span className="font-mono" /> }}
          />
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          <Trans
            t={t}
            i18nKey="settings.integrations.gitlab.notConfigured"
            components={{ em: <em /> }}
          />
        </p>
      )}

      <div className="flex items-stretch gap-2">
        <PasswordInput
          id="gitlab-access-token"
          placeholder="glpat-…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={saving}
          revealLabel={t("common.showKey")}
          hideLabel={t("common.hideKey")}
          className="font-mono"
        />
        <Button
          type="button"
          onClick={onSave}
          disabled={saving || draft.trim().length === 0}
        >
          {saving ? t("common.saving") : t("common.save")}
        </Button>
        {status?.hasToken && (
          <Button
            type="button"
            variant="destructive"
            onClick={onClear}
            disabled={saving}
          >
            {t("common.delete")}
          </Button>
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      {!error && savedAt && (
        <p className="text-xs text-muted-foreground">
          {t("settings.integrations.gitlab.updated")}
        </p>
      )}
    </div>
  );
};

const LlmProviderPanel = () => {
  const t = useT();
  const { settingsGateway } = useServices();
  const [status, setStatus] = useState<OpenRouterStatus | null>(null);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [newModelDraft, setNewModelDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<OpenRouterTestResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    settingsGateway
      .getOpenRouterStatus()
      .then((s) => {
        if (cancelled) return;
        setStatus(s);
      })
      .catch((err) => {
        if (!cancelled) setError(formatError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [settingsGateway]);

  const onSaveKey = async () => {
    const trimmed = apiKeyDraft.trim();
    if (!trimmed) {
      setError(t("common.keyEmpty"));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const next = await settingsGateway.setOpenRouterApiKey(trimmed);
      setStatus(next);
      setApiKeyDraft("");
      setSavedAt(Date.now());
      setTestResult(null);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  };

  const onClearKey = async () => {
    setError(null);
    setBusy(true);
    try {
      const next = await settingsGateway.clearOpenRouterApiKey();
      setStatus(next);
      setApiKeyDraft("");
      setTestResult(null);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  };

  const onAddModel = async () => {
    const trimmed = newModelDraft.trim();
    if (!trimmed || !status) return;
    if (status.models.includes(trimmed)) {
      setError(t("settings.llm.modelExists"));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const next = await settingsGateway.setOpenRouterModels([
        ...status.models,
        trimmed,
      ]);
      setStatus(next);
      setNewModelDraft("");
      setSavedAt(Date.now());
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  };

  const onRemoveModel = async (model: string) => {
    if (!status) return;
    if (status.models.length <= 1) {
      setError(t("settings.llm.keepOneModel"));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const next = await settingsGateway.setOpenRouterModels(
        status.models.filter((m) => m !== model),
      );
      setStatus(next);
      setSavedAt(Date.now());
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  };

  const onSetDefault = async (model: string) => {
    if (!status || status.defaultModel === model) return;
    setError(null);
    setBusy(true);
    try {
      const next = await settingsGateway.setOpenRouterDefaultModel(model);
      setStatus(next);
      setSavedAt(Date.now());
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  };

  const onTest = async () => {
    setError(null);
    setTestResult(null);
    setBusy(true);
    try {
      const res = await settingsGateway.testOpenRouterConnection();
      setTestResult(res);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{"OpenRouter"}</p>
        <p className="text-xs text-muted-foreground">
          <Trans
            t={t}
            i18nKey="settings.llm.openRouter.description"
            components={{ code: <code /> }}
          />
        </p>
      </div>

      <div className="flex flex-col gap-2 border-b border-border pb-5">
        <p className="text-xs font-medium">{t("settings.llm.apiKey")}</p>
        {status?.hasApiKey ? (
          <p className="text-xs text-muted-foreground">
            <Trans
              t={t}
              i18nKey="settings.llm.keyConfigured"
              values={{ lastFour: status.lastFour }}
              components={{ mono: <span className="font-mono" /> }}
            />
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            <Trans
              t={t}
              i18nKey="settings.llm.keyNotConfigured"
              components={{ mono: <span className="font-mono" /> }}
            />
          </p>
        )}
        <div className="flex items-stretch gap-2">
          <PasswordInput
            id="openrouter-api-key"
            placeholder="sk-or-v1-…"
            value={apiKeyDraft}
            onChange={(e) => setApiKeyDraft(e.target.value)}
            disabled={busy}
            revealLabel={t("common.showKey")}
            hideLabel={t("common.hideKey")}
            className="font-mono"
          />
          <Button
            type="button"
            onClick={onSaveKey}
            disabled={busy || apiKeyDraft.trim().length === 0}
          >
            {busy ? t("common.saving") : t("common.save")}
          </Button>
          {status?.hasApiKey && (
            <Button
              type="button"
              variant="destructive"
              onClick={onClearKey}
              disabled={busy}
            >
              {t("common.delete")}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-b border-border pb-5">
        <p className="text-xs font-medium">{t("settings.llm.models.title")}</p>
        <p className="text-xs text-muted-foreground">
          <Trans
            t={t}
            i18nKey="settings.llm.models.description"
            components={{ code: <code />, mono: <span className="font-mono" /> }}
          />
        </p>
        <ul className="flex flex-col gap-1">
          {status?.models.map((model) => {
            const isDefault = model === status.defaultModel;
            return (
              <li
                key={model}
                className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5"
              >
                <button
                  type="button"
                  onClick={() => void onSetDefault(model)}
                  disabled={busy || isDefault}
                  title={
                    isDefault
                      ? t("settings.llm.models.isDefault")
                      : t("settings.llm.models.setDefault")
                  }
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:cursor-default",
                    isDefault && "text-amber-500 disabled:opacity-100",
                  )}
                >
                  <Star
                    className="size-3.5"
                    fill={isDefault ? "currentColor" : "none"}
                  />
                </button>
                <span className="flex-1 truncate font-mono text-xs">{model}</span>
                {isDefault && (
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t("settings.llm.models.default")}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void onRemoveModel(model)}
                  disabled={busy || status.models.length <= 1}
                  title={
                    status.models.length <= 1
                      ? t("settings.llm.models.keepOne")
                      : t("settings.llm.models.remove")
                  }
                  className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-stretch gap-2">
          <input
            type="text"
            value={newModelDraft}
            onChange={(e) => setNewModelDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void onAddModel();
              }
            }}
            disabled={busy}
            className="flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 font-mono text-sm shadow-xs transition-colors disabled:opacity-50"
            placeholder="anthropic/claude-sonnet-4"
          />
          <Button
            type="button"
            onClick={() => void onAddModel()}
            disabled={busy || newModelDraft.trim().length === 0}
          >
            <Plus className="size-4" />
            {t("common.add")}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium">{t("settings.llm.test.title")}</p>
        <p className="text-xs text-muted-foreground">
          {t("settings.llm.test.description")}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onTest}
            disabled={busy || !status?.hasApiKey}
          >
            {busy ? t("settings.llm.test.running") : t("settings.llm.test.run")}
          </Button>
          {testResult?.ok && (
            <p className="text-xs text-green-700 dark:text-green-400">
              <Trans
                t={t}
                i18nKey="settings.llm.test.ok"
                values={{
                  model: testResult.model,
                  latency: testResult.latencyMs,
                }}
                components={{ mono: <span className="font-mono" /> }}
              />
            </p>
          )}
          {testResult && !testResult.ok && (
            <p className="text-xs text-destructive" role="alert">
              {testResult.error}
            </p>
          )}
        </div>
      </div>

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      {!error && savedAt && (
        <p className="text-xs text-muted-foreground">
          {t("settings.llm.saved")}
        </p>
      )}
    </section>
  );
};

const MCP_SERVER_NAME = "ctxfirst-templates";
const MCP_SERVER_URL = "http://127.0.0.1:41234/mcp";

const CLAUDE_INSTALL_CMD = `claude mcp add --transport http ${MCP_SERVER_NAME} ${MCP_SERVER_URL}`;
const CODEX_INSTALL_CMD = `codex mcp add ${MCP_SERVER_NAME} --transport http --url ${MCP_SERVER_URL}`;

const McpPanel = () => {
  const t = useT();
  const { settingsGateway } = useServices();
  const [status, setStatus] = useState<McpServerStatus | null>(null);
  const [tools, setTools] = useState<ReadonlyArray<McpToolInfo> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      settingsGateway
        .getMcpServerStatus()
        .then((next) => {
          if (!cancelled) setStatus(next);
        })
        .catch(() => {
          if (!cancelled) setStatus(null);
        });
    };
    refresh();
    // Re-poll while the panel is open — the server boots asynchronously, so a
    // freshly-opened Settings view may catch it before it's listening.
    const id = window.setInterval(refresh, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [settingsGateway]);

  useEffect(() => {
    let cancelled = false;
    settingsGateway
      .listMcpTools()
      .then((next) => {
        if (!cancelled) setTools(next);
      })
      .catch(() => {
        if (!cancelled) setTools([]);
      });
    return () => {
      cancelled = true;
    };
  }, [settingsGateway]);

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-primary">
            {t("settings.mcp.serverTitle", { name: MCP_SERVER_NAME })}
          </p>
          <McpStatusIndicator status={status} />
        </div>
        <p className="text-xs text-muted-foreground">
          {t("settings.mcp.description")}
        </p>
      </div>
      <InstallSnippet label="Claude Code" command={CLAUDE_INSTALL_CMD} />
      <InstallSnippet label="Codex" command={CODEX_INSTALL_CMD} />
      <p className="text-xs text-muted-foreground">
        <Trans
          t={t}
          i18nKey="settings.mcp.endpoint"
          values={{ url: MCP_SERVER_URL }}
          components={{ mono: <span className="font-mono" /> }}
        />
      </p>
      <McpToolsList tools={tools} />
    </section>
  );
};

type McpToolsListProps = {
  /** `null` while the catalog is still loading. */
  tools: ReadonlyArray<McpToolInfo> | null;
};

const McpToolsList = ({ tools }: McpToolsListProps) => {
  const t = useT();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const toggle = (name: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <FormLabel className="text-sm font-medium text-primary">
          {t("settings.mcp.toolsExposed")}
        </FormLabel>
        {tools !== null && (
          <Badge tone="neutral" size="sm" className="rounded">
            {tools.length}
          </Badge>
        )}
      </div>
      {tools === null ? (
        <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
      ) : tools.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("settings.mcp.noTools")}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded border border-border">
          {tools.map((tool) => {
            const isOpen = expanded.has(tool.name);
            return (
              <li key={tool.name} className="flex flex-col gap-1 px-3 py-2">
                <div className="flex items-start gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-xs">{tool.name}</code>
                      <Badge
                        tone="neutral"
                        size="sm"
                        className="rounded uppercase"
                      >
                        {tool.group}
                      </Badge>
                    </div>
                    <p className="text-2xs text-muted-foreground">
                      {tool.title}
                    </p>
                    <p className="text-2xs text-muted-foreground">
                      {tool.description}
                    </p>
                    {tool.parameters.length > 0 && (
                      <ul className="mt-1 flex flex-col gap-0.5">
                        {tool.parameters.map((param) => (
                          <li
                            key={param.name}
                            className="text-2xs text-muted-foreground"
                          >
                            <span className="font-mono">{param.name}</span>
                            {!param.optional && (
                              <span className="text-destructive"> *</span>
                            )}
                            {param.description && (
                              <>{` — ${param.description}`}</>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggle(tool.name)}
                    aria-label={isOpen ? t("common.close") : t("settings.mcp.test")}
                  >
                    {isOpen ? (
                      <X className="size-4" />
                    ) : (
                      <Play className="size-4" />
                    )}
                  </Button>
                </div>
                {isOpen && <McpToolPlayground tool={tool} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

type McpToolPlaygroundProps = { tool: McpToolInfo };

/**
 * Renvoie l'objet `args` à envoyer au handler à partir des valeurs string
 * saisies dans le formulaire. Lève une erreur lisible si un champ JSON est
 * mal formé ou si un `number` n'est pas parsable.
 */
const parseArgs = (
  params: ReadonlyArray<McpToolParamInfo>,
  values: Record<string, string>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const p of params) {
    const raw = values[p.name] ?? "";
    if (raw === "" && p.optional) continue;
    if (p.kind === "string") {
      out[p.name] = raw;
    } else if (p.kind === "number") {
      const n = Number(raw);
      if (Number.isNaN(n))
        throw new Error(
          i18n.t("settings.mcp.playground.invalidNumber", { name: p.name }),
        );
      out[p.name] = n;
    } else if (p.kind === "boolean") {
      out[p.name] = raw === "true";
    } else {
      // json
      if (raw === "") {
        out[p.name] = {};
        continue;
      }
      try {
        out[p.name] = JSON.parse(raw);
      } catch (e) {
        throw new Error(
          i18n.t("settings.mcp.playground.invalidJson", {
            name: p.name,
            message: e instanceof Error ? e.message : String(e),
          }),
        );
      }
    }
  }
  return out;
};

const McpToolPlayground = ({ tool }: McpToolPlaygroundProps) => {
  const t = useT();
  const { settingsGateway } = useServices();
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<McpInvokeResult | null>(null);
  const [running, setRunning] = useState(false);

  const setValue = (name: string, v: string) =>
    setValues((prev) => ({ ...prev, [name]: v }));

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const args = parseArgs(tool.parameters, values);
      const res = await settingsGateway.invokeMcpTool(tool.name, args);
      setResult(res);
    } catch (e) {
      setResult({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        durationMs: 0,
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-2 rounded border border-border bg-background/40 p-2">
      {tool.parameters.length === 0 ? (
        <p className="text-2xs text-muted-foreground">
          {t("settings.mcp.playground.noParams")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {tool.parameters.map((param) => (
            <McpToolPlaygroundField
              key={param.name}
              param={param}
              value={values[param.name] ?? ""}
              onChange={(v) => setValue(param.name, v)}
            />
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void run()}
          disabled={running}
        >
          {running
            ? t("settings.mcp.playground.running")
            : t("settings.mcp.playground.run")}
        </Button>
        {result && (
          <span className="text-2xs text-muted-foreground">
            {t("settings.mcp.playground.duration", {
              ms: result.durationMs.toFixed(0),
            })}
            {result.ok ? (
              t("settings.mcp.playground.ok")
            ) : (
              <span className="text-destructive">
                {t("settings.mcp.playground.error")}
              </span>
            )}
          </span>
        )}
      </div>
      {result && (
        <div className="flex flex-col gap-1">
          <FormLabel className="text-2xs">
            {t("settings.mcp.playground.result")}
          </FormLabel>
          <ScrollArea className="max-h-64 rounded border border-input bg-background">
            <pre
              className={cn(
                "p-2 font-mono text-xs whitespace-pre",
                !result.ok && "text-destructive",
              )}
            >
              {result.ok ? result.text : result.error}
            </pre>
          </ScrollArea>
        </div>
      )}
    </div>
  );
};

type McpToolPlaygroundFieldProps = {
  param: McpToolParamInfo;
  value: string;
  onChange: (next: string) => void;
};

const McpToolPlaygroundField = ({
  param,
  value,
  onChange,
}: McpToolPlaygroundFieldProps) => {
  const label = (
    <FormLabel className="text-2xs">
      <span className="font-mono">{param.name}</span>
      {!param.optional && <span className="text-destructive"> *</span>}
    </FormLabel>
  );

  if (param.kind === "boolean") {
    return (
      <div className="flex items-center gap-2">
        <Checkbox
          checked={value === "true"}
          onCheckedChange={(checked) => onChange(checked ? "true" : "false")}
        />
        {label}
      </div>
    );
  }

  if (param.kind === "json") {
    return (
      <div className="flex flex-col gap-1">
        {label}
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={6}
          placeholder="{}"
          className="font-mono text-xs"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {label}
      <Input
        type={param.kind === "number" ? "number" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
};

type McpStatusIndicatorProps = {
  /** `null` while the first status fetch is in flight. */
  status: McpServerStatus | null;
};

const McpStatusIndicator = ({ status }: McpStatusIndicatorProps) => {
  const t = useT();
  const tone =
    status === null ? "unknown" : status.running ? "online" : "offline";
  const label =
    tone === "online"
      ? t("settings.mcp.status.online")
      : tone === "offline"
        ? t("settings.mcp.status.offline")
        : t("settings.mcp.status.checking");
  const title =
    tone === "offline" && status?.error
      ? t("settings.mcp.status.offlineError", { error: status.error })
      : tone === "online"
        ? t("settings.mcp.status.onlineTitle")
        : tone === "offline"
          ? t("settings.mcp.status.offlineTitle")
          : t("settings.mcp.status.checkingTitle");

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      role="status"
      title={title}
    >
      <span
        aria-hidden
        className={cn(
          "h-2 w-2 rounded-full",
          tone === "online" && "bg-emerald-500",
          tone === "offline" && "bg-red-500",
          tone === "unknown" && "bg-muted-foreground/40",
        )}
      />
      {label}
    </span>
  );
};

type InstallSnippetProps = {
  label: string;
  command: string;
};

const InstallSnippet = ({ label, command }: InstallSnippetProps) => {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const onCopy = () => {
    void navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <FormLabel className="text-sm text-foreground">{label}</FormLabel>
      <div className="flex items-stretch gap-2">
        <code className="flex-1 overflow-x-auto rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs whitespace-pre">
          {command}
        </code>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onCopy}
          aria-label={
            copied ? t("settings.mcp.copy.copied") : t("settings.mcp.copy.copy")
          }
          title={copied ? t("common.copied") : t("common.copy")}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
    </div>
  );
};

type PluginRow = PluginListEntry;

type PermissionMeta = PluginPermissionMeta;

type BadgeTone = "success" | "warning" | "neutral" | "danger";

const STATE_TONE: Record<PluginRow["state"], BadgeTone> = {
  active: "success",
  pending: "warning",
  disabled: "neutral",
  failed: "danger",
};

const PluginsPanel = () => {
  const t = useT();
  const {
    listPlugins,
    listPluginPermissions,
    openPluginFolder,
    setPluginPermission,
    setPluginEnabled,
    reloadPlugin,
    grantPlugin,
  } = useServices();

  const [plugins, setPlugins] = useState<ReadonlyArray<PluginRow> | null>(null);
  const [catalog, setCatalog] = useState<ReadonlyArray<PermissionMeta>>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendingDialog, setPendingDialog] = useState<PluginRow | null>(null);

  const refresh = async () => {
    try {
      const [list, cat] = await Promise.all([
        listPlugins(),
        listPluginPermissions(),
      ]);
      setPlugins(list);
      setCatalog(cat);
    } catch (err) {
      setError(formatError(err));
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openFolder = async (pluginId?: string) => {
    try {
      await openPluginFolder({ pluginId });
    } catch (err) {
      setError(formatError(err));
    }
  };

  const togglePermission = async (
    p: PluginRow,
    permission: string,
    granted: boolean,
  ) => {
    try {
      await setPluginPermission({
        pluginId: p.id,
        permission,
        granted,
      });
      await refresh();
    } catch (err) {
      setError(formatError(err));
    }
  };

  const toggleEnabled = async (p: PluginRow, enabled: boolean) => {
    try {
      await setPluginEnabled({ pluginId: p.id, enabled });
      await refresh();
    } catch (err) {
      setError(formatError(err));
    }
  };

  const reload = async (p: PluginRow) => {
    try {
      await reloadPlugin({ pluginId: p.id });
      await refresh();
    } catch (err) {
      setError(formatError(err));
    }
  };

  const grantAll = async (p: PluginRow) => {
    try {
      await grantPlugin({
        pluginId: p.id,
        version: p.version,
        permissions: p.declaredPermissions,
        enabled: true,
      });
      setPendingDialog(null);
      await refresh();
    } catch (err) {
      setError(formatError(err));
    }
  };

  const deny = async (p: PluginRow) => {
    try {
      await grantPlugin({
        pluginId: p.id,
        version: p.version,
        permissions: [],
        enabled: false,
      });
      setPendingDialog(null);
      await refresh();
    } catch (err) {
      setError(formatError(err));
    }
  };

  const catalogById = new Map(catalog.map((c) => [c.id, c]));

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">{t("settings.plugins.title")}</p>
          <p className="text-xs text-muted-foreground">
            {t("settings.plugins.description")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void openFolder()}>
          {t("settings.plugins.openFolder")}
        </Button>
      </div>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2">
        {plugins === null ? (
          <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
        ) : plugins.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("settings.plugins.empty")}
          </p>
        ) : (
          plugins.map((p) => (
            <PluginCard
              key={p.id}
              plugin={p}
              catalogById={catalogById}
              onAuthorize={() => setPendingDialog(p)}
              onTogglePermission={(perm, granted) =>
                void togglePermission(p, perm, granted)
              }
              onToggleEnabled={(enabled) => void toggleEnabled(p, enabled)}
              onReload={() => void reload(p)}
              onOpenFolder={() => void openFolder(p.id)}
            />
          ))
        )}
      </div>
      {pendingDialog && (
        <AuthorizationDialog
          plugin={pendingDialog}
          catalogById={catalogById}
          onCancel={() => setPendingDialog(null)}
          onDeny={() => void deny(pendingDialog)}
          onGrant={() => void grantAll(pendingDialog)}
        />
      )}
    </section>
  );
};

type PluginCardProps = {
  plugin: PluginRow;
  catalogById: Map<string, PermissionMeta>;
  onAuthorize: () => void;
  onTogglePermission: (permission: string, granted: boolean) => void;
  onToggleEnabled: (enabled: boolean) => void;
  onReload: () => void;
  onOpenFolder: () => void;
};

const PluginCard = ({
  plugin,
  catalogById,
  onAuthorize,
  onTogglePermission,
  onToggleEnabled,
  onReload,
  onOpenFolder,
}: PluginCardProps) => {
  const t = useT();
  const granted = new Set(plugin.grantedPermissions);
  const { open: isOpen, toggle } = useCollapsibleState({
    persistKey: `app.settings.plugins.${plugin.id}`,
    defaultOpen: plugin.state === "pending" || plugin.state === "failed",
  });
  const bodyId = `plugin-card-body-${plugin.id}`;
  return (
    <article className="flex flex-col rounded border border-border bg-card/40">
      <header className="flex items-center gap-1.5 px-3 py-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={isOpen}
          aria-controls={bodyId}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight
            aria-hidden
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
              isOpen && "rotate-90",
            )}
          />
          <div className="flex min-w-0 flex-col">
            <p className="truncate text-sm font-medium">
              <span className="text-primary">{plugin.name}</span>
              <span className="ml-1 font-mono text-xs text-muted-foreground">
                {`v${plugin.version}`}
              </span>
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {plugin.id}
              {plugin.author ? ` · ${plugin.author}` : ""}
            </p>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge
            tone={STATE_TONE[plugin.state]}
            size="sm"
            className="rounded uppercase"
          >
            {t(`settings.plugins.state.${plugin.state}`)}
          </Badge>
          <span
            className={cn(
              "rounded px-1.5 py-px text-2xs font-medium uppercase",
              plugin.source === "builtin"
                ? "bg-muted text-muted-foreground"
                : "bg-primary/15 text-primary",
            )}
          >
            {plugin.source}
          </span>
        </div>
      </header>

      <div
        id={bodyId}
        data-open={isOpen ? "true" : "false"}
        className="grid transition-[grid-template-rows] duration-150 ease-out"
        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
        aria-hidden={!isOpen}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-2 px-3 pb-3">
            {plugin.description && (
              <p className="text-xs text-muted-foreground">
                {plugin.description}
              </p>
            )}
            {plugin.error && (
              <p className="rounded border border-destructive/40 bg-destructive/10 p-1.5 text-2xs text-destructive">
                {plugin.error}
              </p>
            )}

            {plugin.state === "pending" ? (
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={onAuthorize}>
                  {t("settings.plugins.reviewPermissions")}
                </Button>
              </div>
            ) : (
              plugin.declaredPermissions.length > 0 && (
                <Section
                  title={
                    <span className="text-xs font-normal text-muted-foreground">
                      {t("settings.plugins.permissions", {
                        granted: granted.size,
                        total: plugin.declaredPermissions.length,
                      })}
                    </span>
                  }
                  collapsible
                  defaultOpen={false}
                  persistKey={`app.settings.plugin-permissions.${plugin.id}`}
                  density="compact"
                  level={4}
                >
                  <ul className="flex flex-col gap-1">
                    {plugin.declaredPermissions.map((perm) => {
                      const meta = catalogById.get(perm);
                      const isGranted = granted.has(perm);
                      return (
                        <li
                          key={perm}
                          className="flex items-start justify-between gap-2 rounded border border-border bg-background/40 px-2 py-1.5"
                        >
                          <div className="flex min-w-0 flex-col">
                            <span className="font-mono text-2xs">
                              {meta?.label ?? perm}
                              {meta?.sensitive && (
                                <span className="ml-1 text-2xs text-amber-600 dark:text-amber-400">
                                  {t("settings.plugins.sensitive")}
                                </span>
                              )}
                            </span>
                            {meta?.rationale && (
                              <span className="text-2xs text-muted-foreground">
                                {meta.rationale}
                              </span>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant={isGranted ? "outline" : "default"}
                            onClick={() =>
                              onTogglePermission(perm, !isGranted)
                            }
                          >
                            {isGranted
                              ? t("settings.plugins.revoke")
                              : t("settings.plugins.grant")}
                          </Button>
                        </li>
                      );
                    })}
                    {plugin.networkHosts.length > 0 && (
                      <li className="rounded border border-dashed border-border px-2 py-1.5 text-2xs text-muted-foreground">
                        <Trans
                          t={t}
                          i18nKey="settings.plugins.allowedHosts"
                          values={{
                            count: plugin.networkHosts.length,
                            hosts: plugin.networkHosts.join(", "),
                          }}
                          components={{ mono: <span className="font-mono" /> }}
                        />
                      </li>
                    )}
                  </ul>
                </Section>
              )
            )}

            <footer className="flex items-center justify-between gap-2 pt-1">
              <p className="text-2xs text-muted-foreground">
                {[
                  plugin.renderer ? "UI" : null,
                  plugin.contributions.stepKinds.length > 0
                    ? t("settings.plugins.stepKinds", {
                        count: plugin.contributions.stepKinds.length,
                      })
                    : null,
                  plugin.methods.length > 0
                    ? t("settings.plugins.ipcMethods", {
                        count: plugin.methods.length,
                      })
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="flex items-center gap-1.5">
                {plugin.source === "user" && (
                  <Button size="sm" variant="ghost" onClick={onOpenFolder}>
                    {t("settings.plugins.folder")}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={onReload}>
                  {t("settings.plugins.reload")}
                </Button>
                {plugin.state === "active" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onToggleEnabled(false)}
                    disabled={plugin.core}
                    title={
                      plugin.core ? t("settings.plugins.coreTooltip") : undefined
                    }
                  >
                    {t("settings.plugins.disable")}
                  </Button>
                ) : plugin.state === "disabled" ? (
                  <Button size="sm" onClick={() => onToggleEnabled(true)}>
                    {t("settings.plugins.enable")}
                  </Button>
                ) : null}
              </div>
            </footer>
          </div>
        </div>
      </div>
    </article>
  );
};

type AuthorizationDialogProps = {
  plugin: PluginRow;
  catalogById: Map<string, PermissionMeta>;
  onCancel: () => void;
  onDeny: () => void;
  onGrant: () => void;
};

const AuthorizationDialog = ({
  plugin,
  catalogById,
  onCancel,
  onDeny,
  onGrant,
}: AuthorizationDialogProps) => {
  const t = useT();
  const { openExternalUrl } = useServices();
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onCancel()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-[60] flex w-[520px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-md border border-border bg-card p-5 shadow-xl">
          <Dialog.Title className="text-sm font-semibold">
            {t("settings.plugins.authorize.title", { name: plugin.name })}
          </Dialog.Title>
          <p className="text-xs text-muted-foreground">
            {t("settings.plugins.authorize.description")}
            {plugin.homepage && (
              <>
                {" "}
                <a
                  className="underline"
                  href={plugin.homepage}
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={(e) => {
                    e.preventDefault();
                    void openExternalUrl(plugin.homepage!);
                  }}
                >
                  {t("settings.plugins.authorize.homepage")}
                </a>
              </>
            )}
          </p>
          <ul className="flex flex-col gap-1.5">
            {plugin.declaredPermissions.map((perm) => {
              const meta = catalogById.get(perm);
              return (
                <li
                  key={perm}
                  className="rounded border border-border bg-background/40 px-2 py-1.5 text-xs"
                >
                  <p className="font-medium">
                    {meta?.label ?? perm}
                    {meta?.sensitive && (
                      <span className="ml-1 text-2xs text-amber-600 dark:text-amber-400">
                        {t("settings.plugins.sensitive")}
                      </span>
                    )}
                  </p>
                  {meta?.rationale && (
                    <p className="text-2xs text-muted-foreground">
                      {meta.rationale}
                    </p>
                  )}
                </li>
              );
            })}
            {plugin.networkHosts.length > 0 && (
              <li className="rounded border border-dashed border-border px-2 py-1.5 text-2xs text-muted-foreground">
                <Trans
                  t={t}
                  i18nKey="settings.plugins.authorize.allowedHosts"
                  values={{ hosts: plugin.networkHosts.join(", ") }}
                  components={{ mono: <span className="font-mono" /> }}
                />
              </li>
            )}
          </ul>
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              {t("settings.plugins.authorize.later")}
            </Button>
            <Button variant="destructive" size="sm" onClick={onDeny}>
              {t("settings.plugins.authorize.deny")}
            </Button>
            <Button size="sm" onClick={onGrant}>
              {t("settings.plugins.authorize.grantAll")}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

const DEFAULT_CHANNEL_ID = "personal";

const ChannelsPanel = () => {
  const t = useT();
  const { workflowGateway } = useServices();
  const { activeChannelId, setActiveChannel } = useActiveChannel();
  const [channels, setChannels] = useState<ReadonlyArray<ChannelView>>([]);
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = async () => {
    const list = await workflowGateway.listChannels();
    setChannels(list);
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDelete = async (id: string) => {
    if (id === DEFAULT_CHANNEL_ID) return;
    const confirmed = window.confirm(
      t("settings.channels.deleteConfirm", { id }),
    );
    if (!confirmed) return;
    try {
      await workflowGateway.deleteChannel(id);
      await refresh();
      toast.success(t("settings.channels.deleted", { id }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">{t("settings.channels.title")}</p>
          <p className="text-xs text-muted-foreground">
            <Trans
              t={t}
              i18nKey="settings.channels.description"
              components={{ mono: <span className="font-mono" /> }}
            />
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          {t("settings.channels.new")}
        </Button>
      </div>
      <ul className="flex flex-col divide-y divide-border rounded border border-border">
        {channels.map((c) => {
          const isActive = c.id === activeChannelId;
          const isDefault = c.id === DEFAULT_CHANNEL_ID;
          return (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={async () => {
                  try {
                    await setActiveChannel(c.id);
                  } catch (err) {
                    toast.error(
                      err instanceof Error ? err.message : String(err),
                    );
                  }
                }}
              >
                <ChannelIcon
                  channelId={c.id}
                  hasImage={!!c.iconImagePath}
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <span className="truncate text-sm">{c.name}</span>
                <span className="font-mono text-2xs text-muted-foreground">
                  {c.id}
                </span>
                {isActive && (
                  <Badge tone="success" size="sm" className="ml-2 rounded">
                    {t("settings.channels.active")}
                  </Badge>
                )}
                {isDefault && (
                  <Badge tone="neutral" size="sm" className="ml-2 rounded">
                    {t("settings.channels.default")}
                  </Badge>
                )}
              </button>
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={isDefault}
                onClick={() => void onDelete(c.id)}
                title={
                  isDefault
                    ? t("settings.channels.cannotDeleteDefault")
                    : t("common.delete")
                }
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          );
        })}
      </ul>
      <CreateChannelDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => refresh()}
      />
    </section>
  );
};

const formatError = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return i18n.t("common.unknownError");
};

export default SettingsEditor;
