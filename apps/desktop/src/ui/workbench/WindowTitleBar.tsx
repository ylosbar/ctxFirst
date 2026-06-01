import { useEffect, useState } from "react";
import { Minus, Square, Copy, X } from "lucide-react";
import { useServices } from "../di/services-provider";

type WindowTitleBarProps = {
  onMaximizedChange: (maximized: boolean) => void;
};

const WindowTitleBar = ({ onMaximizedChange }: WindowTitleBarProps) => {
  const { windowControls } = useServices();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void windowControls.isMaximized().then((value) => {
      if (cancelled) return;
      setMaximized(value);
      onMaximizedChange(value);
    });
    const unsubscribe = windowControls.onMaximizedChange((value) => {
      setMaximized(value);
      onMaximizedChange(value);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [windowControls, onMaximizedChange]);

  return (
    <div className="app-titlebar-drag flex h-8 shrink-0 items-center justify-end bg-background">
      <button
        type="button"
        aria-label="Minimiser la fenêtre"
        onClick={() => void windowControls.minimize()}
        className="app-titlebar-button flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Minus size={14} />
      </button>
      <button
        type="button"
        aria-label={maximized ? "Restaurer la fenêtre" : "Maximiser la fenêtre"}
        onClick={() => void windowControls.maximizeToggle()}
        className="app-titlebar-button flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        {maximized ? <Copy size={12} /> : <Square size={12} />}
      </button>
      <button
        type="button"
        aria-label="Fermer la fenêtre"
        onClick={() => void windowControls.close()}
        className="app-titlebar-button flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-destructive hover:text-white"
      >
        <X size={14} />
      </button>
    </div>
  );
};

export default WindowTitleBar;
