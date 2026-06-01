/**
 * `UiPluginApi` — surface exposed to a renderer plugin's `renderer.js` at
 * `onload(ui)` time. One instance is constructed per plugin, so the API
 * already knows which `pluginId` to address.
 *
 * Phase 2 scope (cf. PLUGINS.md §5):
 *  - `addPage(...)` — contributes a button in the ActivityBar + a primary
 *    sidebar view rendered as the page's content. Maps to the workbench
 *    registry's `registerActivity` + `registerView`. We do not surface the
 *    workbench primitives directly so the plugin stays decoupled from the
 *    workbench's internal contribution shapes.
 *  - `registerSettingsTab(...)` — adds a category to the Settings modal.
 *  - `invoke(method, args?)` — round-trips through `plugin:invoke`. Routing
 *    is pinned to the owning `pluginId`, so a plugin can never spoof another.
 *  - `subscribe(event, fn)` — reserved for V3 (plugin → renderer event
 *    streams). A no-op stub today so plugins can safely hold the reference.
 *  - `log` — scoped `[plugin:<id>]` console logger.
 *  - `primitives` — shared UI components (cf. UI_PRIMITIVES.md). `Section`
 *    is wrapped per-plugin to scope `persistKey` to the plugin's namespace.
 *
 * Permissions are not enforced yet (Phase 3). All renderer plugins currently
 * have the same surface.
 */
import type { LucideIcon } from "lucide-react";
import {
  createElement,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from "react";
import * as LucideIcons from "lucide-react";
import type { PluginGateway } from "../application/ports/plugin-gateway";
import { rendererPluginRegistry, type SettingsTabContribution } from "./plugin-registry";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Callout } from "../components/ui/callout";
import { Checkbox } from "../components/ui/checkbox";
import { EmptyState } from "../components/ui/empty-state";
import { FormField } from "../components/ui/form-field";
import { FormLabel } from "../components/ui/form-label";
import { Input } from "../components/ui/input";
import { PageHeader } from "../components/ui/page-header";
import { PasswordInput } from "../components/ui/password-input";
import { ScrollArea } from "../components/ui/scroll-area";
import { SearchInput } from "../components/ui/search-input";
import { Section, type SectionProps } from "../components/ui/section";
import { Select } from "../components/ui/select";
import { Separator } from "../components/ui/separator";
import { Textarea } from "../components/ui/textarea";
import { Tooltip } from "../components/ui/tooltip";

export type UiPluginPageContribution = {
  /** Unique slug used as the underlying activity id and view id. */
  id: string;
  /** Tooltip in the ActivityBar + header of the primary sidebar view. */
  title: string;
  icon: LucideIcon;
  /** Sort order in the ActivityBar (smaller = higher). Defaults to `500`. */
  order?: number;
  /** ActivityBar placement — `"bottom"` pins to the footer next to Settings. */
  placement?: "top" | "bottom";
  /**
   * Primary-sidebar content rendered when the activity is active. Optional —
   * a page that only needs the central editor area can omit it (the workbench
   * will collapse the sidebar slot for that activity).
   */
  sidebar?: ReactNode;
  /**
   * Central editor-area content rendered when the activity is active. When
   * set, the page registers an editor type under a synthetic
   * `plugin-<pluginId>-<pageId>` scheme and the activity opens it as its
   * default editor — same UX as built-in features that own the main view.
   */
  mainView?: ReactNode;
};

export type UiPluginLog = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export type UiPluginPrimitives = {
  PageHeader: typeof PageHeader;
  Section: ComponentType<SectionProps>;
  Card: typeof Card;
  Separator: typeof Separator;
  ScrollArea: typeof ScrollArea;
  EmptyState: typeof EmptyState;
  Callout: typeof Callout;
  Button: typeof Button;
  Input: typeof Input;
  PasswordInput: typeof PasswordInput;
  SearchInput: typeof SearchInput;
  Textarea: typeof Textarea;
  Select: typeof Select;
  Checkbox: typeof Checkbox;
  FormField: typeof FormField;
  FormLabel: typeof FormLabel;
  Badge: typeof Badge;
  Tooltip: typeof Tooltip;
};

