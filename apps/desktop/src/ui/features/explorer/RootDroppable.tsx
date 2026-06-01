import { useDroppable } from "@dnd-kit/core";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type RootDropData = {
  readonly kind: "root";
};

type Props = {
  readonly children: ReactNode;
  readonly className?: string;
};

const RootDroppable = ({ children, className }: Props) => {
  const { setNodeRef, isOver, active } = useDroppable({
    id: "root-drop",
    data: { kind: "root" } satisfies RootDropData,
  });
  const showHighlight = isOver && active !== null;
  return (
    <div
      ref={setNodeRef}
      className={cn(
        className,
        showHighlight && "bg-accent/30 ring-1 ring-inset ring-accent",
      )}
    >
      {children}
    </div>
  );
};

export default RootDroppable;
