import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { Brain, Sparkles } from "lucide-react";
import type {
  LlmSessionEvent,
  StepExecutionView,
} from "../../domain/workflow/types";
import type { ToolResultTurn, ToolUseTurn, Usage } from "../../domain/chat";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { ExpandableCard } from "@/components/ui/expandable-card";
import { PageHeader } from "@/components/ui/page-header";
import {
  ScrollArea,
  type ScrollAreaHandle,
} from "@/components/ui/scroll-area";
import ChatMessage from "../features/chat/ChatMessage";
import ChatToolRow from "../features/chat/ChatToolRow";
import HumanGatePanel from "./HumanGatePanel";
import UsageBadge from "./UsageBadge";
import { WORKFLOW_STATUS_TONE } from "./StatusBadge";
import { useT } from "@/ui/i18n";

type Props = {
  exec: StepExecutionView;
  events: ReadonlyArray<LlmSessionEvent>;
  loadSession: (stepExecId: string) => Promise<void>;
  showHumanGate: boolean;
  loopTargetStepId: string | null;
  onValidate: () => void;
  onRequestAdjustments: () => void;
  pastExecutions: ReadonlyArray<{
    exec: StepExecutionView;
    events: ReadonlyArray<LlmSessionEvent>;
  }>;
};

const statusLabelKey = (s: StepExecutionView["status"]): string => {
  switch (s) {
    case "pending": return "llm.sessionPanel.statusPending";
    case "running": return "llm.sessionPanel.statusRunning";
    case "awaitingHuman": return "llm.sessionPanel.statusAwaitingHuman";
    case "awaitingChild": return "llm.sessionPanel.statusAwaitingChild";
    case "validated": return "llm.sessionPanel.statusValidated";
    case "looped": return "llm.sessionPanel.statusLooped";
    case "failed": return "llm.sessionPanel.statusFailed";
    case "skipped": return "llm.sessionPanel.statusSkipped";
    case "superseded": return "llm.sessionPanel.statusSuperseded";
  }
};

type Block =
  | { kind: "session_start"; key: string; model: string }
  | { kind: "assistant"; key: string; text: string }
  | { kind: "tool_use"; key: string; turn: ToolUseTurn }
  | { kind: "tool_result"; key: string; turn: ToolResultTurn }
  | { kind: "thinking"; key: string; text: string }
  | { kind: "context_usage"; key: string; usage: Usage }
  | {
      kind: "result";
      key: string;
      tokensIn: number;
      tokensOut: number;
      cacheCreate?: number;
      cacheRead?: number;
      costUsd?: number;
      latencyMs: number;
    };

const buildBlocks = (events: ReadonlyArray<LlmSessionEvent>): Block[] => {
  const blocks: Block[] = [];
  let assistantOpen = false;
  for (const ev of events) {
    const p = ev.payload;
    const k = `e-${ev.seq}`;
    if (p.type === "text-delta") {
      const last = blocks[blocks.length - 1];
      if (assistantOpen && last && last.kind === "assistant") {
        last.text += p.text;
      } else {
        blocks.push({ kind: "assistant", key: k, text: p.text });
        assistantOpen = true;
      }
      continue;
    }
    assistantOpen = false;
    if (p.type === "assistant-message-end") {
      if (p.usage) {
        blocks.push({ kind: "context_usage", key: k, usage: p.usage });
      }
      continue;
    }
    switch (p.type) {
      case "session-start":
        blocks.push({ kind: "session_start", key: k, model: p.model });
        break;
      case "tool-use":
        blocks.push({
          kind: "tool_use",
          key: k,
          turn: {
            role: "tool_use",
            id: p.toolUseId,
            name: p.name,
            input: p.input,
          },
        });
        break;
      case "tool-result":
        blocks.push({
          kind: "tool_result",
          key: k,
          turn: {
            role: "tool_result",
            tool_use_id: p.toolUseId,
            content: p.content,
            is_error: p.isError,
          },
        });
        break;
      case "thinking":
        blocks.push({ kind: "thinking", key: k, text: p.text });
        break;
      case "result":
        blocks.push({
          kind: "result",
          key: k,
          tokensIn: p.tokensIn,
          tokensOut: p.tokensOut,
          cacheCreate: p.cacheCreate,
          cacheRead: p.cacheRead,
          costUsd: p.costUsd,
          latencyMs: p.latencyMs,
        });
        break;
    }
  }
  return blocks;
};

const ThinkingCard = ({ text }: { text: string }) => {
  const t = useT();
  return (
    <ExpandableCard
      accent="warning"
      maxBodyHeight={400}
      header={
        <>
          <Brain className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium italic text-muted-foreground">
            {t("llm.sessionPanel.thinking")}
          </span>
        </>
      }
    >
      <pre className="m-0 whitespace-pre-wrap break-words px-2.5 py-2 font-mono text-xs italic leading-snug text-muted-foreground">
        {text}
      </pre>
    </ExpandableCard>
  );
};

