import { Menu } from "@base-ui/react/menu";
import { Popover } from "@base-ui/react/popover";
import { motion } from "motion/react";
import { Plus, Variable } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SearchInput } from "@/components/ui/search-input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type {
  ArtifactKind,
  TemplateVariableDraft,
} from "../../../domain/workflow/types";
import KindPreviewBlock from "../../components/artifact-kinds/KindPreviewBlock";
import { useT } from "@/ui/i18n";

type Props = {
  readonly disabled: boolean;
  readonly variables: ReadonlyArray<TemplateVariableDraft>;
  readonly onPick: (variable: TemplateVariableDraft) => void;
  readonly onRequestCreate: () => void;
};

const itemClass =
  "group flex w-full cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none data-[highlighted]:bg-muted";

const VariablesPickerMenu = ({
  disabled,
  variables,
  onPick,
  onRequestCreate,
}: Props) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return variables;
    return variables.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.kind.toLowerCase().includes(q) ||
        (v.description ?? "").toLowerCase().includes(q),
    );
  }, [variables, query]);

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

  const pickAndClose = (variable: TemplateVariableDraft) => {
    handleOpenChange(false);
    // Defer modal opening by a tick so Menu.Root finishes restoring focus to
    // the trigger before Dialog.Root captures it — avoids a focus flicker.
    requestAnimationFrame(() => onPick(variable));
  };

  const createAndClose = () => {
    handleOpenChange(false);
    requestAnimationFrame(() => onRequestCreate());
  };

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
                  aria-label={t("templates.variablesPicker.manageAriaLabel")}
                  disabled={disabled}
                >
                  <Variable />
                  {t("templates.variablesPicker.label")}
                  {variables.length > 0 ? (
                    <span className="ml-1 rounded bg-muted px-1 py-0.5 text-2xs tabular-nums text-muted-foreground">
                      {variables.length}
                    </span>
                  ) : null}
                </Button>
              }
            />
          }
        />
        <TooltipContent>
          {t("templates.variablesPicker.manageTooltip")}
        </TooltipContent>
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
                placeholder={t("templates.variablesPicker.searchPlaceholder")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  // Prevent Menu.Root's typeahead from swallowing letters
                  // typed into the search input.
                  e.stopPropagation();
                }}
                aria-label={t("templates.variablesPicker.searchAriaLabel")}
              />
            </div>
            <div className="px-1">
              <Menu.Item className={itemClass} onClick={createAndClose}>
                <Plus className="mt-[3px] h-3 w-3 shrink-0 text-muted-foreground/70 transition-colors group-hover:text-foreground" />
                <span className="text-xs font-medium leading-tight text-foreground">
                  {t("templates.variablesPicker.create")}
                </span>
              </Menu.Item>
            </div>
            <ScrollArea className="max-h-[60vh] px-1 pb-1">
              {filtered.map((variable) => (
                <Menu.Item
                  key={variable.name}
                  className={itemClass}
                  onClick={() => pickAndClose(variable)}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-mono text-xs font-medium text-foreground">
                        {variable.name}
                      </span>
                      <KindBadgePopover kind={variable.kind} />
                    </span>
                    {variable.description ? (
                      <span className="line-clamp-2 text-2xs leading-snug text-muted-foreground">
                        {variable.description}
                      </span>
                    ) : null}
                  </span>
                </Menu.Item>
              ))}
              {variables.length === 0 ? (
                <EmptyState
                  className="flex-none p-2"
                  description={t("templates.variablesPicker.empty")}
                />
              ) : filtered.length === 0 ? (
                <EmptyState
                  className="flex-none p-2"
                  description={t("templates.variablesPicker.noResults", {
                    query,
                  })}
                />
              ) : null}
            </ScrollArea>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
};

/**
 * Cliquable badge that opens a `KindPreview` popover. Wrapped in its own
 * `Popover.Root modal={false}` so it does not steal focus from the surrounding
 * `Menu.Root`; `stopPropagation` on the trigger's click stops the menu item
 * from interpreting it as "edit this variable".
 */
const KindBadgePopover = ({ kind }: { kind: ArtifactKind }) => {
  const t = useT();
  return (
    <Popover.Root modal={false}>
      <Popover.Trigger
        render={
          <span
            role="button"
            tabIndex={0}
            aria-label={t("templates.variablesPicker.viewShapeAriaLabel", {
              kind,
            })}
            className="shrink-0 cursor-help rounded bg-primary/10 px-1 py-0.5 font-mono text-2xs text-primary hover:bg-primary/20"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") e.stopPropagation();
            }}
          >
            {kind}
          </span>
        }
      />
      <Popover.Portal>
        <Popover.Positioner side="right" sideOffset={4} className="z-50">
          <Popover.Popup className="z-50 outline-none">
            <KindPreviewBlock kind={kind} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
};

export default VariablesPickerMenu;
