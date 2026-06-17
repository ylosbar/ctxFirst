import { Dialog } from "@base-ui/react/dialog";
import { Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import {
  canonicalisedFromLegacyList,
  isContainerArtifactKind,
  parseListArtifactKind,
} from "../../../../shared/wf/artifact-kind-grammar";
import {
  kindForArtifactSchema,
  type ArtifactKind,
  type ArtifactSchemaView,
  type TemplateStepDraft,
  type TemplateVariableDraft,
} from "../../../domain/workflow/types";
import KindPreviewBlock from "../../components/artifact-kinds/KindPreviewBlock";
import { useServices } from "../../di/services-provider";
import useArtifactSchemas from "../../hooks/useArtifactSchemas";
import { useT } from "@/ui/i18n";

const VAR_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

type Mode =
  | { kind: "create" }
  | { kind: "edit"; variable: TemplateVariableDraft };

type Props = {
  readonly open: boolean;
  readonly mode: Mode;
  readonly variables: ReadonlyArray<TemplateVariableDraft>;
  readonly steps: ReadonlyArray<TemplateStepDraft>;
  readonly onSubmit: (
    next: TemplateVariableDraft,
    previousName: string | null,
  ) => void;
  readonly onDelete?: () => void;
  readonly onOpenChange: (open: boolean) => void;
};

type KindOption = {
  value: ArtifactKind;
  label: string;
  /** Hierarchy depth for indenting refinements under their super-type. */
  depth: number;
};

/**
 * Builds the scalar options for the kind picker, ordered as a flat list whose
 * `depth` field reflects the §2 refinement hierarchy (a `Url` child sits under
 * its `String` parent with `depth: 1`). Synthesised parametric kinds are never
 * in `types` (the registry only lists stored descriptors), but the legacy
 * `MarkdownList`/`PathList` built-ins are — filter them out so the canonical
 * "scalar + list checkbox" pairing is the only path for new variables.
 * Existing variables that already reference a legacy spelling are normalised
 * to their `List<…>` equivalent on open.
 */
const buildScalarKindOptions = (
  types: ReadonlyArray<ArtifactSchemaView>,
): ReadonlyArray<KindOption> => {
  const scalars = types.filter((t) => {
    const k = kindForArtifactSchema(t);
    return (
      !isContainerArtifactKind(k) && canonicalisedFromLegacyList(k) === null
    );
  });
  const byKind = new Map<string, ArtifactSchemaView>();
  for (const t of scalars) byKind.set(kindForArtifactSchema(t), t);
  const childrenOf = new Map<string, ArtifactSchemaView[]>();
  const roots: ArtifactSchemaView[] = [];
  for (const t of scalars) {
    const parent = t.extends ?? null;
    if (parent && byKind.has(parent)) {
      const arr = childrenOf.get(parent) ?? [];
      arr.push(t);
      childrenOf.set(parent, arr);
    } else {
      roots.push(t);
    }
  }
  const out: KindOption[] = [];
  // DFS so refinements appear immediately under their parent — the picker
  // renders this list verbatim with depth-driven indentation.
  const walk = (t: ArtifactSchemaView, depth: number) => {
    const k = kindForArtifactSchema(t);
    out.push({ value: k, label: t.name, depth });
    for (const child of childrenOf.get(k) ?? []) walk(child, depth + 1);
  };
  for (const r of roots) walk(r, 0);
  return out;
};

/**
 * Normalises a stored variable kind into the `(baseKind, isList)` shape the
 * picker manipulates. Handles three encodings:
 *  - `List<X>` → `(X, true)`
 *  - legacy `MarkdownList`/`PathList` → `(Markdown|Path, true)` (canonicalised)
 *  - everything else → `(kind, false)`
 */
const decomposeKind = (
  kind: ArtifactKind,
): { baseKind: ArtifactKind; isList: boolean } => {
  const legacyCanonical = canonicalisedFromLegacyList(kind);
  if (legacyCanonical !== null) {
    const inner = parseListArtifactKind(legacyCanonical);
    if (inner) return { baseKind: inner as ArtifactKind, isList: true };
  }
  if (isContainerArtifactKind(kind)) {
    const inner = parseListArtifactKind(kind);
    if (inner) return { baseKind: inner as ArtifactKind, isList: true };
  }
  return { baseKind: kind, isList: false };
};

const collectReferences = (
  steps: ReadonlyArray<TemplateStepDraft>,
  variableName: string,
): { producers: ReadonlyArray<string>; consumers: ReadonlyArray<string> } => {
  const producers: string[] = [];
  const consumers: string[] = [];
  for (const s of steps) {
    if (s.writesTo) {
      for (const [, varName] of Object.entries(s.writesTo)) {
        if (varName === variableName) {
          producers.push(s.id);
          break;
        }
      }
    }
    if (s.readsFrom) {
      for (const [, varName] of Object.entries(s.readsFrom)) {
        if (varName === variableName) {
          consumers.push(s.id);
          break;
        }
      }
    }
  }
  return { producers, consumers };
};

const VariableEditorModal = ({
  open,
  mode,
  variables,
  steps,
  onSubmit,
  onDelete,
  onOpenChange,
}: Props) => {
  const t = useT();
  const isEdit = mode.kind === "edit";
  const previousName = isEdit ? mode.variable.name : null;

  const [name, setName] = useState("");
  const [baseKind, setBaseKind] = useState<ArtifactKind>("Markdown");
  const [isList, setIsList] = useState(false);
  const [role, setRole] = useState<"input" | "output" | "internal">("internal");
  const [description, setDescription] = useState("");
  const [defaultValue, setDefaultValue] = useState("");
  const [promptAtLaunch, setPromptAtLaunch] = useState(false);
  const [defaultValueError, setDefaultValueError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const services = useServices();
  const { types: artifactSchemas } = useArtifactSchemas();
  const kindOptions = useMemo(
    () => buildScalarKindOptions(artifactSchemas),
    [artifactSchemas],
  );

  // Composed kind submitted to the engine: scalar pick wrapped in `List<…>`
  // when the checkbox is on.
  const composedKind: ArtifactKind = useMemo(
    () => (isList ? (`List<${baseKind}>` as ArtifactKind) : baseKind),
    [isList, baseKind],
  );

  // Re-sync only when the modal opens or the target variable changes —
  // depending on `mode` object identity would reset the fields on every
  // keystroke because the parent re-creates the prop inline.
  useEffect(() => {
    if (!open) return;
    if (mode.kind === "create") {
      setName("");
      setBaseKind("Markdown");
      setIsList(false);
      setRole("internal");
      setDescription("");
      setDefaultValue("");
      setPromptAtLaunch(false);
    } else {
      const decomposed = decomposeKind(mode.variable.kind);
      setName(mode.variable.name);
      setBaseKind(decomposed.baseKind);
      setIsList(decomposed.isList);
      setRole(mode.variable.role ?? "internal");
      setDescription(mode.variable.description ?? "");
      setDefaultValue(mode.variable.defaultValue ?? "");
      setPromptAtLaunch(mode.variable.promptAtLaunch === true);
    }
    setError(null);
    setDefaultValueError(null);
    setValidating(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode.kind, previousName]);

  // Validate the default value against the (composed) kind on the engine side,
  // debounced so we don't fire an IPC round-trip on every keystroke. A
  // cancellation guard drops stale results when the content or kind changes
  // mid-flight. Empty value ⇒ no default ⇒ nothing to validate.
  useEffect(() => {
    if (!open) return;
    const content = defaultValue.trim();
    if (!content) {
      setDefaultValueError(null);
      setValidating(false);
      return;
    }
    let cancelled = false;
    setValidating(true);
    const handle = setTimeout(() => {
      void services
        .validateArtifact(composedKind, content)
        .then((res) => {
          if (cancelled) return;
          setDefaultValueError(res.ok ? null : res.error);
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          setDefaultValueError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => {
          if (!cancelled) setValidating(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [open, defaultValue, composedKind, services]);

  const refs = useMemo(() => {
    if (!isEdit) return { producers: [], consumers: [] };
    return collectReferences(steps, previousName ?? "");
  }, [isEdit, steps, previousName]);

  // Gate 1 (launch-input-variables.md §Contrainte) reflected before save: a
  // variable written by a step cannot be a launch input — last-writer-wins would
  // clobber the entered value. Disable the toggle and force the flag off so the
  // engine gate can never fire from here.
  const hasProducer = refs.producers.length > 0;
  const promptAtLaunchEffective = promptAtLaunch && !hasProducer;

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && defaultValueError === null;

  const validate = (): string | null => {
    if (!trimmedName) return t("templates.variableEditor.error.nameRequired");
    if (!VAR_NAME_RE.test(trimmedName)) {
      return t("templates.variableEditor.error.nameInvalid");
    }
    const conflict = variables.some(
      (v) => v.name === trimmedName && v.name !== previousName,
    );
    if (conflict)
      return t("templates.variableEditor.error.nameConflict", {
        name: trimmedName,
      });
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    const trimmedDefault = defaultValue.trim();
    // Authoritative re-check before submit: a pending debounced validation may
    // not have settled yet (or the user hit ⌘↵ immediately).
    if (trimmedDefault) {
      const res = await services.validateArtifact(composedKind, trimmedDefault);
      if (!res.ok) {
        setDefaultValueError(res.error);
        return;
      }
    }
    onSubmit(
      {
        name: trimmedName,
        kind: composedKind,
        // Keep templates clean: `internal` (the default) is stored as absent.
        role: role === "internal" ? undefined : role,
        description: description.trim() || undefined,
        defaultValue: trimmedDefault || undefined,
        // Stored only when on (absent ⇒ false), and never alongside a producer.
        promptAtLaunch: promptAtLaunchEffective || undefined,
      },
      previousName,
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const handleDelete = () => {
    if (!onDelete) return;
    const inUse = refs.producers.length > 0 || refs.consumers.length > 0;
    if (
      inUse &&
      !confirm(
        t("templates.variableEditor.deleteConfirm", {
          name: previousName,
          producers: t("templates.variableEditor.producerCount", {
            count: refs.producers.length,
          }),
          consumers: t("templates.variableEditor.consumerCount", {
            count: refs.consumers.length,
          }),
        }),
      )
    ) {
      return;
    }
    onDelete();
  };

  const title = isEdit
    ? t("templates.variableEditor.editTitle")
    : t("templates.variableEditor.createTitle");
  const submitLabel = isEdit ? t("common.save") : t("templates.variableEditor.create");

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[640px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xl outline-none data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
          <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
            <Dialog.Title className="min-w-0 truncate text-sm font-semibold">
              {title}
            </Dialog.Title>
            <Dialog.Close
              aria-label={t("common.close")}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
            <FormField
              label={t("templates.variableEditor.nameLabel")}
              htmlFor="variable-modal-name"
            >
              <Input
                id="variable-modal-name"
                placeholder={t("templates.variableEditor.namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus={!isEdit}
              />
            </FormField>

            <FormField
              label={t("templates.variableEditor.kindLabel")}
              htmlFor="variable-modal-kind"
            >
              <Select
                id="variable-modal-kind"
                value={baseKind}
                onChange={(e) => setBaseKind(e.target.value as ArtifactKind)}
                onKeyDown={handleKeyDown}
              >
                {kindOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {/* Non-breaking spaces convey §2 refinement nesting
                        through the native <select>, which does not honour
                        CSS padding on <option>. */}
                    {`${"  ".repeat(o.depth)}${o.label} (${o.value})`}
                  </option>
                ))}
              </Select>
              <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={isList}
                  onCheckedChange={(c) => setIsList(c)}
                />
                <span>{t("templates.variableEditor.listLabel")}</span>
                {isList ? (
                  <span className="ml-auto font-mono text-2xs text-muted-foreground">
                    {composedKind}
                  </span>
                ) : null}
              </label>
            </FormField>

            <KindPreviewBlock kind={composedKind} />

            <FormField
              label={t("templates.variableEditor.roleLabel")}
              htmlFor="variable-modal-role"
            >
              <Select
                id="variable-modal-role"
                value={role}
                onChange={(e) =>
                  setRole(e.target.value as "input" | "output" | "internal")
                }
                onKeyDown={handleKeyDown}
              >
                <option value="internal">
                  {t("templates.variableEditor.roleOption.internal")}
                </option>
                <option value="input">
                  {t("templates.variableEditor.roleOption.input")}
                </option>
                <option value="output">
                  {t("templates.variableEditor.roleOption.output")}
                </option>
              </Select>
              <p className="mt-1 text-2xs text-muted-foreground">
                {t("templates.variableEditor.roleHint.before")}{" "}
                <code>{t("templates.variableEditor.roleHint.inputToken")}</code>/
                <code>{t("templates.variableEditor.roleHint.outputToken")}</code>{" "}
                {t("templates.variableEditor.roleHint.middle")}{" "}
                <code>{t("templates.variableEditor.roleHint.callToken")}</code>
                {t("templates.variableEditor.roleHint.after")}
              </p>
            </FormField>

            <FormField
              label={t("templates.variableEditor.descriptionLabel")}
              htmlFor="variable-modal-description"
            >
              <Input
                id="variable-modal-description"
                placeholder={t("templates.variableEditor.descriptionPlaceholder")}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </FormField>

            <FormField
              label={t("templates.variableEditor.defaultLabel")}
              htmlFor="variable-modal-default"
            >
              {isList || baseKind === "Markdown" ? (
                <Textarea
                  id="variable-modal-default"
                  rows={3}
                  placeholder={
                    isList
                      ? t("templates.variableEditor.defaultPlaceholderList")
                      : t("templates.variableEditor.defaultPlaceholder")
                  }
                  value={defaultValue}
                  onChange={(e) => setDefaultValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              ) : (
                <Input
                  id="variable-modal-default"
                  placeholder={t("templates.variableEditor.defaultPlaceholder")}
                  value={defaultValue}
                  onChange={(e) => setDefaultValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              )}
              <p className="mt-1 text-2xs text-muted-foreground">
                {t("templates.variableEditor.defaultHint")}
              </p>
              {defaultValueError ? (
                <p className="mt-1 text-2xs text-destructive">
                  {defaultValueError}
                </p>
              ) : validating ? (
                <p className="mt-1 text-2xs text-muted-foreground">
                  {t("templates.variableEditor.validating")}
                </p>
              ) : null}
            </FormField>

            <FormField label={t("templates.variableEditor.promptAtLaunchLabel")}>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={promptAtLaunchEffective}
                  disabled={hasProducer}
                  onCheckedChange={(c) => setPromptAtLaunch(c)}
                />
                <span>{t("templates.variableEditor.promptAtLaunchToggle")}</span>
              </label>
              {hasProducer ? (
                <p className="mt-1 text-2xs text-amber-600 dark:text-amber-400">
                  {t("templates.variableEditor.promptAtLaunchProducerHint", {
                    producers: refs.producers.join(", "),
                  })}
                </p>
              ) : (
                <>
                  <p className="mt-1 text-2xs text-muted-foreground">
                    {t("templates.variableEditor.promptAtLaunchHint")}
                  </p>
                  {promptAtLaunchEffective && defaultValue.trim().length === 0 ? (
                    <p className="mt-1 text-2xs text-amber-600 dark:text-amber-400">
                      {t("templates.variableEditor.promptAtLaunchRequiredNote")}
                    </p>
                  ) : null}
                </>
              )}
            </FormField>

            {error ? (
              <div className="text-xs text-destructive">{error}</div>
            ) : null}

            {isEdit ? (
              <div className="mt-1 rounded border border-input bg-muted/30 p-2 text-2xs text-muted-foreground">
                <div className="mb-1 text-xs font-semibold text-foreground">
                  {t("templates.variableEditor.references")}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <div>
                    <span className="font-semibold">
                      {t("templates.variableEditor.writtenBy")}
                    </span>{" "}
                    {refs.producers.length === 0
                      ? t("templates.variableEditor.none")
                      : refs.producers.join(", ")}
                  </div>
                  <div>
                    <span className="font-semibold">
                      {t("templates.variableEditor.readBy")}
                    </span>{" "}
                    {refs.consumers.length === 0
                      ? t("templates.variableEditor.none")
                      : refs.consumers.join(", ")}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
            {isEdit && onDelete ? (
              <Button
                variant="ghost"
                size="sm"
                className="mr-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={handleDelete}
              >
                <Trash2 data-icon="inline-start" className="size-3.5" />
                {t("common.delete")}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
            >
              {submitLabel}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default VariableEditorModal;
