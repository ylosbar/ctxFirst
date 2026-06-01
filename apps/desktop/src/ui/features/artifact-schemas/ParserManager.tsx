import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Section } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { useT } from "../../i18n";
import { useServices } from "../../di/services-provider";
import useParsers from "../../hooks/useParsers";
import type {
  ArtifactSchemaRefView,
  ParserMode,
  ParserView,
  SaveParserDraft,
} from "../../../domain/workflow/types";
type Props = {
  readonly forType: ArtifactSchemaRefView;
  readonly defaultSampleRaw: string;
  readonly readOnly?: boolean;
};

const SLUG_RE = /^[a-z][a-z0-9.-]*$/;
const VERSION_RE = /^v[0-9]+$/;

type DraftBuffer = {
  id: string;
  version: string;
  mode: ParserMode;
  bodyText: string;
};

const emptyDraft = (mode: ParserMode = "declarative"): DraftBuffer => ({
  id: "",
  version: "v1",
  mode,
  bodyText:
    mode === "declarative"
      ? '{\n  "operations": [\n    { "op": "pick", "path": "$" }\n  ]\n}'
      : "export default (raw) => raw;",
});

const parsePreviewRaw = (text: string, mode: ParserMode): unknown => {
  if (!text.trim()) return null;
  if (mode === "declarative") return JSON.parse(text);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const fromParser = (p: ParserView): DraftBuffer => ({
  id: p.id,
  version: p.version,
  mode: p.mode,
  bodyText:
    p.mode === "declarative"
      ? JSON.stringify(p.body, null, 2)
      : typeof p.body === "string"
        ? p.body
        : JSON.stringify(p.body, null, 2),
});

const ParserManager = ({ forType, defaultSampleRaw, readOnly }: Props) => {
  const t = useT();
  const services = useServices();
  const queryClient = useQueryClient();
  const { parsers, loading, error } = useParsers(forType);
  const [editingRefKey, setEditingRefKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);

  const invalidateParserCaches = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["parsers"] }),
        queryClient.invalidateQueries({ queryKey: ["artifact-schemas"] }),
      ]),
    [queryClient],
  );

  const editingParser = useMemo(
    () =>
      parsers.find(
        (p) => `${p.id}@${p.version}` === editingRefKey,
      ) ?? null,
    [parsers, editingRefKey],
  );

  const startCreate = () => {
    setEditingRefKey(null);
    setCreating(true);
    setOpError(null);
  };

  const startEdit = (p: ParserView) => {
    if (p.source.kind !== "user") return;
    setEditingRefKey(`${p.id}@${p.version}`);
    setCreating(false);
    setOpError(null);
  };

  const cancel = () => {
    setCreating(false);
    setEditingRefKey(null);
    setOpError(null);
  };

  const remove = async (p: ParserView) => {
    setBusy(true);
    setOpError(null);
    try {
      await services.deleteParser({ id: p.id, version: p.version });
      await invalidateParserCaches();
      if (editingRefKey === `${p.id}@${p.version}`) cancel();
    } catch (e) {
      setOpError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title={t("artifactSchemas.parsers.title")}
      description={t("artifactSchemas.parsers.description")}
      collapsible
      defaultOpen
      persistKey="app.artifact-schemas.parsers"
      variant="card"
      density="compact"
      actions={
        <Button
          size="sm"
          variant="outline"
          onClick={startCreate}
          disabled={readOnly || busy}
        >
          <Plus className="size-3.5" /> {t("artifactSchemas.parsers.newParser")}
        </Button>
      }
    >
      {error && <ErrorState variant="inline" message={error} />}
      {opError && <ErrorState variant="inline" message={opError} />}

      <ul className="flex flex-col gap-1">
        {loading && parsers.length === 0 ? (
          <li className="text-xs text-muted-foreground">{t("common.loading")}</li>
        ) : parsers.length === 0 ? (
          <li className="text-xs text-muted-foreground">
            {t("artifactSchemas.parsers.empty")}
          </li>
        ) : (
          parsers.map((p) => {
            const key = `${p.id}@${p.version}`;
            const isPlugin = p.source.kind === "plugin";
            return (
              <li
                key={key}
                className={cn(
                  "flex items-center justify-between gap-2 rounded border border-border bg-background px-2 py-1.5 text-xs",
                )}
              >
                <div className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1.5 font-mono">
                    {key}
                    <span className="rounded bg-muted px-1 text-2xs uppercase">
                      {p.mode}
                    </span>
                    {isPlugin && (
                      <span className="inline-flex items-center gap-1 rounded bg-accent px-1 text-2xs text-accent-foreground">
                        <Lock className="size-2.5" />
                        {t("artifactSchemas.parsers.pluginBadge", {
                          pluginId:
                            p.source.kind === "plugin" ? p.source.pluginId : "",
                        })}
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {!isPlugin && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => startEdit(p)}
                        disabled={busy || readOnly}
                        aria-label={t("artifactSchemas.parsers.editAriaLabel")}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => void remove(p)}
                        disabled={busy || readOnly}
                        aria-label={t("artifactSchemas.parsers.deleteAriaLabel")}
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })
        )}
      </ul>

      {(creating || editingParser) && (
        <ParserDraftEditor
          key={creating ? "new" : `${editingParser?.id}@${editingParser?.version}`}
          forType={forType}
          initial={editingParser ? fromParser(editingParser) : emptyDraft()}
          isNew={creating}
          defaultSampleRaw={defaultSampleRaw}
          onCancel={cancel}
          onSaved={() => {
            void invalidateParserCaches();
            cancel();
          }}
        />
      )}
    </Section>
  );
};

type DraftEditorProps = {
  readonly forType: ArtifactSchemaRefView;
  readonly initial: DraftBuffer;
  readonly isNew: boolean;
  readonly defaultSampleRaw: string;
  readonly onCancel: () => void;
  readonly onSaved: () => void;
};

const ParserDraftEditor = ({
  forType,
  initial,
  isNew,
  defaultSampleRaw,
  onCancel,
  onSaved,
}: DraftEditorProps) => {
  const t = useT();
  const services = useServices();
  const [draft, setDraft] = useState<DraftBuffer>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [previewRaw, setPreviewRaw] = useState<string>(defaultSampleRaw);
  const [previewOut, setPreviewOut] = useState<string>("");
  const [previewErr, setPreviewErr] = useState<string | null>(null);

  useEffect(() => {
    setDraft(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.id, initial.version]);

  const validate = (): string | null => {
    if (!SLUG_RE.test(draft.id))
      return "L'identifiant doit être un slug minuscule (a–z, 0–9, '.', '-').";
    if (!VERSION_RE.test(draft.version))
      return "La version doit avoir la forme 'v<n>' (ex. 'v1').";
    if (draft.mode === "declarative") {
      try {
        JSON.parse(draft.bodyText);
      } catch (e) {
        return `Corps JSON invalide : ${(e as Error).message}`;
      }
    }
    return null;
  };

  const parseBody = useCallback((): unknown => {
    if (draft.mode === "declarative") return JSON.parse(draft.bodyText);
    return draft.bodyText;
  }, [draft.bodyText, draft.mode]);

  const save = async () => {
    const ve = validate();
    if (ve) {
      setErr(ve);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const body = parseBody();
      const payload: SaveParserDraft = {
        id: draft.id.trim(),
        version: draft.version.trim(),
        forType,
        mode: draft.mode,
        body,
      };
      await services.saveParser(payload);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const runPreview = async () => {
    setPreviewErr(null);
    setPreviewOut("");
    try {
      const raw = parsePreviewRaw(previewRaw, draft.mode);
      const body = parseBody();
      const res = await services.runParser({
        kind: "inline",
        forType,
        mode: draft.mode,
        body,
        raw,
      });
      setPreviewOut(JSON.stringify(res.simplified, null, 2));
    } catch (e) {
      setPreviewErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="rounded-md border border-dashed border-border bg-card/60 p-3">
      <Section
        title={isNew ? "Nouveau parser" : `Édition : ${draft.id}@${draft.version}`}
        collapsible
        defaultOpen
        persistKey={`app.artifact-schemas.parser-draft.${isNew ? "new" : `${draft.id}@${draft.version}`}`}
        level={4}
        density="compact"
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={busy}>
              {t("common.save")}
            </Button>
          </>
        }
      >
      {err && <ErrorState variant="inline" message={err} />}

      <div className="grid grid-cols-3 gap-2">
        <FormField label="ID" className="col-span-1">
          <Input
            value={draft.id}
            onChange={(e) =>
              setDraft((p) => ({ ...p, id: e.target.value }))
            }
            disabled={!isNew}
            placeholder="shopify-order-trim"
          />
        </FormField>
        <FormField label={t("artifactSchemas.parsers.draft.versionLabel")} className="col-span-1">
          <Input
            value={draft.version}
            onChange={(e) =>
              setDraft((p) => ({ ...p, version: e.target.value }))
            }
            disabled={!isNew}
            placeholder="v1"
          />
        </FormField>
        <FormField label={t("artifactSchemas.parsers.draft.modeLabel")} className="col-span-1">
          <Select
            value={draft.mode}
            onChange={(e) =>
              setDraft((p) => ({ ...p, mode: e.target.value as ParserMode }))
            }
          >
            <option value="declarative">{t("artifactSchemas.parsers.draft.modes.declarative")}</option>
            <option value="code">{t("artifactSchemas.parsers.draft.modes.code")}</option>
          </Select>
        </FormField>
      </div>

      <FormField
        label={
          draft.mode === "declarative"
            ? "Corps déclaratif (JSON)"
            : "Code source — fonction `(raw) => simplified`, exécutée dans une VM QuickJS (timeout 500ms, mémoire 16Mo, sans I/O)"
        }
      >
        <Textarea
          value={draft.bodyText}
          onChange={(e) =>
            setDraft((p) => ({ ...p, bodyText: e.target.value }))
          }
          className="font-mono text-xs"
          rows={10}
        />
      </FormField>

      <Section
        title={t("artifactSchemas.parsers.playground.title")}
        collapsible
        defaultOpen
        persistKey={`app.artifact-schemas.parser-playground.${isNew ? "new" : `${draft.id}@${draft.version}`}`}
        variant="card"
        level={4}
        density="compact"
        className="bg-background/40"
        actions={
          <Button size="sm" variant="outline" onClick={() => void runPreview()}>
            {t("artifactSchemas.parsers.playground.run")}
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-2">
          <FormField
            label={
              draft.mode === "declarative"
                ? "Raw (JSON)"
                : "Raw (JSON ou texte brut)"
            }
          >
            <Textarea
              value={previewRaw}
              onChange={(e) => setPreviewRaw(e.target.value)}
              className="font-mono text-xs"
              rows={10}
            />
          </FormField>
          <FormField label={t("artifactSchemas.parsers.playground.simplifiedLabel")}>
            <Textarea
              value={previewErr ?? previewOut}
              readOnly
              className={cn(
                "font-mono text-xs",
                previewErr && "text-destructive",
              )}
              rows={10}
            />
          </FormField>
        </div>
      </Section>
      </Section>
    </div>
  );
};

export default ParserManager;
