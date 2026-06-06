import { useCallback, useEffect, useRef, useState } from "react";

// Au-delà de ce déplacement (px) entre pointerdown et pointerup, le geste est un
// pan (et non un clic) : on supprime alors le clic de sélection qui suivrait.
const DRAG_THRESHOLD_PX = 4;

/**
 * Fenêtre temporelle visible (ms relatifs à `t0Ms`) partagée par le Gantt et le
 * graphe de tokens : zoomer l'un zoome l'autre, ce qui maintient l'alignement de
 * leur axe temps commun. Voir `GanttChart` / `TokenChart` / `RunStatsView`.
 */
export type TimeView = { readonly startMs: number; readonly endMs: number };

export type TimeZoom = {
  /** Domaine temps actuellement visible. */
  readonly view: TimeView;
  /** `true` dès que l'utilisateur a réduit la fenêtre sous le domaine complet. */
  readonly isZoomed: boolean;
  /**
   * Zoome autour d'une fraction `[0..1]` de la fenêtre visible (position du
   * curseur dans la zone de tracé). `deltaY < 0` (molette vers le haut) = zoom
   * avant ; `deltaY > 0` = zoom arrière.
   */
  readonly zoomAtFraction: (fraction: number, deltaY: number) => void;
  /**
   * Déplace la fenêtre visible de `fraction` de sa largeur (fraction > 0 = vers
   * la droite / plus tard dans le temps). No-op si non zoomé (rien à déplacer).
   */
  readonly panByFraction: (fraction: number) => void;
  /** Revient au domaine complet `[0, domainMax]`. */
  readonly reset: () => void;
};

// Fenêtre minimale : on ne zoome pas en-dessous de 50 ms de visible.
const MIN_SPAN_MS = 50;
// Sensibilité molette → facteur d'échelle ; `exp` garde le zoom multiplicatif
// (vitesse constante quel que soit le niveau de zoom courant).
const ZOOM_INTENSITY = 0.0015;

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(Math.max(v, lo), hi);

/**
 * État de zoom temporel borné à `[0, domainMax]`. `resetKey` (ex. l'id du run)
 * réinitialise la fenêtre quand on change de run pour ne pas y traîner un zoom.
 */
export const useTimeZoom = (
  domainMax: number,
  resetKey?: string,
): TimeZoom => {
  // `null` = auto (suit le domaine complet, même quand il s'agrandit en live).
  const [userView, setUserView] = useState<TimeView | null>(null);

  // Le domaine grandit pour un run en cours ; on lit toujours sa valeur fraîche
  // dans le callback molette sans le re-créer à chaque tick.
  const domainMaxRef = useRef(domainMax);
  domainMaxRef.current = domainMax;

  useEffect(() => {
    setUserView(null);
  }, [resetKey]);

  const zoomAtFraction = useCallback((fraction: number, deltaY: number) => {
    setUserView((prev) => {
      const max = Math.max(domainMaxRef.current, MIN_SPAN_MS);
      const cur = prev ?? { startMs: 0, endMs: max };
      const span = cur.endMs - cur.startMs;
      const anchor = cur.startMs + clamp(fraction, 0, 1) * span;
      const factor = Math.exp(deltaY * ZOOM_INTENSITY);
      const newSpan = clamp(span * factor, MIN_SPAN_MS, max);
      let start = anchor - clamp(fraction, 0, 1) * newSpan;
      let end = start + newSpan;
      if (start < 0) {
        start = 0;
        end = newSpan;
      }
      if (end > max) {
        end = max;
        start = max - newSpan;
      }
      return { startMs: Math.max(start, 0), endMs: end };
    });
  }, []);

  const panByFraction = useCallback((fraction: number) => {
    setUserView((prev) => {
      if (!prev) return prev; // pas zoomé → rien à déplacer
      const max = Math.max(domainMaxRef.current, MIN_SPAN_MS);
      const span = prev.endMs - prev.startMs;
      const delta = fraction * span;
      let start = prev.startMs + delta;
      let end = prev.endMs + delta;
      if (start < 0) {
        start = 0;
        end = span;
      }
      if (end > max) {
        end = max;
        start = max - span;
      }
      return { startMs: Math.max(start, 0), endMs: end };
    });
  }, []);

  const reset = useCallback(() => setUserView(null), []);

  const max = Math.max(domainMax, MIN_SPAN_MS);
  const view: TimeView = userView
    ? {
        startMs: clamp(userView.startMs, 0, max),
        endMs: clamp(userView.endMs, 0, max),
      }
    : { startMs: 0, endMs: max };
  const isZoomed = view.endMs - view.startMs < max - 0.5;

  return { view, isZoomed, zoomAtFraction, panByFraction, reset };
};

