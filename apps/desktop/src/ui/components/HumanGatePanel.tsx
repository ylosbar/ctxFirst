import { Button } from "../../components/ui/button";
import { useT } from "../i18n";

type Props = {
  stepExecId: string;
  loopTargetStepId: string | null;
  onValidate: () => void;
  /** Opens the line-by-line review surface (in a dedicated tab). */
  onRequestAdjustments: () => void;
};

const HumanGatePanel = ({
  stepExecId,
  loopTargetStepId,
  onValidate,
  onRequestAdjustments,
}: Props) => {
  const t = useT();
  const canLoop = loopTargetStepId !== null;

  return (
    <div className="flex flex-col gap-3 border-t-2 border-amber-500/60 bg-amber-500/10 p-4 shadow-[inset_0_1px_0_0_rgb(245_158_11_/_0.25)] dark:bg-amber-500/[0.07]">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
        <span className="relative flex size-2.5" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-500/70" />
          <span className="relative inline-flex size-2.5 rounded-full bg-amber-500" />
        </span>
        {t("components.humanGate.validationRequired")}
        <span className="font-mono text-2xs font-normal text-amber-700/70 dark:text-amber-400/70">
          {t("components.humanGate.stepId", { id: stepExecId.slice(0, 8) })}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Button onClick={onValidate}>{t("components.humanGate.validate")}</Button>
          <Button
            variant="outline"
            disabled={!canLoop}
            onClick={onRequestAdjustments}
          >
            {t("components.humanGate.requestAdjustments")}
          </Button>
        </div>
        {!canLoop ? (
          <div className="text-2xs text-muted-foreground">
            {t("components.humanGate.noLoopHint")}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default HumanGatePanel;
