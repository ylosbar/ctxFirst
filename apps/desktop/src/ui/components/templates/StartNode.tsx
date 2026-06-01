import { Handle, Position } from "@xyflow/react";
import { useT } from "../../i18n";

const StartNode = () => {
  const t = useT();
  return (
    <div
      className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-2xs font-semibold uppercase tracking-[0.08em] text-primary-foreground shadow-[0_0_0_3px_color-mix(in_srgb,var(--ring)_18%,transparent),0_6px_18px_-4px_color-mix(in_srgb,var(--ring)_55%,transparent)] ring-1 ring-inset ring-white/10"
      aria-label={t("template.canvas.startNode.start")}
    >
      <span className="pointer-events-none absolute inset-1 rounded-full bg-gradient-to-br from-white/15 to-transparent" />
      <span className="relative">{t("template.canvas.startNode.start")}</span>
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        style={{ background: "transparent", border: "none" }}
      />
    </div>
  );
};

export default StartNode;
