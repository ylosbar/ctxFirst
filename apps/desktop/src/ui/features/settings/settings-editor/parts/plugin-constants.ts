import type {
  PluginListEntry,
  PluginPermissionMeta,
} from "@/domain/plugin/types";

export type PluginRow = PluginListEntry;

export type PermissionMeta = PluginPermissionMeta;

type BadgeTone = "success" | "warning" | "neutral" | "danger";

export const STATE_TONE: Record<PluginRow["state"], BadgeTone> = {
  active: "success",
  pending: "warning",
  disabled: "neutral",
  failed: "danger",
};
