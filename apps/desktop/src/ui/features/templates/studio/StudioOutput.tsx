import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Callout } from "@/components/ui/callout";
import { useT } from "@/ui/i18n";
import { ArtifactInlineView } from "../../../components/ArtifactView";
import type {
  ArtifactContentView,
  DebugStepResultView,
} from "../../../../domain/workflow/types";
import type { StudioRunState } from "./studio-state";

type Props = {
  state: StudioRunState;
};

const StudioOutput = ({ state }: Props) => {
  if (state.status === "idle") {
    return null;
  }
  if (state.status === "running") {
    return <RunningView startedAt={state.startedAt} />;
  }
  return <DoneView result={state.result} durationMs={state.durationMs} />;
};

const RunningView = ({ startedAt }: { startedAt: number }) => {
  const t = useT();
  const [elapsed, setElapsed] = useState(() =>
    Math.max(0, Date.now() - startedAt),
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      setElapsed(Math.max(0, Date.now() - startedAt));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [startedAt]);

  return (
    <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
      <Loader2 className="size-3.5 animate-spin" />
      <span>
        {t("templates.studio.output.running", {
          seconds: Math.round(elapsed / 1000),
        })}
      </span>
    </div>
  );
};

const DoneView = ({
  result,
  durationMs,
}: {
  result: DebugStepResultView;
  durationMs: number;
}) => {
  const t = useT();
  if (result.kind === "error") {
    return (
      <div className="px-3">
        <Callout tone="danger" title={t("templates.studio.output.errorTitle")}>
          <code className="font-mono text-xs">{result.message}</code>
        </Callout>
      </div>
    );
  }

  if (result.kind === "awaiting-human") {
    return (
      <div className="px-3">
        <Callout
          tone="info"
          title={t("templates.studio.output.awaitingHumanTitle")}
        >
          {t("templates.studio.output.awaitingHumanBody")}{" "}
          <code className="font-mono">{result.actorRole}</code>.
        </Callout>
      </div>
    );
  }

  if (result.kind === "workspace-set") {
    return (
      <div className="px-3">
        <Callout tone="info" title={t("templates.studio.output.cwdTitle")}>
          <code className="font-mono text-xs">{result.cwd}</code>{" "}
          {t("templates.studio.output.cwdBody")}
        </Callout>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3">
      <div className="shrink-0 text-2xs uppercase tracking-wide text-muted-foreground">
        {t("templates.studio.output.resultSummary", {
          seconds: (durationMs / 1000).toFixed(1),
          count: result.artifacts.length,
        })}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {result.artifacts.map((artifact, index) => {
          const view: ArtifactContentView = {
            meta: {
              id: "",
              kind: artifact.kind,
              hash: "",
              storageRef: "",
              metadata: artifact.metadata,
              createdAt: "",
            },
            content: artifact.content,
          };
          return (
            <div
              key={`${artifact.port}-${index}`}
              className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border"
            >
              <ArtifactInlineView title={artifact.port} view={view} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StudioOutput;