const Dot = ({ delay }: { delay: string }) => (
  <span
    className="size-1.5 animate-bounce rounded-full bg-muted-foreground"
    style={{ animationDelay: delay }}
  />
);

const TypingBubble = () => (
  <div className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-2">
    <Dot delay="-0.32s" />
    <Dot delay="-0.16s" />
    <Dot delay="0s" />
  </div>
);

const SessionTimeline = ({
  events,
  loading,
}: {
  events: ReadonlyArray<LlmSessionEvent>;
  loading: boolean;
}) => {
  const t = useT();
  const blocks = useMemo(() => buildBlocks(events), [events]);

  // Apparie chaque tool_result à son tool_use (même id) pour les fusionner dans
  // une seule pill `ChatToolRow`, à l'identique de la chatbox globale
  // (cf. ChatConversation). Les tool_result orphelins restent rendus seuls.
  const { resultByCallId, toolUseIds } = useMemo(() => {
    const results = new Map<string, { content: unknown; isError: boolean }>();
    const uses = new Set<string>();
    for (const b of blocks) {
      if (b.kind === "tool_result") {
        results.set(b.turn.tool_use_id, {
          content: b.turn.content,
          isError: b.turn.is_error ?? false,
        });
      } else if (b.kind === "tool_use") {
        uses.add(b.turn.id);
      }
    }
    return { resultByCallId: results, toolUseIds: uses };
  }, [blocks]);

  if (events.length === 0 && !loading) return null;

  // Le dernier segment assistant est celui qui streame encore tant que le run
  // tourne (son texte grandit en place via text-delta). On garde le
  // `TypingBubble` uniquement quand le dernier bloc n'est pas un message
  // assistant (ex. on attend la suite après un tool_result).
  let lastAssistantIdx = -1;
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].kind === "assistant") {
      lastAssistantIdx = i;
      break;
    }
  }
  const lastBlock = blocks[blocks.length - 1];
  const showTyping = loading && (!lastBlock || lastBlock.kind !== "assistant");

  return (
    <div className="space-y-3 px-3 py-3">
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "session_start":
            return (
              <div key={b.key} className="flex justify-center py-1">
                <Badge tone="neutral" size="sm" font="mono">
                  <Sparkles className="size-3" />
                  <span>{t("llm.sessionPanel.session", { model: b.model })}</span>
                </Badge>
              </div>
            );
          case "assistant":
            return (
              <ChatMessage
                key={b.key}
                role="assistant"
                text={b.text}
                streaming={loading && i === lastAssistantIdx}
              />
            );
          case "tool_use": {
            const result = resultByCallId.get(b.turn.id);
            const status = result
              ? result.isError
                ? "errored"
                : "completed"
              : loading
                ? "running"
                : "completed";
            return (
              <ChatToolRow
                key={b.key}
                toolCallId={b.turn.id}
                name={b.turn.name}
                input={b.turn.input}
                status={status}
                result={result}
              />
            );
          }
          case "tool_result":
            // Fusionné dans la pill de son tool_use ci-dessus ; rendu seul
            // uniquement s'il est orphelin (aucun tool_use correspondant).
            if (toolUseIds.has(b.turn.tool_use_id)) return null;
            return (
              <ChatToolRow
                key={b.key}
                toolCallId={b.turn.tool_use_id}
                name={t("llm.sessionPanel.orphanResult")}
                input={undefined}
                status={b.turn.is_error ? "errored" : "completed"}
                result={{
                  content: b.turn.content,
                  isError: b.turn.is_error ?? false,
                }}
              />
            );
          case "thinking":
            return <ThinkingCard key={b.key} text={b.text} />;
          case "context_usage":
            return (
              <div
                key={b.key}
                className="-my-1.5 flex w-full items-center justify-end"
              >
                <UsageBadge usage={b.usage} label={t("llm.sessionPanel.ctxLabel")} />
              </div>
            );
          case "result": {
            const usage: Usage = {
              input: b.tokensIn,
              output: b.tokensOut,
              cacheCreate: b.cacheCreate,
              cacheRead: b.cacheRead,
            };
            return (
              <div
                key={b.key}
                className="mt-1 flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-2xs text-muted-foreground"
              >
                <span className="font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                  {t("llm.sessionPanel.runComplete")}
                </span>
                <UsageBadge usage={usage} />
                <span>{t("llm.sessionPanel.latency", { ms: b.latencyMs })}</span>
                {b.costUsd !== undefined && (
                  <span>{t("llm.sessionPanel.cost", { cost: b.costUsd.toFixed(4) })}</span>
                )}
              </div>
            );
          }
        }
      })}
      {showTyping && (
        <div className="flex w-full justify-start">
          <TypingBubble />
        </div>
      )}
    </div>
  );
};

