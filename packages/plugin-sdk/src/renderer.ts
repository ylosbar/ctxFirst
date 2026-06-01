/**
 * Type-only contract for the **renderer half** of an CtxFirst plugin.
 *
 * Mirror of `apps/desktop/src/plugins/ui-plugin-api.ts`. The host injects an
 * instance of `UiPluginApi` at `onload(ui)` time, already scoped to this
 * plugin's id. Authors should keep `renderer.js` as ESM with no `import "react"` —
 * use `ui.react.h` + `ui.react.icons` to build elements, or bring their own
 * pre-bundled React copy.
 */

import type {
  ComponentType,
  CSSProperties,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  RefAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  createElement,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type UiPluginLog = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export type UiPluginPageContribution = {
  id: string;
  title: string;
  /**
   * Any lucide-react icon component. Use `ui.react.icons.<Name>` rather than
   * importing the library directly, so the host's copy is reused.
   */
  icon: unknown;
  order?: number;
  placement?: "top" | "bottom";
  sidebar: ReactNode;
};

export type UiPluginSettingsTab = {
  id: string;
  label: string;
  icon?: unknown;
  element: ReactNode;
};

/**
 * Props for the UI primitives the host injects into `ui.primitives`. These
 * mirror the host's `apps/desktop/src/components/ui/*` exports — the host
 * implements them, this SDK only declares the shape so plugin authors writing
 * TypeScript get autocomplete. The contract may break between major versions
 * of the desktop app (cf. UI_PRIMITIVES.md §5 D13).
 */
export namespace UiPrimitiveProps {
  export type Section = {
    title?: ReactNode;
    description?: ReactNode;
    actions?: ReactNode;
    leading?: ReactNode;
    trailing?: ReactNode;
    children: ReactNode;
    className?: string;
    density?: "default" | "compact";
    collapsible?: boolean;
    defaultOpen?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /**
     * Plugin-relative key. The host injects the `plugin.<pluginId>.` prefix
     * before persistence — a plugin cannot read/write another plugin's or
     * the host's collapsible state.
     */
    persistKey?: string;
    unmountOnClose?: boolean;
    variant?: "flat" | "panel" | "card";
    sticky?: boolean;
    level?: 2 | 3 | 4;
  };

  export type PageHeader = {
    title: ReactNode;
    icon?: ReactNode;
    trailing?: ReactNode;
    actions?: ReactNode;
    className?: string;
  };

  export type Card = HTMLAttributes<HTMLDivElement>;

  export type Separator = HTMLAttributes<HTMLDivElement> & {
    orientation?: "horizontal" | "vertical";
  };

  export type ScrollArea = HTMLAttributes<HTMLDivElement>;

  export type EmptyState = {
    title?: ReactNode;
    description?: ReactNode;
    icon?: ReactNode;
    actions?: ReactNode;
    className?: string;
  };

  export type Callout = {
    children?: ReactNode;
    tone: "info" | "warning" | "success" | "danger";
    icon?: ReactNode;
    title?: ReactNode;
    actions?: ReactNode;
    className?: string;
  };

  export type Button = HTMLAttributes<HTMLButtonElement> & {
    type?: "button" | "submit" | "reset";
    disabled?: boolean;
    variant?: "default" | "primary" | "destructive" | "outline" | "ghost" | "link";
    size?: "sm" | "default" | "lg" | "icon" | "icon-sm" | "icon-xs";
    asChild?: boolean;
  };

  export type Input = InputHTMLAttributes<HTMLInputElement>;
  export type PasswordInput = InputHTMLAttributes<HTMLInputElement> & {
    revealLabel?: string;
    hideLabel?: string;
  };
  export type SearchInput = InputHTMLAttributes<HTMLInputElement>;
  export type Textarea = TextareaHTMLAttributes<HTMLTextAreaElement> & {
    size?: "sm" | "default";
  };
  export type Select = SelectHTMLAttributes<HTMLSelectElement>;
  export type Checkbox = {
    checked?: boolean;
    defaultChecked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    disabled?: boolean;
    id?: string;
    name?: string;
    className?: string;
    style?: CSSProperties;
  };
  export type FormField = {
    label?: ReactNode;
    description?: ReactNode;
    error?: ReactNode;
    required?: boolean;
    htmlFor?: string;
    orientation?: "vertical" | "inline";
    children: ReactNode;
    className?: string;
  };
  export type FormLabel = HTMLAttributes<HTMLLabelElement> & {
    htmlFor?: string;
  };

  export type Badge = {
    children: ReactNode;
    tone?: "neutral" | "primary" | "success" | "warning" | "destructive";
    size?: "sm" | "default";
    font?: "sans" | "mono";
    className?: string;
  };

  export type Tooltip = {
    children: ReactNode;
    content: ReactNode;
    side?: "top" | "right" | "bottom" | "left";
    delayMs?: number;
  };
}

export type UiPluginPrimitives = {
  // Layout
  PageHeader: ComponentType<UiPrimitiveProps.PageHeader>;
  Section: ComponentType<UiPrimitiveProps.Section>;
  Card: ComponentType<UiPrimitiveProps.Card>;
  Separator: ComponentType<UiPrimitiveProps.Separator>;
  ScrollArea: ComponentType<UiPrimitiveProps.ScrollArea & RefAttributes<unknown>>;
  EmptyState: ComponentType<UiPrimitiveProps.EmptyState>;
  Callout: ComponentType<UiPrimitiveProps.Callout>;

  // Forms
  Button: ComponentType<UiPrimitiveProps.Button>;
  Input: ComponentType<UiPrimitiveProps.Input>;
  PasswordInput: ComponentType<UiPrimitiveProps.PasswordInput>;
  SearchInput: ComponentType<UiPrimitiveProps.SearchInput>;
  Textarea: ComponentType<UiPrimitiveProps.Textarea>;
  Select: ComponentType<UiPrimitiveProps.Select>;
  Checkbox: ComponentType<UiPrimitiveProps.Checkbox>;
  FormField: ComponentType<UiPrimitiveProps.FormField>;
  FormLabel: ComponentType<UiPrimitiveProps.FormLabel>;

  // Feedback
  Badge: ComponentType<UiPrimitiveProps.Badge>;
  Tooltip: ComponentType<UiPrimitiveProps.Tooltip>;
};

export type UiPluginApi = {
  readonly pluginId: string;
  addPage(page: UiPluginPageContribution): void;
  registerSettingsTab(tab: UiPluginSettingsTab): void;
  invoke(method: string, args?: unknown): Promise<unknown>;
  subscribe(event: string, fn: (payload: unknown) => void): () => void;
  readonly log: UiPluginLog;
  readonly react: {
    h: typeof createElement;
    Fragment: typeof Fragment;
    /**
     * Re-export of `lucide-react` from the host. Indexed by icon name.
     * Use `as` to cast to the concrete component type at the call site.
     */
    icons: Record<string, unknown>;
    /**
     * Subset of React hooks re-exported from the host's copy of React. Use
     * these inside function components contributed via `addPage` /
     * `registerSettingsTab` rather than importing `react` (which the plugin://
     * loader cannot resolve from inside a plugin's directory).
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
   * Shared UI primitives — same components as the host, so plugins inherit
   * theme tokens and density automatically. Cf. UI_PRIMITIVES.md §2.5.
   *
   * For `Section`, the host wraps the component to inject the
   * `plugin.<pluginId>.` prefix into `persistKey` — a plugin's collapsible
   * state lives in a private namespace.
   */
  readonly primitives: UiPluginPrimitives;
};

export type RendererPluginModule = {
  onload?: (api: UiPluginApi) => void | Promise<void>;
  onunload?: (api: UiPluginApi) => void | Promise<void>;
};

/** No-op narrower — mirror of `defineMain` for the renderer half. */
export const defineRenderer = (
  mod: RendererPluginModule,
): RendererPluginModule => mod;