export type ChartGestureHandlers = {
  readonly zoomAtFraction: (fraction: number, deltaY: number) => void;
  readonly panByFraction: (fraction: number) => void;
};

/**
 * Gestes pan/zoom sur la zone de tracé d'un `<svg>` (bornée à
 * `[marginLeft, marginLeft + innerW]`) :
 * - **molette** verticale → zoom centré sur le curseur ;
 * - **molette horizontale** ou **Maj+molette** → déplacement droite/gauche ;
 * - **glisser** (drag) → déplacement droite/gauche ; au-delà du seuil, le clic de
 *   fin de geste est neutralisé (capture) pour ne pas resélectionner une barre.
 *
 * Listeners natifs (non-passifs) pour pouvoir `preventDefault`. Retourne
 * `isPanning` pour le retour visuel (curseur grabbing).
 */
export const useChartGestures = (
  svgRef: React.RefObject<SVGSVGElement | null>,
  marginLeft: number,
  innerW: number,
  { zoomAtFraction, panByFraction }: ChartGestureHandlers,
): { readonly isPanning: boolean } => {
  const [isPanning, setIsPanning] = useState(false);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || innerW <= 0) return;

    const inPlot = (clientX: number): number | null => {
      const rect = svg.getBoundingClientRect();
      const x = clientX - rect.left - marginLeft;
      return x < 0 || x > innerW ? null : x;
    };

    const onWheel = (e: WheelEvent) => {
      if (inPlot(e.clientX) === null) return;
      e.preventDefault();
      const horizontal = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (horizontal) {
        const d = e.deltaX !== 0 ? e.deltaX : e.deltaY;
        panByFraction(d / innerW);
      } else {
        zoomAtFraction((inPlot(e.clientX) ?? 0) / innerW, e.deltaY);
      }
    };

    let startX: number | null = null;
    let lastX = 0;
    let panned = false;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || inPlot(e.clientX) === null) return;
      startX = e.clientX;
      lastX = e.clientX;
      panned = false;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (startX === null) return;
      if (!panned && Math.abs(e.clientX - startX) < DRAG_THRESHOLD_PX) return;
      if (!panned) setIsPanning(true);
      panned = true;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      // glisser vers la droite (dx>0) révèle le passé → fenêtre vers la gauche.
      panByFraction(-dx / innerW);
    };
    const onPointerUp = () => {
      startX = null;
      if (panned) setIsPanning(false);
    };
    // Capture : neutralise le clic de fin de drag avant qu'il n'atteigne le
    // onClick (délégué) des barres, donc sans resélectionner une étape.
    const onClickCapture = (e: MouseEvent) => {
      if (!panned) return;
      e.stopPropagation();
      e.preventDefault();
      panned = false;
    };

    svg.addEventListener("wheel", onWheel, { passive: false });
    svg.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    svg.addEventListener("click", onClickCapture, true);
    return () => {
      svg.removeEventListener("wheel", onWheel);
      svg.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      svg.removeEventListener("click", onClickCapture, true);
    };
  }, [svgRef, marginLeft, innerW, zoomAtFraction, panByFraction]);

  return { isPanning };
};
