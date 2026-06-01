/**
 * Read-only viewer rendering an artifact with a left gutter of line numbers,
 * GitHub-style. Supports drafting line-anchored comments:
 *  - hover a line to see a `+` button in the gutter
 *  - drag in the gutter to span a multi-line range
 *  - click `+` to open an inline composer beneath the selected lines
 *
 * The component is purely presentational: it owns no persistence. It calls
 * `onAddComment` / `onRemoveComment` so the parent (HumanGatePanel) keeps the
 * draft in its own state — nothing is sent until the user submits the review.
 *
 * Line numbers are 1-indexed and resolved against `content` as-is. The caller
 * MUST pass the exact artifact content (no prettify, no re-serialize) so the
 * anchors stay valid when re-rendered server-side from the same content.
 */
import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "../../components/ui/button";
import { Callout } from "../../components/ui/callout";
import { ScrollArea } from "../../components/ui/scroll-area";
import { Textarea } from "../../components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import type { ReviewAnchorView, ReviewCommentView } from "../../domain/workflow/types";

type Props = {
  content: string;
  comments: ReadonlyArray<ReviewCommentView>;
  /** When false, hides composer affordances (used for read-only review playback). */
  editable?: boolean;
  onAddComment?: (anchor: ReviewAnchorView, body: string) => void;
  onRemoveComment?: (index: number) => void;
};

type DraftRange = { startLine: number; endLine: number } | null;

const normalizeRange = (a: number, b: number): { startLine: number; endLine: number } => ({
  startLine: Math.min(a, b),
  endLine: Math.max(a, b),
});

