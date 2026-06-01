import { useEffect, useMemo, useState } from "react";
import { Check, Copy, FileX2, Package, Sparkles } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import hljs from "highlight.js/lib/core";
import jsonLang from "highlight.js/lib/languages/json";
import { extractDisplayableContent } from "@/lib/artifact-display";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState, LoadingState } from "@/components/ui/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useServices } from "../di/services-provider";
import { useT } from "@/ui/i18n";
import type {
  ArtifactContentView,
  ArtifactKind,
  ParserView,
} from "../../domain/workflow/types";
import PatchView, { looksLikeUnifiedDiff } from "./PatchView";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; view: ArtifactContentView }
  | { status: "error"; message: string };

// Tone palette for the few kinds the UI surfaces today. Plugin- and
// user-defined kinds fall through to `neutral` via the `?? "neutral"` default
// at the call site below.
const KIND_TONE: Partial<Record<ArtifactKind, NonNullable<BadgeProps["tone"]>>> = {
  LinearRef: "warning",
  "plugin:linear:Ticket@v1": "danger",
  Markdown: "neutral",
  Path: "info",
  PathList: "info",
  MarkdownList: "neutral",
};

const MARKDOWNISH_KINDS: ReadonlySet<ArtifactKind> = new Set<ArtifactKind>([
  "Markdown",
  "plugin:linear:Ticket@v1",
]);

hljs.registerLanguage("json", jsonLang);

// Many artifacts are typed `Markdown` yet actually carry a JSON payload (e.g. a
// `{ file, findings }` blob fed to a `concat.markdown` step), and
// `claude_code.invoke` steps configured with `outputKind: "Json"` emit a JSON
// document we want a human to review. We parse it up front so the renderer can
// offer both a pretty-printed/highlighted "Brut" view and a structured
// "Lisible" document view. Returns the parsed object/array, or undefined when
// `body` is not a JSON object/array (callers fall through to the markdown / raw
// renderers).
const tryParseJson = (body: string): unknown => {
  const trimmed = body.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== "object") return undefined;
  return parsed;
};

// LLM steps frequently emit a JSON payload wrapped in a fenced code block
// inside otherwise-markdown content (```json …```). When that JSON arrives
// minified on a single line, ReactMarkdown + rehype-highlight render it as one
// unreadable horizontally-scrolling line. We pretty-print the contents of every
// JSON-bearing fence up front so the block lays out across multiple lines (and
// gets the `json` language tag for highlighting) before rendering runs. Fences
// whose body is not a parseable JSON object/array are left untouched.
const prettifyJsonFences = (md: string): string =>
  md.replace(
    /(^|\n)([ \t]*)```([^\n`]*)\n([\s\S]*?)\n[ \t]*```/g,
    (match: string, lead: string, indent: string, info: string, inner: string) => {
      const lang = info.trim().toLowerCase();
      if (lang !== "" && lang !== "json") return match;
      const trimmed = inner.trim();
      if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return match;
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        return match;
      }
      if (parsed === null || typeof parsed !== "object") return match;
      const pretty = JSON.stringify(parsed, null, 2)
        .split("\n")
        .map((line) => indent + line)
        .join("\n");
      return `${lead}${indent}\`\`\`json\n${pretty}\n${indent}\`\`\``;
    },
  );

const formatTime = (iso?: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

// The `<a>` renderer routes external links through Electron's
// `setWindowOpenHandler` (`shell.openExternal`), which only fires for
// `target="_blank"`. Without it the default `<a>` would be blocked by the
// `will-navigate` guard in the main process.
const markdownComponents: Components = {
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
};

// --- "Lisible" JSON document renderer -------------------------------------
// Turns a parsed JSON value into a reviewable document: object keys become
// labelled sections, arrays become numbered cards, and multiline string values
// render as markdown (so embedded `\n` and formatting show properly instead of
// as escaped one-liners — the main reason raw pretty-printed JSON is hard to
// review). Scalars render as inline mono code.

const JsonScalar = ({ value }: { value: number | boolean | null }) => (
  <code className="rounded bg-muted/50 px-1.5 py-0.5 font-mono text-xs">
    {value === null ? "null" : String(value)}
  </code>
);

const JsonString = ({ value }: { value: string }) => {
  const t = useT();
  if (value.includes("\n")) {
    return (
      <div className="markdown-body markdown-body--doc text-sm">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={markdownComponents}
        >
          {value}
        </ReactMarkdown>
      </div>
    );
  }
  if (value.length === 0) {
    return (
      <span className="text-xs italic text-muted-foreground">
        {t("artifacts.view.empty")}
      </span>
    );
  }
  return <span className="whitespace-pre-wrap break-words text-sm">{value}</span>;
};

const JsonNode = ({ value }: { value: unknown }) => {
  const t = useT();
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return <JsonScalar value={value} />;
  }
  if (typeof value === "string") return <JsonString value={value} />;
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <span className="text-xs italic text-muted-foreground">
          {t("artifacts.view.emptyArray")}
        </span>
      );
    }
    return (
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {value.map((item, i) => (
          <li
            key={i}
            className="rounded border border-border/60 bg-muted/10 p-2.5"
          >
            <div className="mb-1.5 font-mono text-2xs text-muted-foreground">
              #{i + 1}
            </div>
            <JsonNode value={item} />
          </li>
        ))}
      </ol>
    );
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) {
    return (
      <span className="text-xs italic text-muted-foreground">
        {t("artifacts.view.emptyObject")}
      </span>
    );
  }
  return (
    <dl className="m-0 flex flex-col gap-3">
      {entries.map(([key, v]) => (
        <div key={key} className="flex flex-col gap-1">
          <dt className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            {key}
          </dt>
          <dd className="m-0 border-l-2 border-border/50 pl-3">
            <JsonNode value={v} />
          </dd>
        </div>
      ))}
    </dl>
  );
};

