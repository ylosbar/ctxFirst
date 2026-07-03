import type { ComponentType, FunctionComponent, ReactNode } from "react";
import type { LucideProps } from "lucide-react";
import type { IDockviewPanelHeaderProps } from "dockview-react";
import type { ChatViewContextSnapshot } from "@/application/ports/chat-gateway";

// Position d'une vue dans le dockview unifié (cf. spec
// workbench-unified-dockview.md §Modèle). Remplace l'ancien `ViewSlot` retiré
// en PR 2c — toutes les contributions doivent désormais déclarer
// `defaultLocation` au lieu de `slot`.
export type DockLocation = "left" | "right" | "bottom" | "center";

export type ActivityId = string;
export type ViewId = string;
export type EditorTypeId = string;
export type EditorUri = string;

export type EditorState = {
  readonly uri: EditorUri;
  readonly typeId: EditorTypeId;
  readonly panelId: string;
  readonly dirty?: boolean;
};

export type ActivityContribution = {
  readonly id: ActivityId;
  readonly title: string;
  readonly icon: ComponentType<LucideProps>;
  readonly defaultView?: ViewId;
  readonly defaultEditor?: EditorUri;
  readonly order: number;
  // Where the activity button sits in the ActivityBar. "top" (default) is the
  // main scrollable group; "bottom" is the pinned footer group (e.g. Settings).
  readonly placement?: "top" | "bottom";
  // Landing path for this activity: navigated to when the button is clicked
  // outside the Workbench host, and the URL an editor-less activity maps back
  // to (spec workbench audit H-3). `WorkbenchRouterSync` matches an incoming
  // URL to this activity when `matchPath` isn't supplied, via a prefix test on
  // `route` (`path === route || path.startsWith(route + "/")`).
  readonly route?: string;
  // Optional custom URL→activity matcher, overriding the default `route`
  // prefix test. Lets an activity claim extra paths (e.g. Overview also owns
  // `/`). Returning `true` activates this activity for `pathname`.
  readonly matchPath?: (pathname: string) => boolean;
  // Launcher mode: when set, clicking the button only invokes this callback —
  // the activity is not activated, no route is navigated, no editor is opened.
  // Used for modal-style activities (e.g. Settings).
  readonly onActivate?: () => void;
};

export type ViewRenderProps = {
  readonly api: WorkbenchApi;
  readonly activeEditor: EditorState | null;
};

export type ViewContribution = {
  readonly id: ViewId;
  // Position initiale dans le dockview unifié. Une fois la vue ajoutée au
  // dockview, sa position est possédée par dockview (et mémorisée dans
  // `prefs.viewLocations`) — `defaultLocation` ne s'applique qu'au premier
  // ajout. Le reconciler (cf. `dock-reconciler.ts`) matérialise la vue à
  // cette location la première fois qu'elle devient éligible.
  readonly defaultLocation: DockLocation;
  readonly title: string;
  readonly icon?: ComponentType<LucideProps>;
  // Activity ownership: when set, the view is only eligible while that
  // activity is active. Use for activity-bound views (e.g. runs.explorer).
  readonly activity?: ActivityId;
  // Editor predicate: when set, the view is only eligible while the active
  // editor matches. Use for editor-context views (e.g. inspectors).
  readonly whenEditor?: (active: EditorState | null) => boolean;
  // Ordre déterministe utilisé par le reconciler quand plusieurs vues sont
  // candidates au même emplacement (cf. `pickPrimaryView`). Tri ascendant,
  // défaut `100`. Tie-break sur `id` croissant.
  readonly priority?: number;
  // Si `false`, le reconciler ne matérialise PAS la vue automatiquement quand
  // elle devient éligible (défaut `true`). La vue reste ouvrable explicitement
  // via `showView` (ex. bouton ActivityBar) et, une fois ouverte, persiste dans
  // le snapshot dockview. Usage : vues à ouverture opt-in qui ne doivent pas
  // s'afficher au premier boot (ex. le Terminal).
  readonly autoShow?: boolean;
  // Cycle de vie de la vue vis-à-vis de son éligibilité (whenEditor / activity /
  // viewAvailability).
  //  - "persistent" (défaut) : additif. Matérialisée à la 1re éligibilité, jamais
  //    retirée automatiquement ; un hide utilisateur est sticky. La contribution
  //    DOIT rendre un état neutre quand elle est inéligible (cf. templates.inspector).
  //  - "contextual" : jetable. Auto-show quand éligible, auto-hide quand inéligible,
  //    re-show quand le contexte revient. Un hide utilisateur ne survit pas à une
  //    transition inéligible → éligible. Perd son état React à chaque auto-hide.
  readonly lifecycle?: "persistent" | "contextual";
  readonly render: (props: ViewRenderProps) => ReactNode;
};

