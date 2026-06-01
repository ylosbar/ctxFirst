import { useCallback, useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown, { type Components, defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { useWorkbench } from "../../workbench/WorkbenchProvider";
import { workbenchRegistry } from "../../workbench/registry";
import { classifyChatLink } from "./chat-link";

type ChatMessageProps = {
  role: "user" | "assistant";
  text: string;
  /** ISO timestamp de l'entrée — affiché sous le message. */
  timestamp?: string;
  /** True quand le contenu est encore en train de streamer (assistant uniquement). */
  streaming?: boolean;
};

const formatTime = (iso?: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
};

// `react-markdown` sanitize les URLs via `defaultUrlTransform` et n'autorise
// qu'une whitelist de protocoles (http, https, mailto…). Nos schémas d'éditeur
// (`template://…`, `run://…`, …) seraient réduits à une chaîne vide. On les
// laisse passer intacts et on délègue le reste au sanitizer par défaut (préserve
// la protection XSS sur `javascript:` & co.).
const chatUrlTransform = (url: string): string =>
  workbenchRegistry.editorTypeFor(url) != null ? url : defaultUrlTransform(url);

const ChatMessage = ({ role, text, timestamp, streaming }: ChatMessageProps) => {
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);
  const wb = useWorkbench();

  // Typographie déléguée à `.markdown-body` (App.css) — single source of truth
  // partagée avec le reste de l'app. Seul l'`<a>` est surchargé : les URI
  // d'éditeur internes ouvrent la ressource dans le workbench, les liens
  // externes passent par le `setWindowOpenHandler` d'Electron (`target="_blank"`),
  // sinon ils seraient bloqués par le guard `will-navigate`.
  // useMemo : les messages en streaming re-render à chaque delta ; on évite de
  // reconstruire l'objet `components` (et de re-parser le Markdown) à chaque tick.
  const markdownComponents = useMemo<Components>(
    () => ({
      a: ({ children, href }) => {
        const link = classifyChatLink(href);
        if (link.kind === "internal") {
          return (
            <a
              href={link.uri}
              data-internal-link
              onClick={(e) => {
                e.preventDefault();
                wb.openEditor(link.uri, { focus: true });
              }}
            >
              {children}
            </a>
          );
        }
        return (
          <a href={link.href} target="_blank" rel="noreferrer">
            {children}
          </a>
        );
      },
    }),
    [wb],
  );

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  const time = formatTime(timestamp);

  return (
    <div
      className={cn(
        "group flex w-full flex-col",
        isUser ? "items-end" : "items-start",
      )}
    >
      <div
        className={cn(
          "min-w-0 overflow-hidden",
          isUser
            ? "max-w-[88%] rounded-2xl bg-muted px-3 py-2 text-sm text-foreground"
            : "w-full text-foreground",
        )}
        data-streaming={streaming || undefined}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap wrap-anywhere">{text}</div>
        ) : (
          <div className="markdown-body markdown-body--compact wrap-anywhere">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks]}
              components={markdownComponents}
              urlTransform={chatUrlTransform}
            >
              {text || (streaming ? "▍" : "")}
            </ReactMarkdown>
          </div>
        )}
      </div>
      {!streaming ? (
        <div
          className={cn(
            "mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100",
            isUser ? "flex-row-reverse pr-0.5" : "pl-0.5",
          )}
        >
          {time ? <span className="tabular-nums">{time}</span> : null}
          <button
            type="button"
            onClick={handleCopy}
            title="Copier le message"
            aria-label="Copier le message"
            className="rounded p-0.5 hover:bg-accent hover:text-foreground"
          >
            {copied ? (
              <Check className="size-3" />
            ) : (
              <Copy className="size-3" />
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default ChatMessage;
