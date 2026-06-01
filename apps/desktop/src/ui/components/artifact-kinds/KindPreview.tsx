import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/ui/i18n";

import type {
  ArtifactKind,
  ArtifactSchemaView,
} from "../../../domain/workflow/types";

type Props = {
  readonly kind: ArtifactKind;
  /** Registry view for `kind`; `null` ⇒ the registry no longer resolves it. */
  readonly view: ArtifactSchemaView | null;
  /** TS-like one-line projection of `view.simplifiedSchema`. */
  readonly shapeText: string;
  /** Concrete sample payload to display; `null` ⇒ nothing to render. */
  readonly sample: unknown | null;
  /**
   * `true` when {@link sample} was synthesised at render time rather than
   * read off `view.sample`. Surfaced via a small "auto-dérivé" badge so the
   * user understands why the sample may not match all schema constraints.
   */
  readonly sampleAutoDerived?: boolean;
  /** Refinement chain from the closest parent to the furthest. */
  readonly extendsChain: ReadonlyArray<ArtifactKind>;
  readonly className?: string;
};

const sourceBadgeLabel = (view: ArtifactSchemaView | null): string => {
  if (!view) return "inconnu";
  switch (view.source.kind) {
    case "builtin":
      return "built-in";
    case "user":
      return "user";
    case "plugin":
      return `plugin: ${view.source.pluginId}`;
  }
};

const KindPreview = ({
  kind,
  view,
  shapeText,
  sample,
  sampleAutoDerived,
  extendsChain,
  className,
}: Props) => {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const sampleText =
    sample !== null && sample !== undefined
      ? JSON.stringify(sample, null, 2)
      : null;

  const copySample = () => {
    if (sampleText === null) return;
    void navigator.clipboard.writeText(sampleText).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };

  if (!view) {
    return (
      <div
        className={cn(
          "flex w-80 flex-col gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs",
          className,
        )}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-mono text-sm font-semibold">{kind}</span>
          <Badge tone="warning" size="sm">
            {t("artifacts.kindPreview.unknown")}
          </Badge>
        </div>
        <p className="text-2xs text-muted-foreground">
          {t("artifacts.kindPreview.unknownDescription")}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex w-80 flex-col gap-2.5 rounded-md border border-border bg-muted/40 p-3 text-xs",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-mono text-sm font-semibold">
            {view.name}
          </span>
          {view.description ? (
            <span className="text-2xs leading-snug text-muted-foreground">
              {view.description}
            </span>
          ) : null}
        </div>
        <Badge tone="neutral" size="sm">
          {sourceBadgeLabel(view)}
        </Badge>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("artifacts.kindPreview.shape")}
        </span>
        <pre className="overflow-x-auto rounded border border-border/60 bg-background p-2 font-mono text-2xs leading-snug">
          {shapeText}
        </pre>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("artifacts.kindPreview.sample")}
          </span>
          <div className="flex items-center gap-1.5">
            {sampleAutoDerived ? (
              <Badge tone="warning" size="sm">
                {t("artifacts.kindPreview.autoDerived")}
              </Badge>
            ) : null}
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={copySample}
              disabled={sampleText === null}
              aria-label={t("artifacts.kindPreview.copySample")}
              className="h-5 w-5"
            >
              {copied ? (
                <Check className="size-3" />
              ) : (
                <Copy className="size-3" />
              )}
            </Button>
          </div>
        </div>
        {sampleText !== null ? (
          <pre className="max-h-40 overflow-auto rounded border border-border/60 bg-background p-2 font-mono text-2xs leading-snug">
            {sampleText}
          </pre>
        ) : (
          <p className="text-2xs italic text-muted-foreground">
            {t("artifacts.kindPreview.noSample")}
          </p>
        )}
      </div>

      {extendsChain.length > 0 ? (
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("artifacts.kindPreview.extends")}
          </span>
          <span className="truncate font-mono text-2xs text-foreground">
            {extendsChain.join(" → ")}
          </span>
        </div>
      ) : null}
    </div>
  );
};

export default KindPreview;
