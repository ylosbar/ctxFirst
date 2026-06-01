import { MessageSquare } from "lucide-react";
import { createElement } from "react";
import { workbenchRegistry } from "../../workbench/registry";
import { useWorkbenchStore } from "../../workbench/store";
import ChatActivityView from "./ChatActivityView";
import ChatFloatingButton from "./ChatFloatingButton";

// Le chat est une vue *globale* ancrée à droite — pas bind à une activité,
// pas bind à un type d'éditeur, donc éligible partout. On veut pouvoir l'ouvrir
// au-dessus de n'importe quelle vue (templates, runs, kanban, settings…) sans
// perdre le contexte d'édition en cours.
//
// Spec workbench-unified-dockview.md PR 2b sub-1 : première vue migrée du
// slot-host (secondarySidebar) vers un panneau du dockview unifié. Le reconciler
// matérialise `view:chat.main` à droite de l'éditeur dès que la vue est éligible
// et que l'utilisateur ne l'a pas masquée explicitement.
// `autoShow: false` — le reconciler ne matérialise PAS le chat au premier boot ;
// la chatbox globale reste fermée par défaut. L'utilisateur l'ouvre via le bouton
// ActivityBar (mode launcher → `showView`), et une fois ouverte elle persiste
// dans le snapshot dockview (réouverte au reload tant qu'elle n'est pas masquée).
workbenchRegistry.registerView({
  id: "chat.main",
  defaultLocation: "right",
  title: "Chat",
  icon: MessageSquare,
  autoShow: false,
  render: () => createElement(ChatActivityView),
});

// L'entrée d'ActivityBar reste un bouton dédié, mais en mode "launcher" :
// elle bascule (toggle) la vue chat dans la sidebar droite au lieu d'activer
// une activité (qui fermerait les éditeurs courants). Cliquer ouvre la chatbox
// si elle est fermée, la ferme si elle est déjà montée.
workbenchRegistry.registerActivity({
  id: "chat",
  title: "Chat",
  icon: MessageSquare,
  order: 50,
  placement: "bottom",
  onActivate: () => {
    useWorkbenchStore.getState().toggleView("chat.main");
  },
});

// Bouton d'action flottant (bas-droite) pour ouvrir/fermer la chatbox globale,
// monté en overlay au-dessus de tout le workbench.
workbenchRegistry.registerFeatureHost({
  id: "chat",
  Overlay: ChatFloatingButton,
});
