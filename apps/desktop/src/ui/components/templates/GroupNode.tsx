import {
  createContext,
  memo,
  useContext,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useT } from "../../i18n";

export type GroupNodeData = {
  label: string;
  /**
   * Drapeau positif uniquement pendant le tracé initial à la souris : on
   * masque alors le NodeResizer et l'input de label pour ne pas perturber
   * le drag (qui est géré par un overlay au-dessus du canvas).
   */
  isDrawing?: boolean;
};

type GroupActions = {
  onLabelChange: (id: string, label: string) => void;
  onDelete: (id: string) => void;
};

const GroupActionsContext = createContext<GroupActions | null>(null);

export const GroupActionsProvider = GroupActionsContext.Provider;

const useGroupActions = (): GroupActions | null =>
  useContext(GroupActionsContext);

const GROUP_MIN_WIDTH = 80;
const GROUP_MIN_HEIGHT = 60;

const GroupNode = ({ id, data, selected }: NodeProps) => {
  const t = useT();
  const actions = useGroupActions();
  const d = data as GroupNodeData;
  const isDrawing = Boolean(d.isDrawing);

  // Le label vit dans le store interne de React Flow, synchronisé depuis la
  // prop `nodes` seulement au layout-effect — un commit de retard sur la
  // frappe. Brancher `value` directement sur `d.label` réécrit l'input avec
  // une valeur en décalage et repositionne le caret en fin de texte (visible
  // dès qu'on édite au milieu). On rend depuis un state local mis à jour
  // synchroniquement, et on ne resynchronise que sur un changement externe
  // (chargement, undo…), en ignorant l'écho de nos propres éditions.
  const [label, setLabel] = useState(d.label);
  const lastSent = useRef(d.label);
  useEffect(() => {
    if (d.label !== lastSent.current) {
      lastSent.current = d.label;
      setLabel(d.label);
    }
  }, [d.label]);

  const onLabelChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    lastSent.current = next;
    setLabel(next);
    actions?.onLabelChange(id, next);
  };

  return (
    <div
      className={cn(
        "group/grp relative h-full w-full rounded-xl border-2 border-dashed bg-primary/[0.02] transition-colors",
        selected
          ? "border-primary/70 bg-primary/[0.04]"
          : "border-primary/30 hover:border-primary/50",
      )}
    >
      {!isDrawing ? (
        <NodeResizer
          minWidth={GROUP_MIN_WIDTH}
          minHeight={GROUP_MIN_HEIGHT}
          isVisible={selected}
          color="var(--primary)"
          lineStyle={{ borderWidth: 1 }}
          handleStyle={{ width: 8, height: 8, borderRadius: 2 }}
        />
      ) : null}
      {!isDrawing ? (
        // `nodrag` sur l'input et la croix empêche de saisir le groupe
        // quand on tape/clique dessus ; le reste de la barre reste un
        // handle de drag pratique.
        // Fond opaque (color-mix) plutôt que bg-primary/10 + backdrop-blur :
        // chaque blur sur le canvas = une couche de compositing GPU séparée,
        // re-rasterisée à chaque frame de pan → "tile memory limits exceeded"
        // en dézoom (et le bureau transparaît, fenêtre transparente).
        <div
          className="absolute -top-7 left-0 flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 ring-1 ring-primary/20"
          style={{
            background:
              "color-mix(in srgb, var(--primary) 10%, var(--background))",
          }}
        >
          <span
            aria-hidden
            className="size-1.5 rounded-full bg-primary"
          />
          <Input
            type="text"
            value={label}
            placeholder={t("template.canvas.groupNode.labelPlaceholder")}
            onChange={onLabelChange}
            className="nodrag h-5 w-auto max-w-[80%] truncate border-transparent bg-transparent px-1 text-2xs font-semibold uppercase tracking-wide text-primary placeholder:text-primary/40 focus:border-transparent focus:bg-background focus:ring-1 focus:ring-primary/40"
          />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("template.canvas.groupNode.deleteGroup")}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    actions?.onDelete(id);
                  }}
                  className="nodrag inline-flex size-4 text-foreground/50 opacity-60 transition-opacity hover:bg-destructive/20 hover:text-destructive hover:opacity-100 [&_svg]:size-3"
                >
                  <X strokeWidth={2.5} />
                </Button>
              }
            />
            <TooltipContent>{t("template.canvas.groupNode.deleteGroup")}</TooltipContent>
          </Tooltip>
        </div>
      ) : null}
    </div>
  );
};

export default memo(GroupNode);
