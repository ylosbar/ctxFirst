import { useEffect, useMemo, useState } from "react";
import { resolveNodeSpec } from "@shared/wf/resolve-node-spec";
import { Button } from "../../components/ui/button";
import {
  EmptyState,
  LoadingState,
} from "../../components/ui/empty-state";
import { FormField } from "../../components/ui/form-field";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import type {
  ArtifactKind,
  NodeSpecView,
  StepKindId,
  TemplateView,
} from "../../domain/workflow/types";
import { useServices } from "../di/services-provider";
import useNodeSpecs from "../hooks/useNodeSpecs";

type Props = {
  templates: ReadonlyArray<TemplateView>;
  busy: boolean;
  loading: boolean;
  onStart: (input: {
    templateRef: string;
    seedKind: ArtifactKind;
    content: string;
    cwd?: string;
  }) => void;
};

const PLACEHOLDERS: Partial<Record<ArtifactKind, string>> = {
  Markdown: "# Titre\n\nContenu markdown…",
};

const SEED_LABELS: Partial<Record<ArtifactKind, string>> = {
  Markdown: "Markdown",
};

const getEntrySeedKind = (
  template: TemplateView,
  byKind: ReadonlyMap<StepKindId, NodeSpecView>,
): ArtifactKind | null => {
  const entry = template.steps.find((s) => s.id === template.entryStep);
  if (!entry) return null;
  const base = byKind.get(entry.kind);
  if (!base) return null;
  const spec = resolveNodeSpec(entry.kind, entry.config ?? {}, base);
  return (spec.outputs[0]?.kind as ArtifactKind) ?? null;
};

const WorkflowStartForm = ({ templates, busy, loading, onStart }: Props) => {
  const services = useServices();
  const specs = useNodeSpecs();
  const published = useMemo(
    () => templates.filter((t) => t.status === "published"),
    [templates],
  );

  const [templateRef, setTemplateRef] = useState<string>("");
  const [content, setContent] = useState<string>("");
  const [cwd, setCwd] = useState<string>("");

  const onPickCwd = async () => {
    const picked = await services.pickDirectory({ defaultPath: cwd || undefined });
    if (picked) setCwd(picked);
  };

  useEffect(() => {
    if (templateRef) return;
    const first = published[0];
    if (first) setTemplateRef(`${first.id}@${first.version}`);
  }, [published, templateRef]);

  const selected = useMemo(
    () =>
      published.find((t) => `${t.id}@${t.version}` === templateRef) ?? null,
    [published, templateRef],
  );

  const seedKind: ArtifactKind =
    selected && specs.status === "ready"
      ? getEntrySeedKind(selected, specs.byKind) ?? "Markdown"
      : "Markdown";
  const seedLabel = SEED_LABELS[seedKind] ?? seedKind;
  const placeholder = PLACEHOLDERS[seedKind] ?? "";

  const disabled = busy || !selected || content.trim().length === 0;

  if (loading || specs.status === "loading") {
    return <LoadingState label="Chargement des templates…" />;
  }

  if (published.length === 0) {
    return (
      <EmptyState
        title="Aucun template publié"
        description="Crée un template depuis l'éditeur pour démarrer un run."
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <FormField label="Template">
        <Select
          value={templateRef}
          onChange={(e) => {
            setTemplateRef(e.target.value);
            setContent("");
          }}
          disabled={busy}
        >
          {published.map((t) => {
            const ref = `${t.id}@${t.version}`;
            return (
              <option key={ref} value={ref}>
                {t.name} ({ref})
              </option>
            );
          })}
        </Select>
      </FormField>

      <FormField label={`${seedLabel} (seed)`}>
        <Textarea
          size="sm"
          className="min-h-[280px] max-h-[50vh] overflow-auto font-mono"
          placeholder={placeholder}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={busy}
        />
      </FormField>

      <FormField label="Répertoire de travail (cwd CLI, optionnel)">
        <div className="flex items-center gap-2">
          <Input
            className="font-mono"
            placeholder="(par défaut : cwd du process Electron)"
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
            disabled={busy}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onPickCwd}
            disabled={busy}
          >
            Parcourir…
          </Button>
          {cwd ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setCwd("")}
              disabled={busy}
            >
              Effacer
            </Button>
          ) : null}
        </div>
      </FormField>

      <div>
        <Button
          disabled={disabled}
          onClick={() =>
            selected &&
            onStart({
              templateRef: `${selected.id}@${selected.version}`,
              seedKind,
              content,
              cwd: cwd.trim() || undefined,
            })
          }
        >
          {busy ? "Démarrage…" : "Démarrer"}
        </Button>
      </div>
    </div>
  );
};

export default WorkflowStartForm;
