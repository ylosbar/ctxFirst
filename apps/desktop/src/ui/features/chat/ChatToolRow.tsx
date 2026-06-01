import { ArrowLeft, ArrowRight, Check, ChevronRight, Loader2, Wrench, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCollapsibleState } from "@/components/ui/use-collapsible-state";
import JsonView from "@/ui/components/JsonView";

/**
 * Affiche un appel d'outil et son résultat comme une seule pill repliable.
 * `result` est absent tant que le tool tourne (status "running") ; il arrive
 * en même temps que la promotion de `status` en completed/errored. Le
 * toolCallId et le JSON brut restent accessibles (input toujours dans le
 * corps, id dans l'en-tête) pour le debug.
 */
type Props = {
  toolCallId: string;
  name: string;
  input: unknown;
  status: "running" | "completed" | "errored";
  result?: { content: unknown; isError: boolean };
};

const L = {
  arguments: "Arguments",
  result: "Résultat",
  running: "Exécution en cours…",
  error: "erreur",
};

const StatusIndicator = ({ status }: { status: Props["status"] }) => {
  if (status === "running") {
    return <Loader2 className="size-3 animate-spin text-muted-foreground" />;
  }
  if (status === "errored") {
    return (
      <span className="flex items-center gap-1 text-destructive">
        <X className="size-3" />
        {L.error}
      </span>
    );
  }
  return <Check className="size-3 text-emerald-600" />;
};

const ChatToolRow = ({ toolCallId, name, input, status, result }: Props) => {
  const { open, toggle } = useCollapsibleState({ defaultOpen: false });

  return (
    <div data-status={status} className="w-full text-xs">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="group flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-muted/60"
      >
        <ChevronRight
          className={cn(
            "size-3 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
        <Wrench className="size-3 shrink-0 text-violet-500" />
        <span className="truncate font-mono text-xs font-semibold text-foreground">
          {name}
        </span>
        <span className="truncate font-mono text-2xs text-muted-foreground/60">
          {toolCallId}
        </span>
        <span className="ml-auto flex shrink-0 items-center text-2xs">
          <StatusIndicator status={status} />
        </span>
      </button>
      {open && (
        <div className="ml-3 space-y-1.5 border-l border-border/50 py-1 pl-3 pr-1">
          <div>
            <div className="flex items-center gap-1 px-0.5 pb-0.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              <ArrowRight className="size-3" />
              {L.arguments}
            </div>
            <div className="overflow-hidden rounded-md border border-border/60 bg-muted/30">
              <JsonView value={input} />
            </div>
          </div>
          {result ? (
            <div>
              <div
                className={cn(
                  "flex items-center gap-1 px-0.5 pb-0.5 text-2xs font-medium uppercase tracking-wide",
                  result.isError ? "text-destructive" : "text-muted-foreground",
                )}
              >
                <ArrowLeft className="size-3" />
                {L.result}
              </div>
              <div
                className={cn(
                  "overflow-hidden rounded-md border bg-muted/30",
                  result.isError ? "border-destructive/40" : "border-border/60",
                )}
              >
                <JsonView value={result.content} />
              </div>
            </div>
          ) : status === "running" ? (
            <p className="px-0.5 text-2xs italic text-muted-foreground">
              {L.running}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default ChatToolRow;
