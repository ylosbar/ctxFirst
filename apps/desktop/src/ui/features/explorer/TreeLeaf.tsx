import { useDraggable } from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ResourceKind } from "../../../domain/explorer/folder";
import type { TreeLeafNode } from "./types";

export type LeafDragData = {
  readonly kind: "leaf";
  readonly resourceKind: ResourceKind;
  readonly resourceId: string;
};

type Props = {
  readonly node: TreeLeafNode;
  readonly isOpen: boolean;
  readonly isActive: boolean;
  readonly depth: number;
  readonly onPick: () => void;
  readonly showSubtitle?: boolean;
};

const TreeLeaf = ({
  node,
  isOpen,
  isActive,
  depth,
  onPick,
  showSubtitle = true,
}: Props) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `leaf:${node.resourceKind}:${node.resourceId}`,
    data: {
      kind: "leaf",
      resourceKind: node.resourceKind,
      resourceId: node.resourceId,
    } satisfies LeafDragData,
  });
  const hasDescription = showSubtitle && Boolean(node.description);
  return (
    <div ref={setNodeRef}>
    <Button
      variant="ghost"
      onClick={onPick}
      style={{ paddingInlineStart: 8 + depth * 12 }}
      className={cn(
        "group/leaf w-full justify-start gap-1.5 rounded-none px-2 text-xs font-normal",
        hasDescription ? "h-auto py-1 items-start" : "h-7",
        isActive
          ? "bg-gradient-to-r from-primary/40 via-primary/20 to-transparent text-foreground hover:from-primary/45 hover:via-primary/25 hover:to-transparent hover:text-foreground"
          : "hover:bg-accent/40 hover:text-foreground",
        isOpen && !isActive && "text-foreground",
        isDragging && "opacity-40",
      )}
      {...attributes}
      {...listeners}
      aria-pressed={isActive}
    >
      <span
        aria-hidden
        className={cn("h-3.5 w-3.5 shrink-0", hasDescription && "mt-0.5")}
      />
      {node.leading ?? (
        <span
          aria-hidden
          className={cn("size-3.5 shrink-0", hasDescription && "mt-0.5")}
        />
      )}
      {hasDescription ? (
        <div className="flex min-w-0 flex-1 flex-col items-stretch text-left">
          <div className="w-full truncate">{node.label}</div>
          <div className="w-full truncate text-2xs text-muted-foreground">
            {node.description}
          </div>
        </div>
      ) : (
        <span className="truncate">{node.label}</span>
      )}
    </Button>
    </div>
  );
};

export default TreeLeaf;
