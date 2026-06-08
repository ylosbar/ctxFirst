import { useSyncExternalStore } from "react";

import { rendererPluginRegistry } from "@/plugins/plugin-registry";

export const usePluginSettingsTabs = () =>
  useSyncExternalStore(
    rendererPluginRegistry.subscribeSettingsTabs,
    rendererPluginRegistry.listSettingsTabs,
    rendererPluginRegistry.listSettingsTabs,
  );