const ReviewArtifactViewer = ({
  content,
  comments,
  editable = true,
  onAddComment,
  onRemoveComment,
}: Props) => {
  const lines = useMemo(() => content.split("\n"), [content]);
  const [hoverLine, setHoverLine] = useState<number | null>(null);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const [composer, setComposer] = useState<{
    anchor: { startLine: number; endLine: number };
    body: string;
  } | null>(null);

  const dragRangeRef = useRef<DraftRange>(null);

  const dragRange: DraftRange =
    dragStart !== null && dragEnd !== null ? normalizeRange(dragStart, dragEnd) : null;

  const commentsByEndLine = useMemo(() => {
    const map = new Map<number, { comment: ReviewCommentView; index: number }[]>();
    comments.forEach((comment, index) => {
      const end = comment.anchor.endLine;
      const arr = map.get(end) ?? [];
      arr.push({ comment, index });
      map.set(end, arr);
    });
    return map;
  }, [comments]);

  const composerLine = composer ? composer.anchor.endLine : null;

  const handleGutterMouseDown = (line: number) => {
    if (!editable) return;
    setDragStart(line);
    setDragEnd(line);
    dragRangeRef.current = { startLine: line, endLine: line };
  };

  const handleGutterMouseEnter = (line: number) => {
    setHoverLine(line);
    if (dragStart !== null) {
      setDragEnd(line);
      dragRangeRef.current = normalizeRange(dragStart, line);
    }
  };

  const handleGutterMouseUp = () => {
    if (dragStart === null) return;
    const range = dragRangeRef.current;
    setDragStart(null);
    setDragEnd(null);
    dragRangeRef.current = null;
    if (range) {
      setComposer({ anchor: range, body: "" });
    }
  };

  const handlePlusClick = (line: number) => {
    setComposer({ anchor: { startLine: line, endLine: line }, body: "" });
  };

  const cancelComposer = () => setComposer(null);

  const submitComposer = () => {
    if (!composer) return;
    const trimmed = composer.body.trim();
    if (!trimmed) return;
    onAddComment?.(composer.anchor, trimmed);
    setComposer(null);
  };

  return (
    <ScrollArea
      className="flex min-h-0 flex-1 flex-col bg-muted/10 font-mono text-xs"
      onMouseUp={handleGutterMouseUp}
      onMouseLeave={() => {
        setHoverLine(null);
        if (dragStart !== null) handleGutterMouseUp();
      }}
    >
      <div className="flex flex-col">
        {lines.map((text, i) => {
          const lineNum = i + 1;
          const isInDrag =
            dragRange !== null &&
            lineNum >= dragRange.startLine &&
            lineNum <= dragRange.endLine;
          const isHovered = hoverLine === lineNum && dragStart === null;
          const lineComments = commentsByEndLine.get(lineNum) ?? [];

          return (
            <div key={lineNum} className="flex flex-col">
              <div
                className={cn(
                  "group flex w-full select-none items-stretch",
                  isInDrag && "bg-primary/10",
                )}
              >
                <div
                  className={cn(
                    "relative flex w-12 shrink-0 cursor-pointer items-center justify-end gap-1 border-r border-border bg-muted/30 px-2 text-right text-muted-foreground",
                    isInDrag && "bg-primary/20 text-primary",
                  )}
                  onMouseDown={() => handleGutterMouseDown(lineNum)}
                  onMouseEnter={() => handleGutterMouseEnter(lineNum)}
                >
                  {editable && isHovered ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            size="icon-xs"
                            aria-label="Ajouter un commentaire"
                            className="absolute -left-1 top-1/2 z-10 size-4 -translate-y-1/2 rounded text-2xs font-bold leading-none shadow"
                            onMouseDown={(ev) => {
                              ev.preventDefault();
                              ev.stopPropagation();
                            }}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              handlePlusClick(lineNum);
                            }}
                          >
                            +
                          </Button>
                        }
                      />
                      <TooltipContent>Ajouter un commentaire</TooltipContent>
                    </Tooltip>
                  ) : null}
                  <span>{lineNum}</span>
                </div>
                <pre className="flex-1 whitespace-pre px-3 py-0.5">
                  {text.length === 0 ? " " : text}
                </pre>
              </div>

              {lineComments.length > 0 ? (
                <Callout
                  tone="warning"
                  icon={null}
                  className="ml-12 gap-0 rounded-none border-0 border-l-2 px-3 py-2 font-sans [&_[data-slot=callout-icon]]:hidden"
                >
                  <div className="flex flex-col gap-1">
                    {lineComments.map(({ comment, index }) => (
                      <div
                        key={index}
                        className="flex items-start justify-between gap-3"
                      >
                        <div className="flex flex-col gap-0.5">
                          <div className="text-2xs uppercase tracking-wide opacity-70">
                            {comment.anchor.startLine === comment.anchor.endLine
                              ? `L${comment.anchor.startLine}`
                              : `L${comment.anchor.startLine}-L${comment.anchor.endLine}`}
                          </div>
                          <div className="whitespace-pre-wrap text-xs text-foreground">
                            {comment.body}
                          </div>
                        </div>
                        {editable && onRemoveComment ? (
                          <Button
                            variant="ghost"
                            size="xs"
                            className="px-1 text-2xs text-muted-foreground hover:bg-transparent hover:text-destructive"
                            onClick={() => onRemoveComment(index)}
                          >
                            Supprimer
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </Callout>
              ) : null}

              {editable && composer && composerLine === lineNum ? (
                <div className="ml-12 flex flex-col gap-2 border-l-2 border-primary/40 bg-primary/5 px-3 py-2">
                  <div className="text-2xs uppercase tracking-wide text-muted-foreground">
                    {composer.anchor.startLine === composer.anchor.endLine
                      ? `L${composer.anchor.startLine}`
                      : `L${composer.anchor.startLine}-L${composer.anchor.endLine}`}
                  </div>
                  <Textarea
                    autoFocus
                    className="min-h-[80px] font-sans text-xs"
                    placeholder="Commentaire…"
                    value={composer.body}
                    onChange={(e) =>
                      setComposer((prev) =>
                        prev ? { ...prev, body: e.target.value } : prev,
                      )
                    }
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={composer.body.trim().length === 0}
                      onClick={submitComposer}
                    >
                      Ajouter
                    </Button>
                    <Button size="sm" variant="outline" onClick={cancelComposer}>
                      Annuler
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
};

export default ReviewArtifactViewer;
