import { Menu } from "@base-ui/react/menu";
import { motion } from "motion/react";
import { Boxes, ChevronRight, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  STEP_KIND_CATALOG,
  type StepKindMeta,
} from "../../components/templates/step-kinds";
import useNodeSpecs from "../../hooks/useNodeSpecs";
import { STEP_KIND_DND_MIME } from "./picker-dnd";
import { useT } from "@/ui/i18n";

type Props = {
  readonly disabled: boolean;
  readonly onPick: (kind: StepKindMeta) => void;
};

const itemClass =
  "group flex w-full cursor-grab items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none active:cursor-grabbing data-[highlighted]:bg-muted";

const NodesPickerMenu = ({ disabled, onPick }: Props) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const specs = useNodeSpecs();

  const items = useMemo(
    () =>
      STEP_KIND_CATALOG.map((kind) => ({
        kind,
        description:
          specs.status === "ready"
            ? specs.byKind.get(kind.id)?.description ?? kind.description
            : kind.description,
      })),
    [specs],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      ({ kind, description }) =>
        kind.label.toLowerCase().includes(q) ||
        kind.id.toLowerCase().includes(q) ||
        description.toLowerCase().includes(q),
    );
  }, [items, query]);

  const grouped = useMemo(
    () =>
      CATEGORY_ORDER.map((category) => ({
        category,
        label: CATEGORY_LABEL[category],
        icon: CATEGORY_ICON[category],
        items: filtered.filter(({ kind }) => kind.category === category),
      })).filter((group) => group.items.length > 0),
    [filtered],
  );

  const isSearching = query.trim().length > 0;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery("");
  };

  // Menu.Popup is designed for keyboard menu navigation and does not autofocus
  // a nested input — push focus there on open so the user can type immediately.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const pickAndClose = (kind: StepKindMeta) => {
    onPick(kind);
    handleOpenChange(false);
  };

  const handleDragStart = (
    kind: StepKindMeta,
    event: DragEvent<Element>,
  ) => {
    event.dataTransfer.setData(STEP_KIND_DND_MIME, kind.id);
    event.dataTransfer.effectAllowed = "copy";
    // Le menu démontant les boutons pendant `dragstart` peut faire annuler le
    // drag par Chromium ; on retarde la fermeture d'un tick pour laisser le
    // browser capturer le drag image avant que la source ne disparaisse.
    requestAnimationFrame(() => handleOpenChange(false));
  };

  const renderItem = ({
    kind,
    description,
  }: {
    kind: StepKindMeta;
    description: string;
  }) => (
    <Menu.Item
      key={kind.id}
      className={itemClass}
      onClick={() => pickAndClose(kind)}
      draggable
      onDragStart={(event) => handleDragStart(kind, event)}
    >
      <Plus className="mt-[3px] h-3 w-3 shrink-0 text-muted-foreground/70 transition-colors group-hover:text-foreground" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs font-medium leading-tight text-foreground">
          {kind.label}
        </span>
        <span className="line-clamp-2 text-2xs leading-snug text-muted-foreground">
          {description}
        </span>
      </span>
    </Menu.Item>
  );

  return (
    <Menu.Root open={open} onOpenChange={handleOpenChange} modal={false}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Menu.Trigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t("templates.nodesPicker.addAriaLabel")}
                  disabled={disabled}
                >
                  <Boxes />
                  {t("templates.nodesPicker.label")}
                </Button>
              }
            />
          }
        />
        <TooltipContent>{t("templates.nodesPicker.addTooltip")}</TooltipContent>
      </Tooltip>
      <Menu.Portal>
        <Menu.Positioner align="start" sideOffset={4} className="z-50">
          <Menu.Popup
            render={
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                style={{ transformOrigin: "top left" }}
              />
            }
            className="z-50 w-80 overflow-hidden rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-md outline-none"
          >
            <div className="p-1">
              <SearchInput
                ref={inputRef}
                placeholder={t("templates.nodesPicker.searchPlaceholder")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  // Prevent Menu.Root's typeahead from swallowing letters
                  // typed into the search input.
                  e.stopPropagation();
                }}
                aria-label={t("templates.nodesPicker.searchAriaLabel")}
              />
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-1 pb-1">
              {isSearching
                ? filtered.map((entry) => renderItem(entry))
                : grouped.map((group) => {
                    const CategoryIcon = group.icon;
                    return (
                      <Menu.SubmenuRoot key={group.category}>
                        <Menu.SubmenuTrigger
                          openOnHover
                          delay={0}
                          className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none data-[highlighted]:bg-muted data-[popup-open]:bg-muted"
                        >
                          <span className="flex items-center gap-2">
                            <CategoryIcon className="size-4 text-muted-foreground" />
                            <span className="text-xs font-medium text-foreground">
                              {group.label}
                            </span>
                          </span>
                          <span className="flex items-center gap-1 text-muted-foreground/60">
                            <span className="tabular-nums text-2xs">
                              {group.items.length}
                            </span>
                            <ChevronRight className="size-3.5" />
                          </span>
                        </Menu.SubmenuTrigger>
                        <Menu.Portal>
                          <Menu.Positioner
                            side="right"
                            align="start"
                            sideOffset={4}
                            className="z-50"
                          >
                            <Menu.Popup className="z-50 w-72 overflow-hidden rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-md outline-none">
                              <div className="max-h-[60vh] overflow-y-auto">
                                {group.items.map((entry) => renderItem(entry))}
                              </div>
                            </Menu.Popup>
                          </Menu.Positioner>
                        </Menu.Portal>
                      </Menu.SubmenuRoot>
                    );
                  })}
              {filtered.length === 0 ? (
                <EmptyState
                  className="flex-none p-2"
                  description={t("templates.nodesPicker.noResults", { query })}
                />
              ) : null}
            </div>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
};

export default NodesPickerMenu;
