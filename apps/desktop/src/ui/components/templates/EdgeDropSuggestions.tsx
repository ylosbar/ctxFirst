import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useT } from "../../i18n";
import type { StepKindMeta } from "./step-kinds";
import { portKindsLabel } from "./port-color";

export type EdgeDropSuggestion = {
  kind: StepKindMeta;
  /**
   * Output kind the new step will produce, once its default config is
   * resolved against the runner registry. `null` when the runner emits no
   * artifact (e.g. `workspace.set`, `human.gate`).
   */
  resolvedOutputKind: string | null;
  /**
   * Kinds the new step's first input accepts (resolved spec, post-config).
   * Empty when the runner has no inputs.
   */
  resolvedInputKinds: ReadonlyArray<string>;
};

type Props = {
  suggestions: ReadonlyArray<EdgeDropSuggestion>;
  onSelect: (suggestion: EdgeDropSuggestion) => void;
  onClose: () => void;
};

const suggestionKey = (s: EdgeDropSuggestion) =>
  `${s.kind.id}::${s.resolvedInputKinds.join("|")}::${s.resolvedOutputKind ?? ""}`;

const EdgeDropSuggestions = ({ suggestions, onSelect, onClose }: Props) => {
  const t = useT();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return suggestions;
    return suggestions.filter((s) => {
      const haystack = [
        s.kind.label,
        s.kind.id,
        s.resolvedInputKinds.join(" "),
        s.resolvedOutputKind ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [suggestions, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, suggestions]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = filtered[activeIndex];
      if (pick) onSelect(pick);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onPointerDown={(e) => {
        // Backdrop click closes; clicks on the box itself stop here.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-96 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg"
      >
        <Input
          ref={inputRef}
          className="rounded-none border-0 border-b py-1.5"
          placeholder={t(
            "template.canvas.edgeDropSuggestions.searchPlaceholder",
          )}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <ScrollArea className="max-h-96">
          <ul className="py-1">
            {filtered.length === 0 ? (
              <li className="px-2 py-2 text-xs text-muted-foreground">
                {t("template.canvas.edgeDropSuggestions.noMatch")}
              </li>
            ) : (
              filtered.map((s, i) => {
                const selected = i === activeIndex;
                return (
                  <li key={suggestionKey(s)}>
                    <div
                      role="option"
                      aria-selected={selected}
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => onSelect(s)}
                      className={cn(
                        "flex cursor-pointer flex-col items-start gap-0.5 px-2 py-1.5 text-left",
                        selected
                          ? "bg-accent text-accent-foreground"
                          : "text-foreground",
                      )}
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="text-sm font-medium">
                          {s.kind.label}
                        </span>
                        <span className="font-mono text-2xs text-muted-foreground">
                          {s.resolvedInputKinds.length > 0
                            ? `${portKindsLabel(s.resolvedInputKinds)} →`
                            : "→"}{" "}
                          {s.resolvedOutputKind ?? "—"}
                        </span>
                      </div>
                      <span className="text-2xs text-muted-foreground">
                        {s.kind.description}
                      </span>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </ScrollArea>
      </div>
    </div>
  );
};

export default EdgeDropSuggestions;
