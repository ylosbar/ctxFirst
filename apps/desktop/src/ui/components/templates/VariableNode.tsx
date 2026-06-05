import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ArtifactKind } from "../../../domain/workflow/types";
import { portColor } from "./port-color";

export type VariableNodeData = {
  variableName: string;
  kind?: ArtifactKind;
  description?: string;
  port: string;
  mode: "produced" | "consumed";
};

const VariableNode = ({ data }: NodeProps) => {
  const d = data as unknown as VariableNodeData;
  const kinds = d.kind ? [d.kind] : ["*" as const];
  const swatch = portColor(kinds);
  const tooltip = d.description
    ? `$${d.variableName} (${d.kind ?? "?"}) — ${d.description}`
    : `$${d.variableName} (${d.kind ?? "?"})`;
  // Produced (set/write) pills sit to the right of the step, so the edge
  // arrives from the step's right output → enter the pill on its LEFT side.
  // Consumed (get/read) pills sit to the left of the step, so the edge
  // leaves toward the step's left input → exit the pill on its RIGHT side.
  const handlePosition =
    d.mode === "produced" ? Position.Left : Position.Right;
  // bg opaque (pas de backdrop-blur) : un nœud flouté = une couche de
  // compositing GPU séparée, re-rasterisée à chaque frame de pan. Multiplié par
  // tous les nœuds visibles en dézoom → "tile memory limits exceeded" (le
  // bureau transparaît car la fenêtre est transparente). Voir TemplateEditor
  // `onlyRenderVisibleElements`.
  return (
    <div
      className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-2 py-[3px] font-mono text-2xs leading-none text-foreground/85 shadow-[0_1px_2px_rgb(0_0_0/0.04)] ring-1 ring-black/[0.03] dark:ring-white/[0.04]"
      title={tooltip}
    >
      <Handle
        type={d.mode === "produced" ? "target" : "source"}
        position={handlePosition}
        isConnectable={false}
        style={{
          background: swatch,
          width: 7,
          height: 7,
          border: "1px solid var(--background)",
        }}
      />
      <span
        className="inline-block h-2 w-2 rounded-full ring-1 ring-inset ring-black/10 dark:ring-white/10"
        style={{ background: swatch }}
        aria-hidden
      />
      <span className="text-muted-foreground/70">$</span>
      <span className="font-semibold text-foreground/90">{d.variableName}</span>
    </div>
  );
};

export default memo(VariableNode);
