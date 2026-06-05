/**
 * Mode plein-écran de l'éditeur de template.
 *
 * Quand `isMaximized` est vrai, l'éditeur se portalise juste sous la barre de
 * titre pour couvrir l'activity bar + le dock. Escape sort du mode. Hook
 * autonome, aucun couplage au graphe.
 */
import { useEffect, useState } from "react";

export type MaximizeControls = {
  isMaximized: boolean;
  setIsMaximized: React.Dispatch<React.SetStateAction<boolean>>;
};

export const useMaximize = (): MaximizeControls => {
  const [isMaximized, setIsMaximized] = useState<boolean>(false);

  useEffect(() => {
    if (!isMaximized) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMaximized(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMaximized]);

  return { isMaximized, setIsMaximized };
};
