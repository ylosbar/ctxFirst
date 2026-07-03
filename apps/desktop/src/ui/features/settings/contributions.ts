import { Settings } from "lucide-react";
import { createElement } from "react";
import { workbenchRegistry } from "../../workbench/registry";
import SettingsEditor from "./SettingsEditor";

const SETTINGS_URI = "settings://";
const SETTINGS_PATH = "/settings";

workbenchRegistry.registerActivity({
  id: "settings",
  title: "Settings",
  icon: Settings,
  defaultEditor: SETTINGS_URI,
  order: 1000,
  placement: "bottom",
  route: SETTINGS_PATH,
});

workbenchRegistry.registerEditorType({
  id: "settings.editor",
  scheme: "settings",
  title: () => "Paramètres",
  icon: () => Settings,
  render: () => createElement(SettingsEditor),
  // The settings editor is a singleton whose URI carries no category — the
  // category lives only in the URL sub-path (`/settings/<category>`), which the
  // editor owns. `matchPath` claims the bare path and every sub-path; `toPath`
  // maps back to the bare path (WorkbenchRouterSync preserves a deeper current
  // URL rather than downgrading it).
  matchPath: (path) =>
    path === SETTINGS_PATH || path.startsWith(`${SETTINGS_PATH}/`)
      ? SETTINGS_URI
      : null,
  toPath: () => SETTINGS_PATH,
});
