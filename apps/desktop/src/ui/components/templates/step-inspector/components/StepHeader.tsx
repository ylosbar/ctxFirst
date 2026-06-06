import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { FlaskConical, LogIn, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { TemplateStepDraft } from "../../../../../domain/workflow/types";
import { useT } from "../../../../i18n";
import {
  FAMILY_LABEL,
  accentForKind,
  familyForKind,
  getKindMeta,
  iconForKind,
} from "../../step-kinds";

type StepHeaderProps = {
  step: TemplateStepDraft;
  meta: ReturnType<typeof getKindMeta>;
  isEntry: boolean;
  onChange: (next: TemplateStepDraft) => void;
  onDelete: () => void;
  onSetEntry: () => void;
  onEnterStudio?: () => void;
};

const StepHeader = ({
  step,
  meta,
  isEntry,
  onChange,
  onDelete,
  onSetEntry,
  onEnterStudio,
}: StepHeaderProps) => {
  const t = useT();
  const KindIcon = iconForKind(step.kind);
  const accent = accentForKind(step.kind);
  const family = familyForKind(step.kind);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-start gap-2.5">
        {/* Icon chip — mirrors the canvas node's family-tinted chip so the
            inspected node keeps its visual identity from canvas to inspector. */}
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{
            background: `color-mix(in srgb, ${accent} 14%, transparent)`,
            boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accent} 24%, transparent), 0 0 4px 0 color-mix(in srgb, ${accent} 35%, transparent)`,
          }}
        >
          <KindIcon className="h-4 w-4" style={{ color: accent }} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
          <Input
            aria-label={t("template.stepInspector.header.nameAriaLabel")}
            className="h-7 border-transparent bg-transparent px-1.5 text-sm font-semibold shadow-none hover:border-input"
            value={step.name}
            placeholder={t("template.stepInspector.header.namePlaceholder")}
            onChange={(e) => onChange({ ...step, name: e.target.value })}
          />
          <span className="px-1.5 text-2xs text-muted-foreground">
            {meta?.label ?? step.kind}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
          {onEnterStudio ? (
            <HeaderAction
              icon={FlaskConical}
              label={t("template.stepInspector.header.testNode")}
              onClick={onEnterStudio}
            />
          ) : null}
          <HeaderAction
            icon={LogIn}
            label={
              isEntry
                ? t("template.stepInspector.header.alreadyEntry")
                : t("template.stepInspector.header.setAsEntry")
            }
            onClick={onSetEntry}
            disabled={isEntry}
            activeColor={isEntry ? accent : undefined}
          />
          <HeaderAction
            icon={Trash2}
            label={t("template.stepInspector.header.deleteStep")}
            onClick={onDelete}
            danger
          />
        </div>
      </div>

      {meta?.description ? (
        <p className="text-xs leading-snug text-muted-foreground">
          {meta.description}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-2xs font-medium"
          style={{
            color: accent,
            background: `color-mix(in srgb, ${accent} 12%, transparent)`,
          }}
        >
          <span
            aria-hidden
            className="size-1.5 rounded-full"
            style={{ background: accent }}
          />
          {FAMILY_LABEL[family]}
        </span>
        {isEntry ? (
          <Badge tone="success" size="sm">
            {t("template.stepInspector.header.entryBadge")}
          </Badge>
        ) : null}
        <Badge tone="neutral" size="sm">
          {step.actorRole}
        </Badge>
        {step.humanGateRequired ? (
          <Badge tone="warning" size="sm">
            {t("template.stepInspector.header.humanValidationBadge")}
          </Badge>
        ) : null}
      </div>
    </div>
  );
};

/**
 * Compact icon-button used in the inspector header toolbar. Wraps the action in
 * a tooltip so the icon stays self-explanatory; `danger` tints the destructive
 * action on hover, `activeColor` marks a toggled-on state (e.g. current entry).
 */
const HeaderAction = ({
  icon: Icon,
  label,
  onClick,
  disabled,
  danger,
  activeColor,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  activeColor?: string;
}) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          className={cn(
            "text-muted-foreground",
            danger && "hover:bg-destructive/10 hover:text-destructive",
          )}
          style={activeColor ? { color: activeColor } : undefined}
        >
          <Icon />
        </Button>
      }
    />
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
);

export default StepHeader;
