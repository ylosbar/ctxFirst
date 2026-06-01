import { Settings } from "lucide-react";
import { createElement } from "react";
import { workbenchRegistry } from "../../workbench/registry";
import SettingsEditor from "./SettingsEditor";

const SETTINGS_URI = "settings://";

workbenchRegistry.registerActivity({
  id: "settings",
  title: "Settings",
  icon: Settings,
  defaultEditor: SETTINGS_URI,
  order: 1000,
  placement: "bottom",
  route: "/settings",
});

workbenchRegistry.registerEditorType({
  id: "settings.editor",
  scheme: "settings",
  title: () => "Paramètres",
  icon: () => Settings,
  singleton: true,
  render: () => createElement(SettingsEditor),
});