// Feature-scoped wrappers around the Workbench shell. `Provider` wraps the
// entire workbench tree (so views/editors/tab renderers can read its context).
// `Overlay` is rendered once at the workbench root, after the layout — useful
// for toasters or route-driven modal dialogs.
export type FeatureHostContribution = {
  readonly id: string;
  readonly Provider?: ComponentType<{ readonly children: ReactNode }>;
  readonly Overlay?: ComponentType;
};

export type EditorTabProps = IDockviewPanelHeaderProps<{
  readonly uri: EditorUri;
  readonly typeId: EditorTypeId;
}>;

export type EditorTypeContribution = {
  readonly id: EditorTypeId;
  readonly scheme: string;
  readonly title: (uri: EditorUri) => string;
  readonly icon?: (uri: EditorUri) => ComponentType<LucideProps> | undefined;
  // Optional Tailwind classes applied to the editor's tab icon (e.g.
  // `text-[var(--chart-1)]`). Used to color the icon per resource kind so
  // tabs stay visually consistent with the explorer.
  readonly iconClassName?: string;
  // Default view to show in the primary (left) anchor group when an editor of
  // this type becomes active and the user has no persisted choice yet. Lu par
  // `pickPrimaryView` (cf. spec workbench-unified-dockview.md §2.3).
  readonly defaultPrimaryView?: ViewId;
  // URL routing (spec workbench audit H-3) — each editor type owns the mapping
  // between its URI scheme and the router path, so `WorkbenchRouterSync` stays
  // generic (a plugin routes itself without patching the sync component).
  //  - `matchPath`: URL → editor URI. Return the URI to open for `pathname` +
  //    `search`, or `null` when this type doesn't own the path.
  //  - `toPath`: editor URI → URL. Return the path to navigate to when an
  //    editor of this type is active, or `null` to leave the URL untouched.
  readonly matchPath?: (pathname: string, search: string) => EditorUri | null;
  readonly toPath?: (uri: EditorUri) => string | null;
  readonly render: (props: {
    uri: EditorUri;
    api: WorkbenchApi;
  }) => ReactNode;
  // Optional: a custom tab renderer for this editor type. Receives Dockview
  // panel header props with the editor's params. If omitted, the default
  // EditorTabRenderer is used. Typed as `FunctionComponent` (not the broader
  // `ComponentType`) so it slots into Dockview's `tabComponents` map without a
  // cast (spec workbench audit F-6) — Dockview only accepts function components
  // (memo/forwardRef/plain) at runtime anyway.
  readonly tab?: FunctionComponent<EditorTabProps>;

  // Synchronous snapshot of the editor's chat context for the given URI.
  // Called at every chat sendMessage (and at session creation) to publish the
  // live state of the view to the LLM. Must read in-memory state only —
  // never disk, never SQLite, never await. Return `null` when the editor has
  // nothing to publish (e.g. not yet mounted, empty draft).
  readonly getChatContext?: (uri: EditorUri) => ChatViewContextSnapshot | null;
};

export type OpenEditorOptions = {
  readonly focus?: boolean;
};

export type WorkbenchApi = {
  // Returns the opened editor's state, or `null` when no editor type is
  // registered for the URI's scheme (spec workbench audit M-2). Callers that
  // pass a URI from user/plugin-controlled input must handle `null`.
  openEditor(uri: EditorUri, opts?: OpenEditorOptions): EditorState | null;
  closeEditor(uri: EditorUri): void;
  closeEditorByPanel(panelId: string): void;
  activeEditor(): EditorState | null;
  listEditors(): ReadonlyArray<EditorState>;

  showView(id: ViewId): void;
  hideView(id: ViewId): void;
  toggleView(id: ViewId): void;

  activateActivity(id: ActivityId): void;
  activeActivity(): ActivityId | null;
};
