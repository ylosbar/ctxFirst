# Analyse perf — Explorateur de runs

La chaîne de données est : événements workflow → (re)fetch → builders purs → rendu d'arbres non virtualisés. 7 problèmes notables, dont 3 à fort impact. Classés par sévérité.

---

## 🔴 P1 — Refetch complet de la timeline à *chaque* événement, sans coalescing

[useWorkflow.ts:242-250](../apps/desktop/src/ui/hooks/useWorkflow.ts#L242-L250)

```ts
const handleEvent = (evt: WfEvent) => {
  if (evt.instanceId !== instanceId) return;
  refreshTimeline(instanceId)...  // ← IPC getWorkflowTimeline + setInstance, à chaque event
};
```

C'est l'asymétrie la plus coûteuse : les deltas de session sont batchés via `requestAnimationFrame` ([useWorkflow.ts:162](../apps/desktop/src/ui/hooks/useWorkflow.ts#L162)) et la liste est debouncée 150 ms, **mais le refetch timeline ne l'est pas**. Pendant un run actif, chaque `StepStarted`/`StepValidated`/etc. déclenche un round-trip IPC qui récupère **toute** la timeline + un `setInstance` + reconstruction complète + re-render. Sur un run avec beaucoup d'exécutions (boucles), c'est un O(n) re-fetch déclenché en rafale.

**Fix** : debouncer/coalescer `refreshTimeline` (comme les 150 ms ailleurs), idéalement avec un refetch incrémental plutôt que la timeline entière.

---

## 🔴 P2 — Reconstruction intégrale toutes les secondes via le tick `nowMs`

[RunTimelineView.tsx:78-91](../apps/desktop/src/ui/features/runs/RunTimelineView.tsx#L78-L91) et [RunStatsView.tsx:21-47](../apps/desktop/src/ui/features/runs/RunStatsView.tsx#L21-L47)

```ts
const nowMs = useTickingNow(tickInterval); // 1000ms tant que running/awaitingHuman
const model = useMemo(() => buildTimeline({ instance, template, nowMs }), [ctx, nowMs]);
```

`nowMs` change chaque seconde → invalide le `useMemo` → `buildTimeline` retraverse **toutes** les exécutions (`map` + `sort` + construction d'arbre, [build-timeline.ts:102-185](../apps/desktop/src/ui/features/runs/build-timeline.ts#L102-L185)) → `model.nodes` devient une nouvelle référence → le `items` flatten ([RunTimelineView.tsx:346-350](../apps/desktop/src/ui/features/runs/RunTimelineView.tsx#L346-L350)) recompute → **toutes les lignes se reconcilent**. Tout ça pour avancer la durée de la **seule** ligne in-progress. Idem côté `RunStatsView` (`buildStepStats` + Gantt + TokenChart rebâtis 1×/s).

**Fix** : sortir `nowMs` du builder lourd. Construire le modèle structurel à partir de `instance`/`template` seulement, puis appliquer l'« elapsed live » uniquement aux lignes in-progress au rendu (calcul trivial), ou ne recalculer que leur durée.

---

## 🔴 P3 — Aucune virtualisation des listes longues

`TimelineTree` rend `items.map(...)` dans un `<ol>` ([RunTimelineView.tsx:383-446](../apps/desktop/src/ui/features/runs/RunTimelineView.tsx#L383-L446)) et `RunsView` rend tous les groupes/items ([RunsView.tsx:478-507](../apps/desktop/src/ui/features/runs/RunsView.tsx#L478-L507)) — uniquement dans une `ScrollArea` (radix, qui ne virtualise pas). Un run avec boucles à N itérations = N lignes DOM toutes montées. Combiné à P2, c'est un reconcile complet 1×/s. Aucune virtualisation (`react-virtual`/`react-window`) n'existe dans le code.

**Fix** : virtualiser (`@tanstack/react-virtual`) le `<ol>` de la timeline et la liste de runs.

---

## 🟠 P4 — `useMemo(model)` dépend du `ctx` entier au lieu de `instance`/`template`

[RunTimelineView.tsx:91](../apps/desktop/src/ui/features/runs/RunTimelineView.tsx#L91) — deps `[ctx, nowMs]`. Or `ctx` (le `contextValue`) est un objet recréé à quasiment chaque event (voir P5). Du coup `buildTimeline` se relance aussi sur des changements qui n'affectent pas la structure (changement de sélection, état de gate…). Devrait dépendre de `ctx.instance` et `ctx.template` spécifiquement.

---

## 🟠 P5 — Amplification fan-out via `contextValue`

[useRunPanelData.ts:200-247](../apps/desktop/src/ui/features/runs/useRunPanelData.ts#L200-L247) : un seul update d'instance → `contextValue` reconstruit (18 deps) → publié dans `run-panel-store` → les **5 zones** (timeline, graph, iterations, artifact, stats) consomment via `useRunPanelContext` et **rebâtissent chacune leur propre modèle dérivé**. Donnée + sélection + callbacks sont mélangées dans un seul objet, donc tout changement re-render tout. Découper data / sélection / actions (ou des sélecteurs plus fins) permettrait aux zones de bail-out.

---

## 🟠 P6 — Lignes de `RunsView` non mémoïsées + callbacks inline

[RunsView.tsx:478-503](../apps/desktop/src/ui/features/runs/RunsView.tsx#L478-L503) : `isActive`/`isOpen`/`pick` recréés par groupe à chaque render, et `onPin`/`onUnpin`/`onExport`/`onDelete` passés en arrow inline à chaque `RunRow`. `RunRow` (récursif) n'est pas `React.memo`, et monte un `RunLeafMenu` (menu contextuel) par ligne. Donc chaque re-render de `RunsView` (tick 30 s, changement de store, frappe de recherche) re-render tout l'arbre sans bail-out possible.

**Fix** : `React.memo(RunRow)` + stabiliser les callbacks (`useCallback`).

---

## 🟠 P7 — Double fetch de la liste complète sur chaque event

Deux abonnés indépendants rafraîchissent **toute** la liste d'instances sur chaque rafale d'events (les deux debouncés 150 ms) :
- [RunsBootstrap.tsx:29-33](../apps/desktop/src/ui/features/runs/RunsBootstrap.tsx#L29-L33) → `services.listInstances()` → store zustand `instancesById` (consommé par `RunsToaster` + `RunTabRenderer`).
- [WorkflowEventsBridge.tsx:38](../apps/desktop/src/ui/query/WorkflowEventsBridge.tsx#L38) → invalide `["instances"]` → `useInstanceList` (react-query, source de `RunsView` + `OverviewEditor`) refetch.

Deux `listInstances()` IPC + deux parsings, en parallèle, pour la même donnée. Unifiable (faire lire `RunsToaster`/`RunTabRenderer` depuis react-query et supprimer la boucle de fetch de `RunsBootstrap`).

---

## 🟡 Mineur

- **P8** — `collapsibleKeys` fait une passe `flattenNodes` supplémentaire sur tout l'arbre (collapsed vide) en plus du flatten réel `items` → deux traversées par changement de modèle ([RunTimelineView.tsx:319-336](../apps/desktop/src/ui/features/runs/RunTimelineView.tsx#L319-L336)). Dérivable de la passe `items` unique.

---

## Priorisation

| # | Impact | Effort | Quand ça mord |
|---|--------|--------|---------------|
| P1 | 🔴 fort | moyen | run actif, beaucoup d'events |
| P2 | 🔴 fort | moyen | run running/awaitingHuman (tick 1 s) |
| P3 | 🔴 fort | moyen | runs longs / boucles à N itérations |
| P4 | 🟠 | faible | quick win |
| P6 | 🟠 | faible | quick win |
| P5 | 🟠 | élevé | refactor contextValue |
| P7 | 🟠 | moyen | dédup fetch |

**Combo le plus rentable** : P2 + P4 (sortir `nowMs` du builder, deps fines) supprime la reconstruction 1 Hz ; puis P3 (virtualisation) pour les runs longs ; puis P1 (coalescing du refetch timeline) pour les runs très actifs. Les trois sont indépendants.
