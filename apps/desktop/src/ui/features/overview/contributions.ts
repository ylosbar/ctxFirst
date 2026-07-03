import { LayoutGrid } from "lucide-react";
import { createElement } from "react";
import { workbenchRegistry } from "../../workbench/registry";
import OverviewEditor from "./OverviewEditor";

const OVERVIEW_URI = "overview://";

const OVERVIEW_PATH = "/overview";

workbenchRegistry.registerActivity({
  id: "overview",
  title: "Overview",
  icon: LayoutGrid,
  defaultEditor: OVERVIEW_URI,
  order: 15,
  route: OVERVIEW_PATH,
  // Overview also owns the app root (`/` and empty path).
  matchPath: (path) =>
    path === "/" ||
    path === "" ||
    path === OVERVIEW_PATH ||
    path.startsWith(`${OVERVIEW_PATH}/`),
});

workbenchRegistry.registerEditorType({
  id: "overview.viewer",
  scheme: "overview",
  title: () => "Overview",
  icon: () => LayoutGrid,
  render: () => createElement(OverviewEditor),
  matchPath: (path) =>
    path === "/" || path === "" || path === OVERVIEW_PATH ? OVERVIEW_URI : null,
  toPath: () => OVERVIEW_PATH,
});
