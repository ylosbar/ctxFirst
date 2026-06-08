import {
  Brain,
  Layers,
  Link2,
  Palette,
  Plug,
  Puzzle,
  Settings2,
  type LucideIcon,
} from "lucide-react";

export type CoreCategoryId =
  | "appearance"
  | "channels"
  | "integrations"
  | "llm"
  | "mcp"
  | "plugins"
  | "general";
export type CategoryId = CoreCategoryId | string;

export type Category = {
  readonly id: CategoryId;
  readonly label: string;
  readonly icon: LucideIcon;
};

type CoreCategoryDef = {
  readonly id: CoreCategoryId;
  readonly labelKey: string;
  readonly icon: LucideIcon;
};

export const CORE_CATEGORY_DEFS: readonly CoreCategoryDef[] = [
  { id: "appearance", labelKey: "settings.categories.appearance", icon: Palette },
  { id: "channels", labelKey: "settings.categories.channels", icon: Layers },
  { id: "integrations", labelKey: "settings.categories.integrations", icon: Link2 },
  { id: "llm", labelKey: "settings.categories.llm", icon: Brain },
  { id: "mcp", labelKey: "settings.categories.mcp", icon: Plug },
  { id: "plugins", labelKey: "settings.categories.plugins", icon: Puzzle },
  { id: "general", labelKey: "settings.categories.general", icon: Settings2 },
];

export const DEFAULT_CATEGORY: CoreCategoryId = "appearance";
export const SETTINGS_PREFIX = "/settings";

export const categoryFromPath = (pathname: string): string | null => {
  if (pathname === SETTINGS_PREFIX || pathname === `${SETTINGS_PREFIX}/`) {
    return null;
  }
  if (!pathname.startsWith(`${SETTINGS_PREFIX}/`)) return null;
  const rest = pathname.slice(`${SETTINGS_PREFIX}/`.length);
  const slash = rest.indexOf("/");
  const segment = slash === -1 ? rest : rest.slice(0, slash);
  return segment ? decodeURIComponent(segment) : null;
};
