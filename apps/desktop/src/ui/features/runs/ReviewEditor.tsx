import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Textarea } from "@/components/ui/textarea";
import { extractDisplayableContent } from "@/lib/artifact-display";
import { findLoopTarget } from "../../components/wf-layout";
import useWorkflow from "../../hooks/useWorkflow";
import ReviewArtifactViewer from "../../components/ReviewArtifactViewer";
import type {
  ReviewAnchorView,
  ReviewCommentView,
} from "../../../domain/workflow/types";
import type { EditorUri, WorkbenchApi } from "../../workbench/types";
import { useRegisterReviewEditor } from "../../stores/review-editor-store";
import { useT } from "../../i18n";
import { parseReviewUri } from "./review-uri";

type Props = {
  readonly uri: EditorUri;
  readonly api: WorkbenchApi;
};

const Centered = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
    {children}
  </div>
);

/**
 * Full-tab review surface for a human gate: shows the step output line-by-line,
 * collects inline comments + a global summary, then loops the step back with
 * that feedback. Self-contained — re-derives its data from the run instance via
 * `useWorkflow`, so it survives reloads and detaching into its own window.
 */
const ReviewEditor = ({ uri, api }: Props) => {
  const t = useT();
  const parsed = parseReviewUri(uri);
  const instanceId = parsed?.instanceId ?? null;
  const { instance, template, requestLoop, loadArtifact, loading } =
    useWorkflow(instanceId);

  const exec = useMemo(
    () =>
      instance && parsed
        ? instance.executions.find((e) => e.id === parsed.stepExecId) ?? null
        : null,
    [instance, parsed],
  );

  const loopTargetStepId = findLoopTarget(template, exec?.stepId);

  const [summary, setSummary] = useState("");
  const [draftComments, setDraftComments] = useState<ReviewCommentView[]>([]);
  const [content, setContent] = useState<string | null>(null);

  const artifactId = exec
    ? exec.outputArtifact ?? exec.inputArtifacts[0] ?? null
    : null;

  useEffect(() => {
    if (!artifactId) {
      setContent(null);
      return;
    }
    let cancelled = false;
    loadArtifact(artifactId)
      .then((c) => {
        if (!cancelled) setContent(c);
      })
      .catch((err) => {
         
        console.error("[wf:ui] loadArtifact for review failed", err);
      });
    return () => {
      cancelled = true;
    };
  }, [artifactId, loadArtifact]);

  const displayableContent = useMemo(
    () => (content !== null ? extractDisplayableContent(content) : null),
    [content],
  );

  // Publish the live review state so the global chatbox picks it up as context
  // while this editor is the active one (see runs.review `getChatContext`).
  const handle = useMemo(
    () =>
      instance && exec
        ? {
            instanceId: instance.id,
            stepExecId: exec.id,
            stepId: exec.stepId,
            templateRef: `${instance.templateId}@${instance.templateVersion}`,
            templateName: template?.name ?? null,
            loopTargetStepId,
            content: displayableContent,
            summary,
            draftComments,
          }
        : null,
    [
      instance,
      exec,
      template,
      loopTargetStepId,
      displayableContent,
      summary,
      draftComments,
    ],
  );
  useRegisterReviewEditor(uri, handle);

  const close = useCallback(() => api.closeEditor(uri), [api, uri]);

  const addComment = (anchor: ReviewAnchorView, body: string) => {
    setDraftComments((prev) => [...prev, { anchor, body }]);
  };

  const removeComment = (index: number) => {
    setDraftComments((prev) => prev.filter((_, i) => i !== index));
  };

  const canSubmit = summary.trim().length > 0 || draftComments.length > 0;

  const submit = useCallback(() => {
    if (!exec || !loopTargetStepId) return;
    void requestLoop(exec.id, loopTargetStepId, summary, draftComments);
    close();
  }, [exec, loopTargetStepId, requestLoop, summary, draftComments, close]);

  if (!parsed) {
    return (
      <Centered>
        {t("runs.review.invalidUri")} {uri}
      </Centered>
    );
  }

  if (!exec) {
    if (loading || !instance)
      return <Centered>{t("common.loading")}</Centered>;
    return (
      <Centered>
        <div className="flex flex-col items-center gap-3">
          <span>{t("runs.review.stepGone")}</span>
          <Button size="sm" variant="outline" onClick={close}>
            {t("common.close")}
          </Button>
        </div>
      </Centered>
    );
  }

  if (exec.status !== "awaitingHuman") {
    return (
      <Centered>
        <div className="flex flex-col items-center gap-3">
          <span>{t("runs.review.notAwaiting")}</span>
          <Button size="sm" variant="outline" onClick={close}>
            {t("common.close")}
          </Button>
        </div>
      </Centered>
    );
  }

  if (!loopTargetStepId) {
    return <Centered>{t("runs.review.noLoopTarget")}</Centered>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <PageHeader
        title={`Review · étape ${exec.id.slice(0, 8)}`}
        trailing={
          <span className="text-xs text-muted-foreground">
            {t("runs.review.commentCount", { count: draftComments.length })}
          </span>
        }
      />

      <div className="flex min-h-0 flex-1 flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col border-r">
          <div className="border-b px-4 py-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("runs.review.stepOutput")}
          </div>
          {displayableContent !== null ? (
            <ReviewArtifactViewer
              content={displayableContent}
              comments={draftComments}
              onAddComment={addComment}
              onRemoveComment={removeComment}
            />
          ) : (
            <div className="px-4 py-3 text-xs text-muted-foreground">
              {t("runs.review.noArtifact")}
            </div>
          )}
        </div>

        <div className="flex w-[380px] shrink-0 flex-col gap-3 bg-muted/20 p-4">
          <div className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("runs.review.summaryLabel")}
          </div>
          <Textarea
            className="min-h-[160px] flex-1 resize-none"
            placeholder={`Résumé global pour ${loopTargetStepId}…`}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
          <div className="flex flex-col gap-2">
            <Button disabled={!canSubmit} onClick={submit}>
              {t("runs.review.submit")}
            </Button>
            <Button variant="outline" onClick={close}>
              {t("common.close")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReviewEditor;
