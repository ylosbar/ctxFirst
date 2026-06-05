import { useEffect, useState } from "react";

import { useFpsCounter } from "../stores/appearance-store";

/**
 * Optional renderer-wide FPS overlay, toggled from Settings → Appearance.
 *
 * Measures the real frame cadence via `requestAnimationFrame` (so it reflects
 * whatever the compositor actually paints, ReactFlow canvas included) and
 * refreshes the reading twice a second to keep its own re-renders negligible.
 * Mounted once at the app root; renders nothing while disabled.
 */
const FpsOverlay = () => {
  const enabled = useFpsCounter();
  const [fps, setFps] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let raf = 0;
    let frames = 0;
    let last = performance.now();

    const tick = (now: number) => {
      frames += 1;
      const elapsed = now - last;
      if (elapsed >= 500) {
        setFps(Math.round((frames * 1000) / elapsed));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  if (!enabled) return null;

  const color =
    fps === null
      ? "text-muted-foreground"
      : fps >= 50
        ? "text-emerald-400"
        : fps >= 30
          ? "text-amber-400"
          : "text-red-400";

  return (
    <div className="pointer-events-none fixed left-2 top-2 z-[9999] select-none rounded-md border border-border bg-background/90 px-2 py-1 font-mono text-xs tabular-nums shadow-sm">
      <span className={color}>{fps ?? "—"}</span>
      <span className="ml-1 text-muted-foreground">FPS</span>
    </div>
  );
};

export default FpsOverlay;
