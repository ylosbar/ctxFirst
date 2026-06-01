import type {
  ActivityContribution,
  ActivityId,
  DockLocation,
  EditorState,
  EditorTypeContribution,
  EditorUri,
  FeatureHostContribution,
  ViewContribution,
  ViewId,
} from "./types";

type ViewQueryContext = {
  readonly activity: ActivityId | null;
  readonly editor: EditorState | null;
};

// Spec workbench-unified-dockview.md PR 2c : `slot` est retiré du modèle —
// toutes les contributions déclarent désormais `defaultLocation`. On garde un
// helper unique pour matérialiser la valeur (et pouvoir réintroduire un
// fallback si une contribution tierce oublie le champ).
export const getViewLocation = (view: ViewContribution): DockLocation =>
  view.defaultLocation ?? "left";

// Prédicat d'éligibilité contextuelle pur (activity + whenEditor), partagé par
// le registry, le reconciler et le store. La disponibilité (`viewAvailability`)
// reste hors-registry et est composée par les appelants.
export const isViewEligible = (
  view: ViewContribution,
  ctx: { activity: ActivityId | null; editor: EditorState | null },
): boolean => {
  if (view.whenEditor && !view.whenEditor(ctx.editor)) return false;
  if (view.activity && view.activity !== ctx.activity) return false;
  return true;
};

// Une vue gauche est mémorisée PAR TYPE d'éditeur ssi elle est contextuelle
// (son `whenEditor` matche l'éditeur actif) — donc liée au type. Les vues
// globales (sans `whenEditor`) sont un état GLOBAL, jamais indexé par type
// (spec workbench-view-lifecycle-ux §3.1). Comme `templates.metadata`
// (le `defaultPrimaryView` du template editor) est lui-même `whenEditor`-bound,
// aucun cas spécial `defaultPrimaryView` n'est nécessaire.
export const isPrimaryPersistablePerType = (
  view: ViewContribution,
  editor: EditorState | null,
): boolean => Boolean(view.whenEditor && view.whenEditor(editor));

const activities = new Map<ActivityId, ActivityContribution>();
const views = new Map<ViewId, ViewContribution>();
const editorTypes = new Map<string, EditorTypeContribution>();
const hosts = new Map<string, FeatureHostContribution>();

// Pub/sub bumped whenever a contribution lands. Lets late registrants (e.g.
// plugins booted from `main.tsx` asynchronously) trigger a re-render of the
// workbench shell without each consumer rolling its own polling.
const contributionListeners = new Set<() => void>();
let contributionVersion = 0;
const fireContributionsChanged = (): void => {
  contributionVersion += 1;
  for (const fn of contributionListeners) fn();
};

const parseScheme = (uri: EditorUri): string | null => {
  const idx = uri.indexOf("://");
  return idx > 0 ? uri.slice(0, idx) : null;
};

export const workbenchRegistry = {
  registerActivity(contribution: ActivityContribution): void {
    activities.set(contribution.id, contribution);
    fireContributionsChanged();
  },
  registerView(contribution: ViewContribution): void {
    views.set(contribution.id, contribution);
    fireContributionsChanged();
  },
  registerEditorType(contribution: EditorTypeContribution): void {
    editorTypes.set(contribution.scheme, contribution);
    fireContributionsChanged();
  },
  registerFeatureHost(contribution: FeatureHostContribution): void {
    hosts.set(contribution.id, contribution);
    fireContributionsChanged();
  },

  subscribe(listener: () => void): () => void {
    contributionListeners.add(listener);
    return () => contributionListeners.delete(listener);
  },
  getVersion(): number {
    return contributionVersion;
  },

  activities(): ReadonlyArray<ActivityContribution> {
    return [...activities.values()].sort((a, b) => a.order - b.order);
  },
  getActivity(id: ActivityId): ActivityContribution | null {
    return activities.get(id) ?? null;
  },

  views(): ReadonlyArray<ViewContribution> {
    return [...views.values()];
  },
  getView(id: ViewId): ViewContribution | null {
    return views.get(id) ?? null;
  },
  // Vues à une `DockLocation` donnée, filtrées par l'éligibilité contextuelle
  // (activity + whenEditor). Utilisé par le reconciler pour ordonner les
  // ajouts dans un groupe d'ancrage donné.
  viewsForLocation(
    location: DockLocation,
    context: ViewQueryContext,
  ): ReadonlyArray<ViewContribution> {
    return [...views.values()].filter((v) => {
      if (getViewLocation(v) !== location) return false;
      if (v.whenEditor && !v.whenEditor(context.editor)) return false;
      if (v.activity && v.activity !== context.activity) return false;
      return true;
    });
  },
  // Vues *éligibles* dans le contexte courant, toutes locations confondues.
  // Utilisé par le reconciler pour calculer `desiredViews` (cf. spec §2).
  eligibleViews(context: ViewQueryContext): ReadonlyArray<ViewContribution> {
    return [...views.values()].filter((v) => isViewEligible(v, context));
  },

  editorTypes(): ReadonlyArray<EditorTypeContribution> {
    return [...editorTypes.values()];
  },
  editorTypeFor(uri: EditorUri): EditorTypeContribution | null {
    const scheme = parseScheme(uri);
    if (!scheme) return null;
    return editorTypes.get(scheme) ?? null;
  },
  // Lookup by the contribution's `id` (not its scheme). Editor types are
  // primarily keyed by scheme for URI resolution, but `pickPrimaryView`
  // (spec §2.3) needs to reach `defaultPrimaryView` from the active editor's
  // `typeId`. Linear scan — fine given the handful of registered editor types.
  getEditorTypeById(typeId: string): EditorTypeContribution | null {
    for (const t of editorTypes.values()) {
      if (t.id === typeId) return t;
    }
    return null;
  },

  hosts(): ReadonlyArray<FeatureHostContribution> {
    return [...hosts.values()];
  },
} as const;

export type WorkbenchRegistry = typeof workbenchRegistry;
