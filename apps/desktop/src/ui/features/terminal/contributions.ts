import { TerminalSquare } from "lucide-react";
import { createElement } from "react";
import { workbenchRegistry } from "../../workbench/registry";
import { useWorkbenchStore } from "../../workbench/store";
import TerminalView from "./TerminalView";

// Spec workbench-unified-dockview.md PR 2b sub-5 (suite) : Terminal migre du
// slot-host bottomDock vers le dockview unifié, ancré en bas. Vue globale mais
// `autoShow: false` — le reconciler ne la matérialise pas au boot ; elle ne
// s'ouvre que sur action explicite (bouton ActivityBar « Terminal » ci-dessous,
// palette) puis persiste dans le snapshot dockview. Le terminal est donc fermé
// par défaut.
workbenchRegistry.registerView({
  id: "terminal.devlog",
  defaultLocation: "bottom",
  title: "Terminal",
  icon: TerminalSquare,
  autoShow: false,
  render: () => createElement(TerminalView),
});

// Bouton de l'ActivityBar en mode launcher — bascule le terminal (ouvre s'il
// est fermé, ferme s'il est ouvert), sans changer l'activité courante (cf.
// chat.main).
workbenchRegistry.registerActivity({
  id: "terminal",
  title: "Terminal",
  icon: TerminalSquare,
  order: 55,
  placement: "bottom",
  onActivate: () => {
    useWorkbenchStore.getState().toggleView("terminal.devlog");
  },
});
