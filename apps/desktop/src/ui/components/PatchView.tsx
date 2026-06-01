import { ScrollArea } from "@/components/ui/scroll-area";
import { DIFF_STATUS_STYLE } from "@/components/ui/step-status";

type Props = {
  content: string;
  className?: string;
};

type LineKind = "add" | "del" | "hunk" | "file" | "meta" | "context";

const classifyLine = (line: string): LineKind => {
  if (line.startsWith("+++") || line.startsWith("---")) return "file";
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  if (
    line.startsWith("diff ") ||
    line.startsWith("index ") ||
    line.startsWith("new file ") ||
    line.startsWith("deleted file ") ||
    line.startsWith("similarity ") ||
    line.startsWith("rename ") ||
    line.startsWith("Binary ")
  ) {
    return "meta";
  }
  return "context";
};

const lineClass = (kind: LineKind): string => {
  switch (kind) {
    case "add":
      return DIFF_STATUS_STYLE.added;
    case "del":
      return DIFF_STATUS_STYLE.removed;
    case "hunk":
      return DIFF_STATUS_STYLE.hunk;
    case "file":
      return "bg-muted/60 font-semibold text-foreground";
    case "meta":
      return "bg-muted/40 text-muted-foreground";
    case "context":
      return "text-foreground/80";
  }
};

export const looksLikeUnifiedDiff = (content: string): boolean => {
  if (!content) return false;
  const head = content.slice(0, 4096);
  if (head.startsWith("diff --git ")) return true;
  const hasFileHeader = /^---\s.+\n\+\+\+\s.+/m.test(head);
  const hasHunk = /^@@\s.+@@/m.test(head);
  return hasFileHeader && hasHunk;
};

const PatchView = ({ content, className }: Props) => {
  const lines = content.split("\n");
  return (
    <ScrollArea
      className={`min-h-0 flex-1 bg-muted/20 ${className ?? ""}`}
    >
      <pre className="m-0 p-0 font-mono text-xs leading-5">
      {lines.map((line, i) => {
        const kind = classifyLine(line);
        return (
          <div
            key={i}
            className={`whitespace-pre-wrap px-4 ${lineClass(kind)}`}
          >
            {line.length === 0 ? " " : line}
          </div>
        );
      })}
      </pre>
    </ScrollArea>
  );
};

export default PatchView;