const JsonDocumentView = ({ value }: { value: unknown }) => (
  <div className="px-4 py-4">
    <JsonNode value={value} />
  </div>
);

const CopyButton = ({
  value,
  label,
}: {
  value: string;
  label?: string;
}) => {
  const t = useT();
  const effectiveLabel = label ?? t("common.copy");
  const [done, setDone] = useState(false);
  const handle = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setDone(true);
      window.setTimeout(() => setDone(false), 1200);
    });
  };
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handle}
            aria-label={effectiveLabel}
            className="size-5 text-muted-foreground"
          >
            {done ? <Check className="size-3" /> : <Copy className="size-3" />}
          </Button>
        }
      />
      <TooltipContent>{done ? t("common.copied") : effectiveLabel}</TooltipContent>
    </Tooltip>
  );
};

type InlineProps = {
  /** Title shown in the header (e.g. step name, port name). */
  title?: string;
  /** Optional badge displayed next to the title (e.g. "loop"). */
  badge?: React.ReactNode;
  /** Optional kind override — falls back to `view.meta.kind`. */
  kindHint?: ArtifactKind;
  /** Loaded artifact (meta + content). */
  view: ArtifactContentView;
};

type ViewMode = "raw" | "parsed";

/**
 * Pure render of an already-loaded artifact. Used by both `ArtifactView`
 * (which loads via IPC) and the Studio panel (which receives the content
 * inline from the `debugStep` result — no artifact id, no IPC).
 *
 * `ParsedArtifactView` + `ParserViewSwitch` are preserved as building blocks
 * for an ad-hoc parser inspection UI (cf. `specs/artifact-typing-overhaul.md`
 * §Pilier B) but are no longer auto-mounted: parser-as-option is gone, the
 * caller picks the parser explicitly via a future picker.
 */
