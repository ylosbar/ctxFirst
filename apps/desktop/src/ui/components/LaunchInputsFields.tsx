import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/ui/i18n";
import type { LaunchInput } from "@/application/use-cases/collect-launch-inputs";

type Props = {
  readonly inputs: ReadonlyArray<LaunchInput>;
  readonly values: Record<string, string>;
  readonly busy: boolean;
  readonly onChange: (name: string, value: string) => void;
};

/**
 * Multi-line kinds get a mono `Textarea` (Markdown bodies, JSON literals,
 * `List<…>` arrays, and user/plugin artifact kinds whose content is structured);
 * scalars get a single-line `Input`. Mirrors the seed editor's typography.
 */
const MULTILINE_KIND_RE = /^(Markdown|Json|List<|user:|plugin:)/;
const isMultiline = (kind: string): boolean => MULTILINE_KIND_RE.test(kind);

/**
 * Renders one field per `promptAtLaunch` template variable (`launch-input-
 * variables.md` §P3). Pre-filled from `defaultValue` upstream; a variable with
 * no default is badged "required". Shared by `LaunchRunDialog` and
 * `WorkflowStartForm`. Returns `null` when the template exposes no launch input.
 */
const LaunchInputsFields = ({ inputs, values, busy, onChange }: Props) => {
  const t = useT();
  if (inputs.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {inputs.map((input) => {
        const value = values[input.name] ?? "";
        return (
          <div key={input.name} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-foreground">
                {input.name}
                {input.required ? (
                  <span className="ml-1.5 rounded bg-amber-500/15 px-1 py-0.5 text-2xs font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    {t("templates.launchRun.requiredBadge")}
                  </span>
                ) : null}
              </span>
              <span className="font-mono text-2xs text-muted-foreground">
                {input.kind}
              </span>
            </div>
            {input.description ? (
              <p className="text-2xs text-muted-foreground">{input.description}</p>
            ) : null}
            {isMultiline(input.kind) ? (
              <Textarea
                className="min-h-[80px] font-mono text-sm"
                value={value}
                onChange={(e) => onChange(input.name, e.target.value)}
                disabled={busy}
              />
            ) : (
              <Input
                className="font-mono text-sm"
                value={value}
                onChange={(e) => onChange(input.name, e.target.value)}
                disabled={busy}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default LaunchInputsFields;
