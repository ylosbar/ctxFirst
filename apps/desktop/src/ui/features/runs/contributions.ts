import { History } from "lucide-react";
import { createElement } from "react";
import { workbenchRegistry } from "../../workbench/registry";
import { useRunPanelStore } from "../../stores/run-panel-store";
import { useReviewEditorStore } from "../../stores/review-editor-store";
import RunsBootstrap from "./RunsBootstrap";
import RunWorkspace from "./RunWorkspace";
import ReviewEditor from "./ReviewEditor";
import RunTabRenderer from "./RunTabRenderer";
import RunsOverlay from "./RunsOverlay";
import RunsView from "./RunsView";
import { instanceIdFromRunUri, RUN_URI_PREFIX } from "./run-uri";
import { parseReviewUri } from "./review-uri";

// Spec runs-dedicated-activity.md §1 : sortir les runs de l'Explorer et leur
// donner une activité dédiée. `order: 20` place l'icône entre Explorer (15) et
// Chat (50). La vue `runs.list` est *activity-bound* (cf. §4) : invisible
// quand l'activité Runs n'est pas active, ce qui évite que ses tabs cohabitent
// avec ceux de l'Explorer dans le groupe de gauche.
workbenchRegistry.registerActivity({
  id: "runs",
  title: "Runs",
  icon: History,
  defaultView: "runs.list",
  order: 20,
  route: "/runs",
});

workbenchRegistry.registerView({
  id: "runs.list",
  defaultLocation: "left",
  title: "Runs",
  icon: History,
  activity: "runs",
  priority: 50,
  render: () => createElement(RunsView),
});

workbenchRegistry.registerEditorType({
  id: "runs.viewer",
  scheme: "run",
  title: (uri) => {
    const id = instanceIdFromRunUri(uri);
    return id ? id.slice(0, 8) : "Run";
  },
  render: ({ uri }) => createElement(RunWorkspace, { uri }),
  tab: RunTabRenderer,
  // `/runs/<id>` ↔ `run://<id>`. `/runs/new` is the modal create route (owned
  // by RunsOverlay) — it maps to no editor, so `matchPath` returns null for it.
  // `toPath` strips the optional `?step=` slot (the URL form doesn't carry it).
  matchPath: (path) => {
    const m = path.match(/^\/runs\/([^/]+)$/);
    if (!m || m[1] === "new") return null;
    return `${RUN_URI_PREFIX}${decodeURIComponent(m[1])}`;
  },
  toPath: (uri) => {
    const id = instanceIdFromRunUri(uri);
    return id ? `/runs/${encodeURIComponent(id)}` : null;
  },
  getChatContext: (uri) => {
    const handle = useRunPanelStore.getState().handles.get(uri);
    if (!handle) return null;
    const { instance, template, selected, activeExec } = handle;
    const templateRef = `${instance.templateId}@${instance.templateVersion}`;
    const shortId = instance.id.slice(0, 8);
    const selectedStep = selected
      ? template?.steps.find((s) => s.id === selected.stepId) ?? null
      : null;
    return {
      scope: `run-viewer://${uri}`,
      label: `Run: ${templateRef} · ${shortId}`,
      data: {
        instanceId: instance.id,
        templateRef,
        templateName: template?.name ?? null,
        status: instance.status,
        createdAt: instance.createdAt,
        stepExecutions: instance.executions.map((e) => ({
          stepId: e.stepId,
          status: e.status,
          startedAt: e.startedAt ?? null,
          endedAt: e.endedAt ?? null,
          error: e.error ?? null,
        })),
        selectedStep: selected
          ? {
              stepId: selected.stepId,
              name: selectedStep?.name ?? null,
              status: selected.status,
              error: selected.error ?? null,
            }
          : null,
        activeStep: activeExec
          ? { stepId: activeExec.stepId, status: activeExec.status }
          : null,
        openLoops: instance.openLoops.length,
      },
    };
  },
});

workbenchRegistry.registerEditorType({
  id: "runs.review",
  scheme: "review",
  title: (uri) => {
    const parsed = parseReviewUri(uri);
    return parsed ? `Review · ${parsed.stepExecId.slice(0, 8)}` : "Review";
  },
  render: ({ uri, api }) => createElement(ReviewEditor, { uri, api }),
  getChatContext: (uri) => {
    const handle = useReviewEditorStore.getState().handles.get(uri);
    if (!handle) return null;
    const MAX_CONTENT = 12_000;
    const content =
      handle.content !== null && handle.content.length > MAX_CONTENT
        ? `${handle.content.slice(0, MAX_CONTENT)}\n…[contenu tronqué]`
        : handle.content;
    return {
      scope: `review-editor://${uri}`,
      label: `Review · ${handle.stepExecId.slice(0, 8)}`,
      data: {
        instanceId: handle.instanceId,
        stepExecId: handle.stepExecId,
        stepId: handle.stepId,
        templateRef: handle.templateRef,
        templateName: handle.templateName,
        loopTargetStepId: handle.loopTargetStepId,
        outputUnderReview: content,
        draftSummary: handle.summary,
        draftComments: handle.draftComments.map((c) => ({
          anchor: c.anchor,
          body: c.body,
        })),
      },
    };
  },
});

// Spec runs-unified-resizable-workspace.md §6.1 — Itérations / Artefact /
// Graphe / Stats ne sont plus des vues droites contextuelles séparées : elles
// sont embarquées comme zones du Run Workspace (RunWorkspace.tsx), qui rend
// l'éditeur `runs.viewer` complet. Leurs composants de rendu survivent (§6.4) ;
// seules leurs entrées de registry sont supprimées.

workbenchRegistry.registerFeatureHost({
  id: "runs",
  Provider: RunsBootstrap,
  Overlay: RunsOverlay,
});
