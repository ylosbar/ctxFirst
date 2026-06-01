import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  DEFAULT_LOCALE,
  isLocale,
  type Locale,
} from "../i18n/locales";

export type ThemeId =
  | "nocturne"
  | "ayu-mirage"
  | "terminal"
  | "devtools"
  | "daylight"
  | "violet"
  | "violet-dark";

export type ThemeVariant = "light" | "dark";

export type ThemeDescriptor = {
  id: ThemeId;
  label: string;
  variant: ThemeVariant;
};

const THEME_LIST: ThemeDescriptor[] = [
  { id: "nocturne", label: "Nocturne", variant: "dark" },
  { id: "ayu-mirage", label: "Ayu Mirage", variant: "dark" },
  { id: "terminal", label: "Terminal", variant: "dark" },
  { id: "devtools", label: "Google Dev Tools", variant: "dark" },
  { id: "daylight", label: "Daylight", variant: "light" },
  { id: "violet", label: "Violet", variant: "light" },
  { id: "violet-dark", label: "Violet Dark", variant: "dark" },
];

export const THEMES: readonly ThemeDescriptor[] = [...THEME_LIST].sort((a, b) =>
  a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
);

export type DensityId =
  | "compact"
  | "standard"
  | "comfortable"
  | "extra-comfortable";

export type DensityDescriptor = {
  id: DensityId;
  label: string;
  description: string;
  rootFontSizePx: number;
};

export const DENSITIES: readonly DensityDescriptor[] = [
  {
    id: "compact",
    label: "+",
    description: "Plus dense, idéal pour les écrans réduits.",
    rootFontSizePx: 16,
  },
  {
    id: "standard",
    label: "++",
    description: "Taille par défaut.",
    rootFontSizePx: 19,
  },
  {
    id: "comfortable",
    label: "+++",
    description: "Texte plus grand et plus aéré.",
    rootFontSizePx: 22,
  },
  {
    id: "extra-comfortable",
    label: "++++",
    description: "Texte très grand, accessibilité maximale.",
    rootFontSizePx: 26,
  },
];

const DEFAULT_THEME: ThemeId = "nocturne";
const DEFAULT_DENSITY: DensityId = "standard";
const DEFAULT_PANEL_SHADOWS = true;

const isThemeId = (value: unknown): value is ThemeId =>
  THEMES.some((t) => t.id === value);

const isDensityId = (value: unknown): value is DensityId =>
  DENSITIES.some((d) => d.id === value);

const variantOf = (id: ThemeId): ThemeVariant =>
  THEMES.find((t) => t.id === id)?.variant ?? "dark";

const densitySizeOf = (id: DensityId): number =>
  DENSITIES.find((d) => d.id === id)?.rootFontSizePx ?? 19;

const STORAGE_KEY = "ui.appearance";
const LEGACY_THEME_KEY = "ui.theme";
const LEGACY_DENSITY_KEY = "ui.density";

// One-shot seed of the new persisted blob from the legacy isolated keys, then
// drop the legacy keys so we don't keep two sources of truth.
if (typeof window !== "undefined") {
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (!existing) {
      const legacyTheme = window.localStorage.getItem(LEGACY_THEME_KEY);
      const legacyDensity = window.localStorage.getItem(LEGACY_DENSITY_KEY);
      if (legacyTheme !== null || legacyDensity !== null) {
        const seed = {
          state: {
            theme: isThemeId(legacyTheme) ? legacyTheme : DEFAULT_THEME,
            density: isDensityId(legacyDensity)
              ? legacyDensity
              : DEFAULT_DENSITY,
          },
          version: 0,
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      }
    }
    window.localStorage.removeItem(LEGACY_THEME_KEY);
    window.localStorage.removeItem(LEGACY_DENSITY_KEY);
  } catch {
    /* noop */
  }
}

export type AppearanceState = {
  readonly theme: ThemeId;
  readonly density: DensityId;
  readonly locale: Locale;
  readonly preview: ThemeId | null;
  /** Elevation shadows cast by the side panels onto the editor area. */
  readonly panelShadows: boolean;
  readonly setTheme: (theme: ThemeId) => void;
  readonly previewTheme: (theme: ThemeId | null) => void;
  readonly setDensity: (density: DensityId) => void;
  readonly setLocale: (locale: Locale) => void;
  readonly setPanelShadows: (enabled: boolean) => void;
};

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      theme: DEFAULT_THEME,
      density: DEFAULT_DENSITY,
      locale: DEFAULT_LOCALE,
      preview: null,
      panelShadows: DEFAULT_PANEL_SHADOWS,
      setTheme: (theme) => set({ theme, preview: null }),
      previewTheme: (preview) => set({ preview }),
      setDensity: (density) => set({ density }),
      setLocale: (locale) => set({ locale: isLocale(locale) ? locale : DEFAULT_LOCALE }),
      setPanelShadows: (panelShadows) => set({ panelShadows }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        theme: s.theme,
        density: s.density,
        locale: s.locale,
        panelShadows: s.panelShadows,
      }),
    },
  ),
);

if (typeof document !== "undefined") {
  const apply = (state: AppearanceState) => {
    const active = state.preview ?? state.theme;
    const root = document.documentElement;
    root.classList.toggle("dark", variantOf(active) === "dark");
    root.dataset.theme = active;
    root.style.fontSize = `${densitySizeOf(state.density)}px`;
    root.dataset.density = state.density;
    root.lang = state.locale;
  };
  apply(useAppearanceStore.getState());
  useAppearanceStore.subscribe(apply);
}

/**
 * Efface les préférences d'apparence persistées dans `localStorage`
 * (thème/densité/langue). Utilisé par la suppression complète des réglages :
 * l'app doit être rechargée juste après pour repartir sur les défauts.
 */
export const clearPersistedAppearance = (): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
};

export const useTheme = (): ThemeId => useAppearanceStore((s) => s.theme);

export const usePreviewTheme = (): ThemeId | null =>
  useAppearanceStore((s) => s.preview);

export const useActiveTheme = (): ThemeId =>
  useAppearanceStore((s) => s.preview ?? s.theme);

export const useThemeVariant = (): ThemeVariant => {
  const active = useActiveTheme();
  return variantOf(active);
};

export const useDensity = (): DensityId =>
  useAppearanceStore((s) => s.density);

export const useSetTheme = (): ((theme: ThemeId) => void) =>
  useAppearanceStore((s) => s.setTheme);

export const useSetPreviewTheme = (): ((theme: ThemeId | null) => void) =>
  useAppearanceStore((s) => s.previewTheme);

export const useSetDensity = (): ((density: DensityId) => void) =>
  useAppearanceStore((s) => s.setDensity);

export const useLocale = (): Locale => useAppearanceStore((s) => s.locale);

export const useSetLocale = (): ((locale: Locale) => void) =>
  useAppearanceStore((s) => s.setLocale);

export const usePanelShadows = (): boolean =>
  useAppearanceStore((s) => s.panelShadows);

export const useSetPanelShadows = (): ((enabled: boolean) => void) =>
  useAppearanceStore((s) => s.setPanelShadows);