const LlmSessionPanel = ({
  exec,
  events,
  loadSession,
  showHumanGate,
  loopTargetStepId,
  onValidate,
  onRequestAdjustments,
  pastExecutions,
}: Props) => {
  const t = useT();
  const scrollRef = useRef<ScrollAreaHandle | null>(null);

  // `pastExecutions` is a fresh array reference on every parent render, so we
  // depend on a stable serialization of its IDs to avoid a feedback loop:
  // each `loadSession` setState would otherwise re-render the parent, recompute
  // pastExecutions, and re-fire the effect — Radix ScrollArea's portal commits
  // get interrupted mid-flight and throw NotFoundError on insertBefore.
  const pastExecIdsKey = pastExecutions.map((p) => p.exec.id).join("|");
  useEffect(() => {
    void loadSession(exec.id);
    for (const id of pastExecIdsKey ? pastExecIdsKey.split("|") : []) {
      void loadSession(id);
    }
  }, [exec.id, pastExecIdsKey, loadSession]);

  // Depend on `events` ref (not `events.length`) so we follow text growth
  // inside a coalesced segment — segment length doesn't change but the array
  // reference does on every batch flush. Updates are already throttled to one
  // per frame upstream (rAF batch in `useWorkflow`), so this stays at most
  // ~60Hz.
  useLayoutEffect(() => {
    const viewport = scrollRef.current?.viewport;
    if (viewport && exec.status === "running") {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [events, exec.status]);

  const header = (
    <PageHeader
      size="sm"
      title={exec.stepId}
      trailing={
        <Badge tone={WORKFLOW_STATUS_TONE[exec.status]} className="text-2xs">
          {t(statusLabelKey(exec.status))}
        </Badge>
      }
      actions={
        <div className="flex items-center gap-2 font-mono text-2xs text-muted-foreground">
          <span>{t("llm.sessionPanel.exec", { id: exec.id.slice(0, 8) })}</span>
          {exec.outputArtifact && (
            <span>
              {t("llm.sessionPanel.artifact", {
                id: exec.outputArtifact.slice(0, 8),
              })}
            </span>
          )}
        </div>
      }
    />
  );

  if (exec.status === "failed") {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        {header}
        <ScrollArea className="flex min-h-0 flex-1 flex-col text-left">
          <div className="p-4">
            <Callout tone="danger">
              <pre className="m-0 whitespace-pre-wrap font-mono text-xs">
                {exec.error ?? t("llm.sessionPanel.unknownError")}
              </pre>
            </Callout>
          </div>
        </ScrollArea>
      </div>
    );
  }

  if (exec.status === "pending") {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        {header}
        <EmptyState
          icon={<Sparkles className="size-5" />}
          description={t("llm.sessionPanel.pendingStart")}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {header}
      <ScrollArea
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col text-left"
      >
        {pastExecutions.map((p, i) => (
          <div key={p.exec.id} className="border-b border-border/60">
            <div className="flex items-baseline gap-2 border-y border-border/40 bg-muted/40 px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-primary">
              <span className="shrink-0">
                {t("llm.sessionPanel.iteration", { n: i + 1 })}
              </span>
              {p.exec.humanFeedback ? (
                <span className="truncate font-normal normal-case text-muted-foreground">
                  {t("llm.sessionPanel.feedback", {
                    text:
                      p.exec.humanFeedback.summary ||
                      t("llm.sessionPanel.commentCount", {
                        count: p.exec.humanFeedback.comments.length,
                      }),
                  })}
                </span>
              ) : null}
            </div>
            {p.events.length > 0 ? (
              <SessionTimeline events={p.events} loading={false} />
            ) : (
              <div className="px-3 py-2 text-xs italic text-muted-foreground">
                {t("llm.sessionPanel.noBufferedEvents")}
              </div>
            )}
          </div>
        ))}
        {pastExecutions.length > 0 && (
          <div className="border-y border-border/40 bg-muted/40 px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-primary">
            {t("llm.sessionPanel.iteration", { n: pastExecutions.length + 1 })}
          </div>
        )}
        <SessionTimeline
          events={events}
          loading={exec.status === "running"}
        />
      </ScrollArea>
      {showHumanGate && (
        <HumanGatePanel
          stepExecId={exec.id}
          loopTargetStepId={loopTargetStepId}
          onValidate={onValidate}
          onRequestAdjustments={onRequestAdjustments}
        />
      )}
    </div>
  );
};

export default LlmSessionPanel;
