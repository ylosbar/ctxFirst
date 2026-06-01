import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Callout } from "@/components/ui/callout";
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
      <span>Exécution en cours… ({Math.round(elapsed / 1000)}s)</span>
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
  if (result.kind === "error") {
    return (
      <div className="px-3">
        <Callout tone="danger" title="Erreur d'exécution">
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
          title="La node demande une intervention humaine"
        >
          Pas de support en studio (testez-la dans un vrai run). Rôle attendu :{" "}
          <code className="font-mono">{result.actorRole}</code>.
        </Callout>
      </div>
    );
  }

  if (result.kind === "workspace-set") {
    return (
      <div className="px-3">
        <Callout tone="info" title="La node a défini un cwd">
          <code className="font-mono text-xs">{result.cwd}</code> — effet ignoré
          en studio (les nodes suivantes ne sont pas exécutées).
        </Callout>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3">
      <div className="shrink-0 text-2xs uppercase tracking-wide text-muted-foreground">
        Résultat ({(durationMs / 1000).toFixed(1)}s) ·{" "}
        {result.artifacts.length} artifact
        {result.artifacts.length > 1 ? "s" : ""}
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