export const ArtifactInlineView = ({
  title,
  badge,
  kindHint,
  view,
}: InlineProps) => {
  const t = useT();
  const body = extractDisplayableContent(view.content);
  const effectiveKind = (kindHint ?? view.meta.kind) as ArtifactKind | undefined;
  const isDiff = looksLikeUnifiedDiff(body);
  const isPath = effectiveKind === "Path";
  const parsedJson = useMemo(
    () => (isDiff || isPath ? undefined : tryParseJson(body)),
    [body, isDiff, isPath],
  );
  const jsonHtml = useMemo(
    () =>
      parsedJson === undefined
        ? null
        : hljs.highlight(JSON.stringify(parsedJson, null, 2), {
            language: "json",
          }).value,
    [parsedJson],
  );
  const [jsonMode, setJsonMode] = useState<"readable" | "raw">("readable");
  // A main-side Markdown projection (`view.renderedMarkdown`) takes precedence:
  // it's set only for kinds carrying an effective projection (plugin/user
  // `fn`/gabarit, or an embedded `renderedMarkdown`). When present we render it
  // as GFM for the "Lisible" view while the "Brut" tab keeps the original JSON
  // payload. Falls back to the static `MARKDOWNISH_KINDS` membership otherwise,
  // so plain `Markdown`/`Ticket` artifacts render as before.
  const rendered = view.renderedMarkdown;
  const hasRendered = typeof rendered === "string" && rendered.length > 0;
  const isMarkdownish =
    hasRendered ||
    (effectiveKind !== undefined && MARKDOWNISH_KINDS.has(effectiveKind));
  const markdownBody = useMemo(() => {
    const src = rendered && rendered.length > 0 ? rendered : body;
    return isMarkdownish ? prettifyJsonFences(src) : src;
  }, [body, isMarkdownish, rendered]);
  const hasId = view.meta.id.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b bg-muted/30 px-3 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {title ? (
            <span className="truncate text-xs font-medium">{title}</span>
          ) : null}
          {effectiveKind ? (
            hasId ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Badge
                      tone={KIND_TONE[effectiveKind] ?? "neutral"}
                      size="sm"
                      font="mono"
                    >
                      {effectiveKind}
                    </Badge>
                  }
                />
                <TooltipContent className="font-mono">
                  {view.meta.id}
                </TooltipContent>
              </Tooltip>
            ) : (
              <Badge
                tone={KIND_TONE[effectiveKind] ?? "neutral"}
                size="sm"
                font="mono"
              >
                {effectiveKind}
              </Badge>
            )
          ) : null}
          {badge}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {jsonHtml ? (
            <div className="flex items-center gap-0.5 rounded border border-border/60 p-0.5 text-2xs">
              <button
                type="button"
                onClick={() => setJsonMode("readable")}
                className={`rounded px-1.5 py-0.5 ${
                  jsonMode === "readable"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/40"
                }`}
              >
                {t("artifacts.view.readable")}
              </button>
              <button
                type="button"
                onClick={() => setJsonMode("raw")}
                className={`rounded px-1.5 py-0.5 ${
                  jsonMode === "raw"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/40"
                }`}
              >
                {t("artifacts.view.raw")}
              </button>
            </div>
          ) : null}
          {view.meta.createdAt ? (
            <span className="text-2xs text-muted-foreground">
              {formatTime(view.meta.createdAt)}
            </span>
          ) : null}
          {body.length > 0 ? (
            <CopyButton value={body} label={t("artifacts.view.copyContent")} />
          ) : null}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {isDiff ? (
          <PatchView content={body} />
        ) : isPath ? (
          <div className="p-4">
            <code className="block break-all rounded border bg-muted/40 px-2 py-1.5 font-mono text-xs">
              {body.trim()}
            </code>
          </div>
        ) : jsonHtml ? (
          jsonMode === "readable" ? (
            hasRendered ? (
              <div className="markdown-body markdown-body--doc mx-auto max-w-4xl px-6 py-5">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={markdownComponents}
                >
                  {markdownBody}
                </ReactMarkdown>
              </div>
            ) : (
              <JsonDocumentView value={parsedJson} />
            )
          ) : (
            <pre className="m-0 whitespace-pre bg-muted/20 p-4 font-mono text-xs leading-relaxed">
              <code
                className="hljs language-json bg-transparent p-0"
                dangerouslySetInnerHTML={{ __html: jsonHtml }}
              />
            </pre>
          )
        ) : isMarkdownish ? (
          <div className="markdown-body markdown-body--doc mx-auto max-w-4xl px-6 py-5">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={markdownComponents}
            >
              {markdownBody}
            </ReactMarkdown>
          </div>
        ) : (
          <pre className="whitespace-pre-wrap break-words bg-muted/20 p-4 font-mono text-xs">
            {body}
          </pre>
        )}
      </ScrollArea>
    </div>
  );
};

type SwitchProps = {
  mode: ViewMode;
  parser: ParserView;
  onChange: (next: ViewMode) => void;
};

export const ParserViewSwitch = ({ mode, parser, onChange }: SwitchProps) => {
  const t = useT();
  return (
    <div className="flex shrink-0 items-center gap-1 border-b bg-muted/10 px-3 py-1.5 text-2xs">
      <span className="text-muted-foreground">
        {t("artifacts.view.displayLabel")}
      </span>
      <button
        type="button"
        onClick={() => onChange("raw")}
        className={`rounded px-2 py-0.5 ${
          mode === "raw"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-muted/40"
        }`}
      >
        {t("artifacts.view.raw")}
      </button>
      <button
        type="button"
        onClick={() => onChange("parsed")}
        className={`flex items-center gap-1 rounded px-2 py-0.5 ${
          mode === "parsed"
            ? "bg-violet-500/20 text-violet-200"
            : "text-violet-300/70 hover:bg-violet-500/10"
        }`}
        title={t("artifacts.view.parserTooltip", {
          id: parser.id,
          version: parser.version,
          mode: parser.mode,
        })}
      >
        <Sparkles className="size-3" />
        <span>
          {t("artifacts.view.viaParser")}{" "}
          <span className="font-mono">
            {parser.id}@{parser.version}
          </span>
        </span>
      </button>
    </div>
  );
};

