import { useNavigate } from "react-router";
import { Brain, Database, Network, Play } from "lucide-react";
import { useWorkbench } from "./WorkbenchProvider";
import { useT } from "@/ui/i18n";

// Two waves with the same baseline (y=100) and different phases/frequencies so
// their crests intersect a couple of times across the width.
const WAVE_BACK_TOP =
  "M 0,100 C 200,82 400,82 600,100 C 800,118 1000,118 1200,100";
const WAVE_MID_TOP =
  "M 0,100 C 100,118 300,118 400,100 C 500,82 700,82 800,100 C 900,118 1100,118 1200,100";
const WAVE_FRONT_TOP = "M 0,100 C 400,118 800,118 1200,100";
const WAVE_BACK = `${WAVE_BACK_TOP} L 1200,200 L 0,200 Z`;
const WAVE_MID = `${WAVE_MID_TOP} L 1200,200 L 0,200 Z`;
const WAVE_FRONT = `${WAVE_FRONT_TOP} L 1200,200 L 0,200 Z`;

export const WavesBackground = () => (
  <svg
    className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 w-full"
    viewBox="0 0 1200 200"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <style>{`
      @keyframes wave-bob-back { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
      @keyframes wave-bob-mid { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
      @keyframes wave-bob-front { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(3px); } }
    `}</style>
    <g style={{ animation: "wave-bob-back 7s ease-in-out infinite" }}>
      <path d={WAVE_BACK} fill="var(--primary)" opacity="0.04" />
      <path
        d={WAVE_BACK_TOP}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="1"
        opacity="0.18"
        vectorEffect="non-scaling-stroke"
      />
    </g>
    <g style={{ animation: "wave-bob-mid 10s ease-in-out infinite" }}>
      <path d={WAVE_MID} fill="var(--primary)" opacity="0.06" />
      <path
        d={WAVE_MID_TOP}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="1"
        opacity="0.23"
        vectorEffect="non-scaling-stroke"
      />
    </g>
    <g style={{ animation: "wave-bob-front 8.5s ease-in-out infinite" }}>
      <path d={WAVE_FRONT} fill="var(--primary)" opacity="0.09" />
      <path
        d={WAVE_FRONT_TOP}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="1"
        opacity="0.28"
        vectorEffect="non-scaling-stroke"
      />
    </g>
  </svg>
);

const NEW_SKILL_URI = "skill://new";
const NEW_ARTIFACT_SCHEMA_URI = "artifact-schema://new";
const NEW_TEMPLATE_URI = "template://new";

const Watermark = () => {
  const t = useT();
  const navigate = useNavigate();
  const workbench = useWorkbench();
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-4 overflow-hidden bg-background text-center text-sm text-muted-foreground">
      <WavesBackground />
      <div className="relative flex flex-col items-center gap-4">
        <p className="font-medium text-foreground">
          {t("workbench.watermark.title")}
        </p>
        <p>{t("workbench.watermark.subtitle")}</p>
        <div className="mt-2 flex flex-col items-stretch gap-1.5">
          <button
            type="button"
            onClick={() => {
              void navigate("/runs/new");
            }}
            className="group flex items-center gap-2.5 rounded-md border border-border bg-card px-3 py-2 text-left text-foreground transition-colors hover:border-primary/40 hover:bg-accent"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--chart-1)]/15 text-[var(--chart-1)]">
              <Play className="h-3.5 w-3.5" />
            </span>
            <span className="flex-1 text-xs font-medium">
              {t("workbench.watermark.runAction")}
            </span>
            <kbd className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-2xs font-medium text-muted-foreground">
              {t("workbench.watermark.kbd.newRun")}
            </kbd>
          </button>
          <button
            type="button"
            onClick={() => workbench.openEditor(NEW_SKILL_URI, { focus: true })}
            className="group flex items-center gap-2.5 rounded-md border border-border bg-card px-3 py-2 text-left text-foreground transition-colors hover:border-primary/40 hover:bg-accent"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--chart-3)]/15 text-[var(--chart-3)]">
              <Brain className="h-3.5 w-3.5" />
            </span>
            <span className="flex-1 text-xs font-medium">
              {t("workbench.watermark.createPrompt")}
            </span>
          </button>
          <button
            type="button"
            onClick={() =>
              workbench.openEditor(NEW_ARTIFACT_SCHEMA_URI, { focus: true })
            }
            className="group flex items-center gap-2.5 rounded-md border border-border bg-card px-3 py-2 text-left text-foreground transition-colors hover:border-primary/40 hover:bg-accent"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--chart-2)]/15 text-[var(--chart-2)]">
              <Database className="h-3.5 w-3.5" />
            </span>
            <span className="flex-1 text-xs font-medium">
              {t("workbench.watermark.createArtifactSchema")}
            </span>
          </button>
          <button
            type="button"
            onClick={() =>
              workbench.openEditor(NEW_TEMPLATE_URI, { focus: true })
            }
            className="group flex items-center gap-2.5 rounded-md border border-border bg-card px-3 py-2 text-left text-foreground transition-colors hover:border-primary/40 hover:bg-accent"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--chart-4)]/15 text-[var(--chart-4)]">
              <Network className="h-3.5 w-3.5" />
            </span>
            <span className="flex-1 text-xs font-medium">
              {t("workbench.watermark.createTemplate")}
            </span>
          </button>
        </div>
        <div className="mt-1 flex flex-col items-center gap-1">
          <p className="flex items-center gap-1.5">
            <span>{t("workbench.watermark.commandPalette")}</span>
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-2xs font-medium text-muted-foreground">
              {t("workbench.watermark.kbd.commandPalette")}
            </kbd>
          </p>
          <p className="flex items-center gap-1.5">
            <span>{t("workbench.watermark.search")}</span>
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-2xs font-medium text-muted-foreground">
              {t("workbench.watermark.kbd.quickOpen")}
            </kbd>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Watermark;
