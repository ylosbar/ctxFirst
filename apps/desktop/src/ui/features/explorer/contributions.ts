import { FolderTree } from "lucide-react";
import { createElement } from "react";
import { workbenchRegistry } from "../../workbench/registry";
import ResourceTreeView from "./ResourceTreeView";

workbenchRegistry.registerActivity({
  id: "explorer",
  title: "Explorer",
  icon: FolderTree,
  defaultView: "explorer.tree",
  order: 15,
  route: "/explorer",
});

// Spec runs-dedicated-activity.md §4 : la vue Explorer est désormais
// *activity-bound* (`activity: "explorer"`) — uniquement éligible côté gauche
// quand l'activité Explorer est active. Cohabitait précédemment partout en
// global ; maintenant que `runs.list` est activity-bound aussi (cf. spec §1),
// les deux ne se retrouveraient sinon côte à côte dans le même groupe. La
// priorité haute (90) reste utile pour ordonner les tabs au sein du groupe
// d'ancrage gauche quand d'autres vues contextuelles d'éditeur sont éligibles.
workbenchRegistry.registerView({
  id: "explorer.tree",
  defaultLocation: "left",
  title: "Explorer",
  icon: FolderTree,
  activity: "explorer",
  priority: 90,
  render: () => createElement(ResourceTreeView),
});
