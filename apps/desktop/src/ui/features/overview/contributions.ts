import { LayoutGrid } from "lucide-react";
import { createElement } from "react";
import { workbenchRegistry } from "../../workbench/registry";
import OverviewEditor from "./OverviewEditor";

const OVERVIEW_URI = "overview://";

workbenchRegistry.registerActivity({
  id: "overview",
  title: "Overview",
  icon: LayoutGrid,
  defaultEditor: OVERVIEW_URI,
  order: 15,
  route: "/overview",
});

workbenchRegistry.registerEditorType({
  id: "overview.viewer",
  scheme: "overview",
  title: () => "Overview",
  icon: () => LayoutGrid,
  singleton: true,
  render: () => createElement(OverviewEditor),
});
