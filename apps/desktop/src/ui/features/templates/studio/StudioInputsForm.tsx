import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  ArtifactKind,
  NodeSpecView,
  PortView,
} from "../../../../domain/workflow/types";
import useArtifactSchemas from "../../../hooks/useArtifactSchemas";
import {
  buildWildcardKindChoices,
  type StudioInputDraft,
} from "./studio-state";

const MAX_LIST_ENTRIES = 10;

const SHORT_KINDS: ReadonlySet<string> = new Set([
  "LinearRef",
  "Path",
]);

type Props = {
  spec: Pick<NodeSpecView, "inputs">;
  inputs: ReadonlyArray<StudioInputDraft>;
  onChange: (next: ReadonlyArray<StudioInputDraft>) => void;
  onSubmit?: () => void;
};

const StudioInputsForm = ({ spec, inputs, onChange, onSubmit }: Props) => {
  const { types } = useArtifactSchemas();
  const wildcardChoices = useMemo(
    () => buildWildcardKindChoices(types),
    [types],
  );

  if (spec.inputs.length === 0) {
    return (
      <p className="px-3 text-xs italic text-muted-foreground">
        Cette node n'a aucune entrée. Cliquez sur "Tester la node" pour lancer
        l'exécution.
      </p>
    );
  }

  const updateEntry = (
    portName: string,
    index: number,
    patch: Partial<StudioInputDraft>,
  ) => {
    let seen = -1;
    const next = inputs.map((entry) => {
      if (entry.port !== portName) return entry;
      seen += 1;
      return seen === index ? { ...entry, ...patch } : entry;
    });
    onChange(next);
  };

  const addEntry = (port: PortView, kind: ArtifactKind) => {
    onChange([
      ...inputs,
      { port: port.name, kind, content: "", included: true },
    ]);
  };

  const removeEntry = (portName: string, index: number) => {
    let seen = -1;
    const next = inputs.filter((entry) => {
      if (entry.port !== portName) return true;
      seen += 1;
      return seen !== index;
    });
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-3 px-3">
      {spec.inputs.map((port) => (
        <PortField
          key={port.name}
          port={port}
          entries={inputs.filter((i) => i.port === port.name)}
          wildcardChoices={wildcardChoices}
          onUpdate={(index, patch) => updateEntry(port.name, index, patch)}
          onAdd={(kind) => addEntry(port, kind)}
          onRemove={(index) => removeEntry(port.name, index)}
          onSubmit={onSubmit}
        />
      ))}
    </div>
  );
};

type PortFieldProps = {
  port: PortView;
  entries: ReadonlyArray<StudioInputDraft>;
  wildcardChoices: ReadonlyArray<ArtifactKind>;
  onUpdate: (index: number, patch: Partial<StudioInputDraft>) => void;
  onAdd: (kind: ArtifactKind) => void;
  onRemove: (index: number) => void;
  onSubmit?: () => void;
};

const PortField = ({
  port,
  entries,
  wildcardChoices,
  onUpdate,
  onAdd,
  onRemove,
  onSubmit,
}: PortFieldProps) => {
  const isWildcard = port.kinds.includes("*");
  const isPolymorphic = port.kinds.length > 1 && !isWildcard;
  const isList = port.isList === true;
  const isOptional = port.optional === true;

  const acceptedKinds = (isWildcard
    ? wildcardChoices
    : (port.kinds as ReadonlyArray<ArtifactKind>));

  const main = entries[0];
  const included = main?.included ?? !isOptional;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs font-semibold">{port.name}</span>
          {isOptional ? (
            <span className="text-2xs uppercase tracking-wide text-muted-foreground">
              optional
            </span>
          ) : null}
          {isList ? (
            <span className="text-2xs uppercase tracking-wide text-muted-foreground">
              list
            </span>
          ) : null}
        </div>
        <span className="text-2xs text-muted-foreground">
          {port.kinds.join(" | ")}
        </span>
      </div>

      {isOptional ? (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={included}
            onCheckedChange={(v) => {
              if (entries.length === 0) {
                if (v) onAdd(acceptedKinds[0]);
              } else {
                entries.forEach((_, i) =>
                  onUpdate(i, { included: Boolean(v) }),
                );
              }
            }}
          />
          <span>Inclure cet input</span>
        </label>
      ) : null}

      {included
        ? entries.map((entry, index) => (
            <PortEntry
              key={`${port.name}-${index}`}
              entry={entry}
              acceptedKinds={acceptedKinds}
              showKindSelect={isPolymorphic || isWildcard}
              canRemove={isList && entries.length > 1}
              onUpdate={(patch) => onUpdate(index, patch)}
              onRemove={() => onRemove(index)}
              onSubmit={onSubmit}
            />
          ))
        : null}

      {isList && included && entries.length < MAX_LIST_ENTRIES ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="self-start"
          onClick={() =>
            onAdd(
              (main?.kind) ?? acceptedKinds[0],
            )
          }
        >
          <Plus className="mr-1 size-3" />
          Ajouter une entrée
        </Button>
      ) : null}
    </div>
  );
};

type PortEntryProps = {
  entry: StudioInputDraft;
  acceptedKinds: ReadonlyArray<ArtifactKind>;
  showKindSelect: boolean;
  canRemove: boolean;
  onUpdate: (patch: Partial<StudioInputDraft>) => void;
  onRemove: () => void;
  onSubmit?: () => void;
};

const PortEntry = ({
  entry,
  acceptedKinds,
  showKindSelect,
  canRemove,
  onUpdate,
  onRemove,
  onSubmit,
}: PortEntryProps) => {
  const isShort = SHORT_KINDS.has(entry.kind);

  const handleKey = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onSubmit?.();
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      {showKindSelect ? (
        <Select
          value={entry.kind}
          onChange={(e) =>
            onUpdate({ kind: e.target.value as ArtifactKind })
          }
        >
          {acceptedKinds.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </Select>
      ) : null}

      <div className="flex items-start gap-2">
        {isShort ? (
          <Input
            className="font-mono"
            value={entry.content}
            placeholder={entry.kind === "LinearRef" ? "ex. ENG-1234" : ""}
            onChange={(e) => onUpdate({ content: e.target.value })}
            onKeyDown={handleKey}
          />
        ) : (
          <Textarea
            size="sm"
            className="min-h-[80px] font-mono"
            value={entry.content}
            onChange={(e) => onUpdate({ content: e.target.value })}
            onKeyDown={handleKey}
          />
        )}
        {canRemove ? (
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            onClick={onRemove}
            aria-label="Supprimer cette entrée"
          >
            <Trash2 className="size-3" />
          </Button>
        ) : null}
      </div>
    </div>
  );
};

export default StudioInputsForm;
