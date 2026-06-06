import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ChevronRight, Folder, FolderOpen } from "lucide-react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useCollapsibleState } from "@/components/ui/use-collapsible-state";
import { useExplorerBulk } from "../../stores/explorer-view-store";
import type { ReactNode } from "react";

export type FolderDragData = {
  readonly kind: "folder";
  readonly folderId: string;
  /** Folder ids that live inside this folder, used to block cycle drops. */
  readonly descendants: ReadonlySet<string>;
};

type Props = {
  readonly folderId: string;
  readonly name: string;
  readonly count: number;
  readonly hasChildren: boolean;
  readonly depth: number;
  readonly persistKey: string;
  readonly forceOpen?: boolean;
  readonly descendants: ReadonlySet<string>;
  readonly isEditing: boolean;
  readonly onStartRename: () => void;
  readonly onSubmitRename: (newName: string) => Promise<void> | void;
  readonly onCancelRename: () => void;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
};

const TreeFolderUser = ({
  folderId,
  name,
  count,
  hasChildren,
  depth,
  persistKey,
  forceOpen,
  descendants,
  isEditing,
  onStartRename: _onStartRename,
  onSubmitRename,
  onCancelRename,
  actions,
  children,
}: Props) => {
  const { open, toggle, setOpen } = useCollapsibleState({
    persistKey,
    defaultOpen: false,
    controlled: forceOpen ? true : undefined,
  });

  // React to the toolbar's "expand all / collapse all" command. The nonce
  // makes the effect re-fire on every action; `bulk` is null on first mount,
  // so the folder's own persisted state is left untouched until the user acts.
  const bulk = useExplorerBulk();
  useEffect(() => {
    if (bulk) setOpen(bulk.open);
  }, [bulk, setOpen]);

  const draggable = useDraggable({
    id: `folder:${folderId}`,
    data: {
      kind: "folder",
      folderId,
      descendants,
    } satisfies FolderDragData,
  });
  const droppable = useDroppable({
    id: `folder-drop:${folderId}`,
    data: {
      kind: "folder",
      folderId,
      descendants,
    } satisfies FolderDragData,
  });

  const active = draggable.active;
  const activeData =
    (active?.data.current as
      | { kind?: string; folderId?: string }
      | undefined) ?? undefined;
  const accepts =
    activeData !== undefined &&
    activeData.folderId !== folderId &&
    !(activeData.kind === "folder" && descendants.has(folderId));
  const isDropTarget = droppable.isOver && accepts;

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState<string>(name);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isEditing) {
      setDraft(name);
      setErrorMessage(null);
      // Defer to make sure the input is mounted before we focus.
      queueMicrotask(() => inputRef.current?.focus());
    }
  }, [isEditing, name]);

  const submit = async () => {
    const value = draft.trim();
    if (!value || value === name) {
      onCancelRename();
      return;
    }
    setSubmitting(true);
    try {
      await onSubmitRename(value);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancelRename();
    }
  };

  const Icon = open ? FolderOpen : Folder;

  return (
    <div
      ref={droppable.setNodeRef}
      data-drop-active={isDropTarget ? "true" : undefined}
      className={cn(
        "flex flex-col",
        isDropTarget && "bg-accent/30 outline outline-1 outline-accent",
      )}
    >
      <div
        ref={draggable.setNodeRef}
        className={cn(
          "group/folder relative flex h-7 items-stretch hover:bg-accent/40",
          isDropTarget && "bg-accent/60",
          draggable.isDragging && "opacity-40",
        )}
      >
        <button
          type="button"
          onClick={hasChildren ? toggle : undefined}
          aria-expanded={hasChildren ? open : undefined}
          style={{ paddingInlineStart: 8 + depth * 12 }}
          className="flex min-w-0 flex-1 items-center gap-1.5 pr-1 text-left text-xs font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
          {...(isEditing ? {} : draggable.attributes)}
          {...(isEditing ? {} : draggable.listeners)}
        >
          {hasChildren ? (
            <ChevronRight
              aria-hidden
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-90",
              )}
            />
          ) : (
            <span aria-hidden className="h-3.5 w-3.5 shrink-0" />
          )}
          <Icon
            aria-hidden
            // Dossier non vide → icône pleine (ouvert comme fermé), pour
            // signaler d'un coup d'œil qu'il contient du contenu.
            fill={count > 0 ? "currentColor" : "none"}
            className="size-3.5 shrink-0 text-muted-foreground"
          />
          {isEditing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={() => void submit()}
              onKeyDown={onKeyDown}
              disabled={submitting}
              maxLength={80}
              className="min-w-0 flex-1 rounded-sm border border-border bg-background px-1 text-xs outline-none focus:ring-1 focus:ring-ring"
            />
          ) : (
            <span className="truncate">{name}</span>
          )}
        </button>
        <div className="flex shrink-0 items-center gap-1 pr-2">
          {actions ? (
            <span className="flex items-center opacity-0 transition-opacity group-hover/folder:opacity-100 focus-within:opacity-100">
              {actions}
            </span>
          ) : null}
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-2xs font-medium text-muted-foreground tabular-nums">
            {count}
          </span>
        </div>
      </div>
      {isEditing && errorMessage ? (
        <div
          style={{ paddingInlineStart: 8 + (depth + 1) * 12 }}
          className="py-0.5 pr-2 text-2xs text-destructive"
        >
          {errorMessage}
        </div>
      ) : null}
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeInOut" }}
            className="flex flex-col overflow-hidden"
          >
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

export default TreeFolderUser;
