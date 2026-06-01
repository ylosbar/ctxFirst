import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import Button from "@/components/ui/button";
import Checkbox from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

type Props = {
  toolCallId: string;
  toolName: string;
  args: unknown;
  onRespond: (
    toolCallId: string,
    approved: boolean,
    opts?: { always?: boolean },
  ) => Promise<void>;
};

const formatArgs = (args: unknown): string => {
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
};

const MAX_ARGS_LEN = 1200;

const L = {
  heading: "Autorisation requise",
  prefix: "Le chat veut exécuter",
  argsLabel: "avec ces arguments :",
  always: "Toujours autoriser (session)",
  deny: "Refuser",
  approve: "Autoriser",
};

const ChatToolConfirmRow = ({ toolCallId, toolName, args, onRespond }: Props) => {
  const [always, setAlways] = useState(false);
  const [busy, setBusy] = useState(false);
  const formatted = formatArgs(args);
  const truncated =
    formatted.length > MAX_ARGS_LEN
      ? `${formatted.slice(0, MAX_ARGS_LEN)}\n[... tronqué]`
      : formatted;

  const handle = async (approved: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      await onRespond(toolCallId, approved, approved ? { always } : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
        <ShieldAlert className="size-4" />
        {L.heading}
      </div>
      <p className="mb-2 text-xs text-muted-foreground">
        {L.prefix}{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">
          {toolName}
        </code>{" "}
        {L.argsLabel}
      </p>
      <ScrollArea className="mb-3 max-h-48 rounded bg-muted">
        <pre className="px-2 py-1.5 text-xs">{truncated}</pre>
      </ScrollArea>
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={always}
            onCheckedChange={(v) => setAlways(v)}
            disabled={busy}
            aria-label={L.always}
          />
          {L.always}
        </label>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handle(false)}
            disabled={busy}
          >
            {L.deny}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => void handle(true)}
            disabled={busy}
          >
            {L.approve}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChatToolConfirmRow;
