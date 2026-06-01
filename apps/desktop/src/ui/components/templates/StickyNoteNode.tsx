import {
  createContext,
  useContext,
  type ChangeEvent,
  type PointerEvent,
} from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { GripHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useT } from "../../i18n";

export type StickyNoteNodeData = {
  /** Contenu brut du textarea. */
  text: string;
  /** Clé de palette future ; un seul thème ("yellow") en v1. */
  color?: string;
};

type StickyNoteActions = {
  onTextChange: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  /** Programme une sauvegarde après un resize (NodeResizer ne déclenche pas le drag-stop). */
  onResizeEnd: (id: string) => void;
  /** Flush immédiat (blur du textarea) pour ne pas perdre la dernière frappe au unmount. */
  onCommit: () => void;
  /** Mode lecture de run : note visible mais non éditable. */
  readOnly: boolean;
};

const StickyNoteActionsContext = createContext<StickyNoteActions | null>(null);

export const StickyNoteActionsProvider = StickyNoteActionsContext.Provider;

const useStickyNoteActions = (): StickyNoteActions | null =>
  useContext(StickyNoteActionsContext);

const STICKY_MIN_WIDTH = 120;
const STICKY_MIN_HEIGHT = 80;

const StickyNoteNode = ({ id, data, selected }: NodeProps) => {
  const t = useT();
  const actions = useStickyNoteActions();
  const d = data as StickyNoteNodeData;
  const readOnly = actions?.readOnly ?? false;

  const onChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    actions?.onTextChange(id, e.target.value);
  };

  // Empêche le drag de la note quand on clique dans le textarea pour
  // positionner le curseur. Le déplacement passe par la barre de poignée.
  const stopDrag = (e: PointerEvent) => e.stopPropagation();

  return (
    <div className="group/note relative flex h-full w-full flex-col overflow-hidden rounded border border-amber-300/70 bg-amber-100 shadow-sm transition-shadow dark:border-amber-500/40 dark:bg-amber-200/90">
      {!readOnly ? (
        <NodeResizer
          minWidth={STICKY_MIN_WIDTH}
          minHeight={STICKY_MIN_HEIGHT}
          isVisible={selected}
          color="var(--primary)"
          lineStyle={{ borderWidth: 1 }}
          handleStyle={{ width: 8, height: 8, borderRadius: 2 }}
          onResizeEnd={() => actions?.onResizeEnd(id)}
        />
      ) : null}
      {/* Barre de poignée : seule zone draggable (pas de `nodrag`). Le textarea
          remplit le reste et est `nodrag` pour rester éditable au clic. */}
      <div
        className={cn(
          "flex h-5 shrink-0 items-center justify-between bg-amber-200/70 px-1 dark:bg-amber-300/50",
          readOnly ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        )}
      >
        <GripHorizontal
          aria-hidden
          className="size-3 text-amber-900/40"
          strokeWidth={2}
        />
        {!readOnly ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("template.editor.stickyNote.delete")}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    actions?.onDelete(id);
                  }}
                  className="nodrag inline-flex size-4 text-amber-900/50 opacity-60 transition-opacity hover:bg-destructive/20 hover:text-destructive hover:opacity-100 [&_svg]:size-3"
                >
                  <X strokeWidth={2.5} />
                </Button>
              }
            />
            <TooltipContent>
              {t("template.editor.stickyNote.delete")}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <Textarea
        value={d.text}
        onChange={onChange}
        onPointerDown={stopDrag}
        onBlur={() => actions?.onCommit()}
        readOnly={readOnly}
        placeholder={t("template.editor.stickyNote.placeholder")}
        aria-label={t("template.editor.stickyNote.ariaLabel")}
        className="nodrag min-h-0 w-full flex-1 resize-none whitespace-pre-wrap border-transparent bg-transparent px-2 py-1.5 text-xs leading-snug text-amber-950 [field-sizing:fixed] placeholder:text-amber-900/40 focus-visible:border-transparent focus-visible:ring-0 dark:text-amber-950"
      />
    </div>
  );
};

export default StickyNoteNode;