export type UiPluginApi = {
  readonly pluginId: string;
  /** Adds a top-level page (ActivityBar button + sidebar view). */
  addPage(page: UiPluginPageContribution): void;
  /** Adds a category inside the Settings modal. */
  registerSettingsTab(tab: SettingsTabContribution): void;
  /** Calls a main-side method registered by this plugin's `main.js`. */
  invoke(method: string, args?: unknown): Promise<unknown>;
  /**
   * Subscribes to a plugin-emitted event. Reserved for Phase 3 — currently a
   * no-op that returns an empty unsubscribe so plugins can wire defensively.
   */
  subscribe(event: string, fn: (payload: unknown) => void): () => void;
  /** Scoped logger that prefixes every entry with `[plugin:<id>]`. */
  readonly log: UiPluginLog;
  /**
   * React building blocks shared with the host so vanilla-ESM plugins can
   * construct elements without bundling their own React copy. Until the
   * `@ctxfirst/plugin-sdk` ships in Phase 3, this is the canonical way for a
   * plugin to produce a `ReactNode` (no JSX, no module-level `import "react"`).
   *
   *  - `h` is `React.createElement` — keep the alias short, the spec mentions
   *    JSX-style examples but the runtime needs `createElement`.
   *  - `icons` re-exports every lucide-react icon component so a plugin can
   *    pick one without bringing the icon set in its own bundle.
   */
  readonly react: {
    h: typeof createElement;
    Fragment: typeof Fragment;
    icons: typeof LucideIcons;
    /**
     * Subset of React hooks re-exported from the host's copy. Plugins that
     * need state in their contributed React subtrees use these rather than
     * importing `react` (which they can't, since the plugin:// loader only
     * resolves files under the plugin's own root).
     */
    hooks: {
      useState: typeof useState;
      useEffect: typeof useEffect;
      useCallback: typeof useCallback;
      useMemo: typeof useMemo;
      useRef: typeof useRef;
    };
  };
  /**
   * Shared UI primitives (host components). See `UI_PRIMITIVES.md §2.5`.
   *
   * `Section` is wrapped per-plugin: any `persistKey` is prefixed with
   * `plugin.<pluginId>.` so a plugin's collapsible state lives in its own
   * `localStorage` namespace and cannot collide with the host's.
   */
  readonly primitives: UiPluginPrimitives;
};

export type { ComponentType, ReactElement, ReactNode };

/**
 * Per-plugin wrapper for `<Section>` that namespaces `persistKey` under
 * `plugin.<pluginId>.`. The host's `useCollapsibleState` then stores under
 * `ui.collapsible.plugin.<pluginId>.<key>`, isolated from the host's
 * `ui.collapsible.app.<key>` entries.
 */
const makePluginScopedSection = (pluginId: string): ComponentType<SectionProps> => {
  const prefix = `plugin.${pluginId}.`;
  const PluginScopedSection = ({ persistKey, ...rest }: SectionProps) =>
    createElement(Section, {
      ...rest,
      persistKey: persistKey ? `${prefix}${persistKey}` : undefined,
    });
  PluginScopedSection.displayName = `PluginScopedSection(${pluginId})`;
  return PluginScopedSection;
};

const makePluginPrimitives = (pluginId: string): UiPluginPrimitives => ({
  PageHeader,
  Section: makePluginScopedSection(pluginId),
  Card,
  Separator,
  ScrollArea,
  EmptyState,
  Callout,
  Button,
  Input,
  PasswordInput,
  SearchInput,
  Textarea,
  Select,
  Checkbox,
  FormField,
  FormLabel,
  Badge,
  Tooltip,
});

export const createUiPluginApi = (
  pluginId: string,
  gateway: PluginGateway,
): UiPluginApi => {
  const prefix = `[plugin:${pluginId}]`;
  return {
    pluginId,
    addPage(page) {
      rendererPluginRegistry.addPage(pluginId, page);
    },
    registerSettingsTab(tab) {
      rendererPluginRegistry.registerSettingsTab(pluginId, tab);
    },
    invoke(method, args) {
      return gateway.invoke(pluginId, method, args);
    },
    subscribe(_event, _fn) {
      // Placeholder until the renderer-side event bus lands in Phase 3.
      return () => {};
    },
    log: {
      info: (...args) => console.log(prefix, ...args),
      warn: (...args) => console.warn(prefix, ...args),
      error: (...args) => console.error(prefix, ...args),
    },
    react: {
      h: createElement,
      Fragment,
      icons: LucideIcons,
      hooks: {
        useState,
        useEffect,
        useCallback,
        useMemo,
        useRef,
      },
    },
    primitives: makePluginPrimitives(pluginId),
  };
};
