import { useEffect, type ReactNode } from "react";
import { ChevronRight, Folder, FolderOpen } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useCollapsibleState } from "@/components/ui/use-collapsible-state";
import { useExplorerBulk } from "../../stores/explorer-view-store";

type Props = {
  readonly name: string;
  readonly count: number;
  readonly hasChildren: boolean;
  readonly depth: number;
  readonly persistKey: string;
  readonly forceOpen?: boolean;
  readonly defaultOpen?: boolean;
  readonly children: ReactNode;
};

/**
 * Read-only sibling of {@link TreeFolderUser} for system-provided groups (e.g.
 * the `BuiltIns` bucket): same collapsible row visuals, but no drag-and-drop,
 * no rename input, and no context menu — synthetic folders aren't user-owned.
 * Still honours the toolbar's expand-all / collapse-all command and the
 * search `forceOpen` override so it behaves like the rest of the tree.
 */
const TreeFolderStatic = ({
  name,
  count,
  hasChildren,
  depth,
  persistKey,
  forceOpen,
  defaultOpen = false,
  children,
}: Props) => {
  const { open, toggle, setOpen } = useCollapsibleState({
    persistKey,
    defaultOpen,
    controlled: forceOpen ? true : undefined,
  });

  const bulk = useExplorerBulk();
  useEffect(() => {
    if (bulk) setOpen(bulk.open);
  }, [bulk, setOpen]);

  const Icon = open ? FolderOpen : Folder;

  return (
    <div className="flex flex-col">
      <div className="group/folder relative flex h-7 items-stretch hover:bg-accent/40">
        <button
          type="button"
          onClick={hasChildren ? toggle : undefined}
          aria-expanded={hasChildren ? open : undefined}
          style={{ paddingInlineStart: 8 + depth * 12 }}
          className="flex min-w-0 flex-1 items-center gap-1.5 pr-1 text-left text-xs font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          <span className="truncate">{name}</span>
        </button>
        <div className="flex shrink-0 items-center gap-1 pr-2">
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-2xs font-medium text-muted-foreground tabular-nums">
            {count}
          </span>
        </div>
      </div>
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

export default TreeFolderStatic;