type ParsedProps = {
  parser: ParserView;
  rawContent: string;
};

type ParsedState =
  | { status: "loading" }
  | { status: "ok"; simplified: unknown; rawBytes: number; parsedBytes: number }
  | { status: "error"; message: string };

export const ParsedArtifactView = ({ parser, rawContent }: ParsedProps) => {
  const t = useT();
  const services = useServices();
  const [state, setState] = useState<ParsedState>({ status: "loading" });

  // Re-run when parser identity OR raw content changes (e.g. user switches
  // the active parser while inspecting, or picks a different step).
  const parserKey = useMemo(
    () => `${parser.id}@${parser.version}`,
    [parser.id, parser.version],
  );

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    (async () => {
      let raw: unknown;
      try {
        raw = JSON.parse(rawContent);
      } catch (err) {
        if (!cancelled)
          setState({
            status: "error",
            message: t("artifacts.view.invalidJsonPayload", {
              error: err instanceof Error ? err.message : String(err),
            }),
          });
        return;
      }
      try {
        const res = await services.runParser({
          kind: "saved",
          ref: { id: parser.id, version: parser.version },
          raw,
        });
        if (cancelled) return;
        const parsedStr = JSON.stringify(res.simplified, null, 2);
        setState({
          status: "ok",
          simplified: res.simplified,
          rawBytes: new Blob([rawContent]).size,
          parsedBytes: new Blob([parsedStr]).size,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          status: "error",
          message: t("artifacts.view.parserFailed", {
            error: err instanceof Error ? err.message : String(err),
          }),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [services, parserKey, rawContent, parser.id, parser.version, t]);

  if (state.status === "loading") {
    return (
      <LoadingState
        className="min-h-[160px]"
        label={t("artifacts.view.applyingParser")}
      />
    );
  }
  if (state.status === "error") {
    return (
      <div className="p-4">
        <Callout
          tone="warning"
          icon={<Sparkles className="size-4" />}
          title={t("artifacts.view.parserNotApplied")}
        >
          {state.message}
        </Callout>
      </div>
    );
  }
  const ratio =
    state.rawBytes > 0
      ? Math.round((1 - state.parsedBytes / state.rawBytes) * 100)
      : 0;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b bg-muted/5 px-3 py-1 text-2xs text-muted-foreground">
        {t("artifacts.view.reduction", {
          raw: state.rawBytes.toLocaleString(),
          parsed: state.parsedBytes.toLocaleString(),
        })}
        {ratio > 0 ? t("artifacts.view.reductionRatio", { ratio }) : ""}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <pre className="whitespace-pre-wrap break-words bg-muted/20 p-4 font-mono text-xs">
          {JSON.stringify(state.simplified, null, 2)}
        </pre>
      </ScrollArea>
    </div>
  );
};

type Props = {
  /** Title shown in the header (e.g. step name). */
  title?: string;
  /** ID of the artifact to render. `null` shows an empty state. */
  artifactId: string | null;
  /** Hint for the artifact kind; falls back to the loaded artifact meta. */
  kindHint?: ArtifactKind;
  /** Optional badge displayed next to the title (e.g. "loop"). */
  badge?: React.ReactNode;
  /** Optional empty state label override. */
  emptyLabel?: string;
};

const ArtifactView = ({
  title,
  artifactId,
  kindHint,
  badge,
  emptyLabel,
}: Props) => {
  const services = useServices();
  const [state, setState] = useState<LoadState>({ status: "idle" });

  useEffect(() => {
    if (!artifactId) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    services
      .getArtifact(artifactId)
      .then((view) => {
        if (!cancelled) setState({ status: "loaded", view });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
        setState({ status: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, [artifactId, services]);

  if (!artifactId) {
    return (
      <EmptyState
        icon={<Package className="size-6" />}
        title="Aucun artefact"
        description={emptyLabel ?? "Cette étape n'a pas (encore) produit d'artefact."}
      />
    );
  }

  if (state.status === "idle" || state.status === "loading") {
    return (
      <LoadingState
        className="min-h-[160px]"
        label="Chargement de l'artefact…"
      />
    );
  }

  if (state.status === "error") {
    return (
      <div className="p-4">
        <Callout
          tone="danger"
          icon={<FileX2 className="size-4" />}
          title="Impossible de charger l'artefact"
        >
          {state.message}
        </Callout>
      </div>
    );
  }

  return (
    <ArtifactInlineView
      title={title}
      badge={badge}
      kindHint={kindHint}
      view={state.view}
    />
  );
};

export default ArtifactView;
