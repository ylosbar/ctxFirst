import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Braces, Save, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { FormField } from "@/components/ui/form-field";
import { FormLabel } from "@/components/ui/form-label";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/ui/empty-state";
import { useT } from "../../i18n";
import { useServices } from "../../di/services-provider";
import type {
  ArtifactSchemaRefView,
  ArtifactSchemaSourceView,
  ArtifactSchemaView,
  SaveArtifactSchemaDraft,
} from "../../../domain/workflow/types";
import {
  computeStructuralHashAsync,
  truncateStructuralHash,
} from "@shared/wf/structural-hash";
import type { EditorUri, WorkbenchApi } from "../../workbench/types";
import { useRegisterArtifactSchemaEditor } from "../../stores/artifact-schema-editor-store";
import useArtifactSchemas from "../../hooks/useArtifactSchemas";
import ParserManager from "./ParserManager";

const ARTIFACT_SCHEMA_URI_PREFIX = "artifact-schema://";
const NEW_TYPE_URI = "artifact-schema://new";

/** `name` set by the registry's `ArtifactSchemaBreakingChangeError` (main). */
const BREAKING_CHANGE_ERROR_NAME = "ArtifactSchemaBreakingChangeError";

/**
 * The registry's BACKWARD gate rejects an in-place overwrite that would break
 * existing data by throwing `ArtifactSchemaBreakingChangeError`, whose `name`
 * and self-contained `message` both survive the IPC boundary. We discriminate
 * it here so the editor can offer the `allowBreaking` override instead of
 * surfacing an opaque save failure. Returns the author-facing message (with any
 * leading error-name prefix stripped), or `null` for any other error.
 */
const breakingChangeMessage = (e: unknown): string | null => {
  if (!(e instanceof Error)) return null;
  const isBreaking =
    e.name === BREAKING_CHANGE_ERROR_NAME ||
    e.message.includes(BREAKING_CHANGE_ERROR_NAME);
  if (!isBreaking) return null;
  return e.message.replace(/^.*?ArtifactSchemaBreakingChangeError:\s*/, "");
};

type Buffer = {
  id: string;
  version: string;
  name: string;
  description: string;
  /** JSON text for the simplified schema (always required). */
  simplifiedSchemaText: string;
  /** JSON text for the raw schema, empty for "none". */
  rawSchemaText: string;
  /** Raw payload sample (free-form text). */
  sampleRaw: string;
  /** Optional `{{field}}` Markdown projection gabarit. */
  markdownTemplate: string;
};

const emptyBuffer = (): Buffer => ({
  id: "",
  version: "v1",
  name: "",
  description: "",
  simplifiedSchemaText: '{\n  "type": "object"\n}',
  rawSchemaText: "",
  sampleRaw: "",
  markdownTemplate: "",
});

const fromView = (t: ArtifactSchemaView): Buffer => ({
  id: t.id,
  version: t.version,
  name: t.name,
  description: t.description,
  simplifiedSchemaText: JSON.stringify(t.simplifiedSchema, null, 2),
  rawSchemaText: t.rawSchema ? JSON.stringify(t.rawSchema, null, 2) : "",
  sampleRaw: t.sampleRaw ?? "",
  markdownTemplate: t.markdownTemplate ?? "",
});

const buffersEqual = (a: Buffer, b: Buffer): boolean =>
  a.id === b.id &&
  a.version === b.version &&
  a.name === b.name &&
  a.description === b.description &&
  a.simplifiedSchemaText === b.simplifiedSchemaText &&
  a.rawSchemaText === b.rawSchemaText &&
  a.sampleRaw === b.sampleRaw &&
  a.markdownTemplate === b.markdownTemplate;

const parseRefFromUri = (uri: string): ArtifactSchemaRefView | null => {
  if (uri === NEW_TYPE_URI) return null;
  const tail = uri.slice(ARTIFACT_SCHEMA_URI_PREFIX.length);
  const at = tail.lastIndexOf("@");
  if (at <= 0) return null;
  return { id: tail.slice(0, at), version: tail.slice(at + 1) };
};

const SLUG_RE = /^[a-z][a-z0-9.-]*$/;
const VERSION_RE = /^v[0-9]+$/;

/** Canonical reference label for a schema, mirroring the main-process kinds. */
const sourceRefLabel = (t: ArtifactSchemaView): string => {
  switch (t.source.kind) {
    case "user":
      return `user:${t.id}@${t.version}`;
    case "plugin":
      return `plugin:${t.source.pluginId}:${t.id}@${t.version}`;
    default:
      return t.id;
  }
};

/** Top-level property summary derived from a simplified JSON Schema. */
type PropertyPreview = { name: string; type: string; required: boolean };

const derivePropertyPreview = (text: string): PropertyPreview[] | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const props = obj.properties;
  if (!props || typeof props !== "object") return null;
  const required = Array.isArray(obj.required)
    ? obj.required.filter((x): x is string => typeof x === "string")
    : [];
  return Object.entries(props as Record<string, unknown>).map(([name, def]) => {
    const d = def && typeof def === "object" ? (def as Record<string, unknown>) : {};
    const type = Array.isArray(d.type)
      ? d.type.join(" | ")
      : typeof d.type === "string"
        ? d.type
        : "—";
    return { name, type, required: required.includes(name) };
  });
};

type Props = {
  readonly uri: EditorUri;
  readonly api: WorkbenchApi;
};

const ArtifactSchemaEditor = ({ uri, api }: Props) => {
  const t = useT();
  const services = useServices();
  const queryClient = useQueryClient();
  const isNew = uri === NEW_TYPE_URI;
  const originalRef = parseRefFromUri(uri);

  const [type, setType] = useState<ArtifactSchemaView | null>(null);
  const [buffer, setBuffer] = useState<Buffer>(emptyBuffer);
  const [savedBuffer, setSavedBuffer] = useState<Buffer>(emptyBuffer);
  const [loading, setLoading] = useState<boolean>(!isNew);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Set when the BACKWARD gate refuses an in-place overwrite. Holds the blast
  // radius message and gates the "overwrite anyway" affordance (retry with
  // `allowBreaking`). Distinct from `formError` so it renders as a danger panel
  // with an override, not a plain inline error.
  const [breaking, setBreaking] = useState<string | null>(null);
  // Flips on the first save attempt so "required" errors only surface once the
  // user actually tries to commit — not while they're still filling the form.
  const [submitted, setSubmitted] = useState(false);
  // §5.7 — fingerprint of the *current buffer*, recomputed live so the user
  // sees their edits land in a new hash before saving. Distinct from
  // `type?.structuralHash`, which is the persisted one (and what `record:<…>`
  // resolves to). Falls back to `type?.structuralHash` when the buffer's
  // JSON Schema doesn't parse — the saved value is still meaningful.
  const [liveHash, setLiveHash] = useState<string | null>(null);
  const { types: availableArtifactSchemas } = useArtifactSchemas();

  const refresh = useCallback(async () => {
    if (isNew || !originalRef) {
      const empty = emptyBuffer();
      setBuffer(empty);
      setSavedBuffer(empty);
      setType(null);
      setLoading(false);
      setNotFound(false);
      return;
    }
    setLoading(true);
    setNotFound(false);
    try {
      const all = await services.listArtifactSchemas();
      const found = all.find(
        (t) => t.id === originalRef.id && t.version === originalRef.version,
      );
      if (!found) {
        setType(null);
        setNotFound(true);
        const fallback = { ...emptyBuffer(), id: originalRef.id, version: originalRef.version };
        setBuffer(fallback);
        setSavedBuffer(fallback);
      } else {
        setType(found);
        const next = fromView(found);
        setBuffer(next);
        setSavedBuffer(next);
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [isNew, originalRef?.id, originalRef?.version, services]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const dirty = useMemo(
    () => !buffersEqual(buffer, savedBuffer),
    [buffer, savedBuffer],
  );

  // Recompute the structural hash from the current buffer. The user has no
  // `extends` field exposed yet (refinement editing is §2 follow-up UI), so
  // any persisted parent comes from the loaded `type` and is preserved here.
  // On JSON parse failure we leave the previous hash visible — the chip is
  // a fingerprint, not a validity beacon (formError owns that role).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let simplifiedSchema: unknown;
      try {
        simplifiedSchema = JSON.parse(buffer.simplifiedSchemaText);
      } catch {
        return;
      }
      const extendsKind = type?.extends ?? null;
      // Index the loaded schemas by canonical kind so a parent's hash is
      // available without another async hop. A missing parent collapses to
      // `null` exactly like the main-process resolver — graceful when the
      // refinement hasn't been wired up yet.
      const parentHash = (kind: string): string | null => {
        const match = availableArtifactSchemas.find(
          (t) =>
            t.id === kind ||
            (t.source.kind === "user" && `user:${t.id}@${t.version}` === kind) ||
            (t.source.kind === "plugin" &&
              `plugin:${t.source.pluginId}:${t.id}@${t.version}` === kind),
        );
        return match?.structuralHash ?? null;
      };
      const hash = await computeStructuralHashAsync(
        { simplifiedSchema, extends: extendsKind },
        parentHash,
      );
      if (!cancelled) setLiveHash(hash);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    buffer.simplifiedSchemaText,
    type?.extends,
    availableArtifactSchemas,
  ]);

  // Surface a hint when the current buffer collapses to the same hash as
  // another (already-saved) schema. Exclude the row we are editing so a
  // round-trip save → re-edit doesn't accuse the user of duplicating
  // themselves. The picker is named "identique à <X>" so the user can decide
  // to *reference* the existing type instead of saving a duplicate.
  const collisionMatch = useMemo(() => {
    if (!liveHash) return null;
    return (
      availableArtifactSchemas.find((t) => {
        if (t.structuralHash !== liveHash) return false;
        if (
          !isNew &&
          originalRef &&
          t.id === originalRef.id &&
          t.version === originalRef.version
        ) {
          return false;
        }
        return true;
      }) ?? null
    );
  }, [liveHash, availableArtifactSchemas, isNew, originalRef?.id, originalRef?.version]);

  const editorHandle = useMemo(
    () => ({
      uri,
      id: buffer.id,
      version: buffer.version,
      name: buffer.name,
      description: buffer.description,
      simplifiedSchemaText: buffer.simplifiedSchemaText,
      rawSchemaText: buffer.rawSchemaText,
      sampleRaw: buffer.sampleRaw,
      isNew,
      dirty,
      source: type?.source ?? null,
    }),
    [
      uri,
      buffer.id,
      buffer.version,
      buffer.name,
      buffer.description,
      buffer.simplifiedSchemaText,
      buffer.rawSchemaText,
      buffer.sampleRaw,
      isNew,
      dirty,
      type?.source,
    ],
  );
  useRegisterArtifactSchemaEditor(uri, editorHandle);

  const isEditable = isNew || type?.source.kind === "user";

  // Per-field errors, derived live from the buffer. `forceSubmit` makes the
  // "required" checks fire even when a field is empty — used both for the
  // inline display (once the user has hit save) and the save gate itself.
  const computeFieldErrors = useCallback(
    (forceSubmit: boolean) => {
      const errs: {
        id?: string;
        version?: string;
        name?: string;
      } = {};
      const id = buffer.id.trim();
      if (forceSubmit && !id) {
        errs.id = t("artifactSchemas.editor.errors.idRequired");
      } else if (id && !SLUG_RE.test(buffer.id)) {
        errs.id = t("artifactSchemas.editor.errors.idSlug");
      }
      if (!VERSION_RE.test(buffer.version)) {
        errs.version = t("artifactSchemas.editor.errors.versionFormat");
      }
      if (forceSubmit && !buffer.name.trim()) {
        errs.name = t("artifactSchemas.editor.errors.nameRequired");
      }
      return errs;
    },
    [buffer.id, buffer.version, buffer.name, t],
  );

  const fieldErrors = useMemo(
    () => computeFieldErrors(submitted),
    [computeFieldErrors, submitted],
  );

  const simplifiedJsonError = useMemo(() => {
    try {
      JSON.parse(buffer.simplifiedSchemaText);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }, [buffer.simplifiedSchemaText]);

  const rawJsonError = useMemo(() => {
    if (!buffer.rawSchemaText.trim()) return null;
    try {
      JSON.parse(buffer.rawSchemaText);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }, [buffer.rawSchemaText]);

  const propertyPreview = useMemo(
    () => derivePropertyPreview(buffer.simplifiedSchemaText),
    [buffer.simplifiedSchemaText],
  );

  // `allowBreaking` overrides the registry's BACKWARD gate for the single save
  // it rides on — passed only by the "overwrite anyway" affordance once the
  // author has acknowledged the blast radius surfaced in the danger panel.
  const save = async (allowBreaking = false) => {
    setFormError(null);
    setBreaking(null);
    setSubmitted(true);
    const errs = computeFieldErrors(true);
    if (Object.keys(errs).length > 0 || simplifiedJsonError || rawJsonError) {
      return;
    }
    setBusy(true);
    try {
      const draft: SaveArtifactSchemaDraft = {
        id: buffer.id.trim(),
        version: buffer.version.trim(),
        name: buffer.name.trim(),
        description: buffer.description.trim() || undefined,
        simplifiedSchema: JSON.parse(buffer.simplifiedSchemaText),
        rawSchema: buffer.rawSchemaText.trim()
          ? JSON.parse(buffer.rawSchemaText)
          : null,
        sampleRaw: buffer.sampleRaw.trim() ? buffer.sampleRaw : null,
        markdownTemplate: buffer.markdownTemplate.trim()
          ? buffer.markdownTemplate
          : null,
        allowBreaking: allowBreaking || undefined,
      };
      await services.saveArtifactSchema(draft);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["artifact-schemas"] }),
        queryClient.invalidateQueries({ queryKey: ["parsers"] }),
      ]);

      const newUri = `${ARTIFACT_SCHEMA_URI_PREFIX}${draft.id}@${draft.version}`;
      if (uri !== newUri) {
        api.openEditor(newUri, { focus: true });
        api.closeEditor(uri);
        return;
      }
      setSavedBuffer(buffer);
      await refresh();
    } catch (e) {
      const blastRadius = breakingChangeMessage(e);
      if (blastRadius) setBreaking(blastRadius);
      else setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!originalRef) return;
    setBusy(true);
    setFormError(null);
    try {
      await services.deleteArtifactSchema(originalRef);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["artifact-schemas"] }),
        queryClient.invalidateQueries({ queryKey: ["parsers"] }),
      ]);
      api.closeEditor(uri);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingState />;
  if (notFound) {
    return (
      <EmptyState
        title={t("artifactSchemas.editor.notFoundTitle")}
        description={t("artifactSchemas.editor.notFoundDescription", {
          ref: `${originalRef?.id}@${originalRef?.version}`,
        })}
      />
    );
  }

  const ref: ArtifactSchemaRefView | null =
    !isNew && type ? { id: type.id, version: type.version } : null;

  const sourceText = (source: ArtifactSchemaSourceView): string => {
    switch (source.kind) {
      case "user":
        return t("artifactSchemas.editor.source.user");
      case "plugin":
        return t("artifactSchemas.editor.source.plugin", {
          pluginId: source.pluginId,
        });
      default:
        return t("artifactSchemas.editor.source.builtin");
    }
  };

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden">
      <PageHeader
        title={
          isNew ? t("artifactSchemas.editor.newTitle") : buffer.name || buffer.id
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>
              {isNew
                ? t("artifactSchemas.editor.newDescription")
                : t("artifactSchemas.editor.source.label", {
                    source: type ? sourceText(type.source) : "",
                  })}
            </span>
            {liveHash && (
              <span
                title={`record:${liveHash}`}
                className="rounded border border-border bg-muted/30 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
              >
                record:{truncateStructuralHash(liveHash)}
              </span>
            )}
          </span>
        }
        actions={
          <>
            {!isNew && type?.source.kind === "user" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void remove()}
                disabled={busy}
              >
                <Trash2 className="size-3.5" /> {t("artifactSchemas.editor.delete")}
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => void save()}
              disabled={busy || !isEditable || !dirty}
            >
              <Save className="size-3.5" />
              {dirty
                ? t("artifactSchemas.editor.save")
                : t("artifactSchemas.editor.upToDate")}
            </Button>
          </>
        }
      />

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-4">
          {formError && <ErrorState variant="inline" message={formError} />}
          {breaking && (
            <Callout
              tone="danger"
              title={t("artifactSchemas.editor.breaking.title")}
              actions={
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setBreaking(null)}
                    disabled={busy}
                  >
                    {t("artifactSchemas.editor.breaking.dismiss")}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => void save(true)}
                    disabled={busy}
                  >
                    {t("artifactSchemas.editor.breaking.overwrite")}
                  </Button>
                </div>
              }
            >
              <p className="whitespace-pre-wrap">{breaking}</p>
            </Callout>
          )}
          {collisionMatch && (
            <Callout
              tone="warning"
              title={t("artifactSchemas.editor.collision.title")}
            >
              {t("artifactSchemas.editor.collision.body", {
                name: collisionMatch.name,
                ref: sourceRefLabel(collisionMatch),
              })}
            </Callout>
          )}
          {!isEditable && !isNew && (
            <Callout
              tone="info"
              title={t("artifactSchemas.editor.readonly.title")}
            >
              {t("artifactSchemas.editor.readonly.body", {
                source: type?.source.kind ?? "",
              })}
            </Callout>
          )}

          <Section
            title={t("artifactSchemas.editor.sections.identity")}
            collapsible
            defaultOpen
            persistKey="app.artifact-schemas.editor.identity"
            variant="card"
            density="compact"
          >
            <div className="grid grid-cols-2 gap-3">
              <FormField
                label={t("artifactSchemas.editor.fields.idLabel")}
                description={t("artifactSchemas.editor.fields.idHint")}
                error={fieldErrors.id}
              >
                <Input
                  value={buffer.id}
                  onChange={(e) => setBuffer((p) => ({ ...p, id: e.target.value }))}
                  disabled={!isNew}
                  placeholder="shopify-order"
                />
              </FormField>
              <FormField
                label={t("artifactSchemas.editor.fields.versionLabel")}
                description={t("artifactSchemas.editor.fields.versionHint")}
                error={fieldErrors.version}
              >
                <Input
                  value={buffer.version}
                  onChange={(e) =>
                    setBuffer((p) => ({ ...p, version: e.target.value }))
                  }
                  disabled={!isNew}
                  placeholder="v1"
                />
              </FormField>
            </div>

            <FormField
              label={t("artifactSchemas.editor.fields.nameLabel")}
              error={fieldErrors.name}
            >
              <Input
                value={buffer.name}
                onChange={(e) => setBuffer((p) => ({ ...p, name: e.target.value }))}
                disabled={!isEditable}
                placeholder="Shopify /orders response"
              />
            </FormField>

            <FormField label={t("artifactSchemas.editor.fields.descriptionLabel")}>
              <Textarea
                value={buffer.description}
                onChange={(e) =>
                  setBuffer((p) => ({ ...p, description: e.target.value }))
                }
                disabled={!isEditable}
                rows={2}
              />
            </FormField>
          </Section>

          <Section
            title={t("artifactSchemas.editor.sections.schema")}
            collapsible
            defaultOpen
            persistKey="app.artifact-schemas.editor.schema"
            variant="card"
            density="compact"
          >
            <JsonField
              label={t("artifactSchemas.editor.fields.simplifiedLabel")}
              hint={t("artifactSchemas.editor.fields.simplifiedHint")}
              value={buffer.simplifiedSchemaText}
              onChange={(v) =>
                setBuffer((p) => ({ ...p, simplifiedSchemaText: v }))
              }
              disabled={!isEditable}
              error={simplifiedJsonError}
              validLabel={t("artifactSchemas.editor.json.valid")}
              invalidLabel={t("artifactSchemas.editor.json.invalid")}
              formatLabel={t("artifactSchemas.editor.json.format")}
            />

            {propertyPreview && (
              <div className="rounded-md border border-border bg-muted/20 p-2.5">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  {t("artifactSchemas.editor.preview.title")}
                </p>
                {propertyPreview.length === 0 ? (
                  <p className="text-xs text-muted-foreground/80">
                    {t("artifactSchemas.editor.preview.empty")}
                  </p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {propertyPreview.map((prop) => (
                      <li key={prop.name}>
                        <Badge tone="neutral" size="sm" font="mono">
                          {prop.name}
                          <span className="text-muted-foreground/70">
                            {prop.type}
                          </span>
                          {prop.required && (
                            <span className="text-amber-600 before:mx-1 before:content-['·'] dark:text-amber-400">
                              {t("artifactSchemas.editor.preview.required")}
                            </span>
                          )}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <Section
              title={t("artifactSchemas.editor.fields.rawLabel")}
              description={t("artifactSchemas.editor.fields.rawHint")}
              collapsible
              defaultOpen={false}
              persistKey="app.artifact-schemas.editor.raw-schema"
              variant="card"
              level={4}
              density="compact"
            >
              <JsonField
                value={buffer.rawSchemaText}
                onChange={(v) => setBuffer((p) => ({ ...p, rawSchemaText: v }))}
                disabled={!isEditable}
                error={rawJsonError}
                rows={8}
                validLabel={t("artifactSchemas.editor.json.valid")}
                invalidLabel={t("artifactSchemas.editor.json.invalid")}
                formatLabel={t("artifactSchemas.editor.json.format")}
              />
            </Section>
          </Section>

          <Section
            title={t("artifactSchemas.editor.sections.example")}
            collapsible
            defaultOpen
            persistKey="app.artifact-schemas.editor.example"
            variant="card"
            density="compact"
          >
            <FormField
              label={t("artifactSchemas.editor.fields.sampleRawLabel")}
              description={t("artifactSchemas.editor.fields.sampleRawHint")}
            >
              <Textarea
                value={buffer.sampleRaw}
                onChange={(e) =>
                  setBuffer((p) => ({ ...p, sampleRaw: e.target.value }))
                }
                disabled={!isEditable}
                className="font-mono text-xs"
                rows={8}
              />
            </FormField>

            <FormField
              label={t("artifactSchemas.editor.fields.markdownTemplateLabel")}
              description={t("artifactSchemas.editor.fields.markdownTemplateHint")}
            >
              <Textarea
                value={buffer.markdownTemplate}
                onChange={(e) =>
                  setBuffer((p) => ({ ...p, markdownTemplate: e.target.value }))
                }
                disabled={!isEditable}
                className="font-mono text-xs"
                rows={6}
                placeholder={"## {{title}}\n\n{{summary}}"}
              />
            </FormField>

            {ref && (
              <ParserManager
                forType={ref}
                defaultSampleRaw={buffer.sampleRaw}
                readOnly={!isEditable}
              />
            )}
          </Section>
        </div>
      </ScrollArea>
    </div>
  );
};

type JsonFieldProps = {
  readonly label?: string;
  readonly hint?: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly disabled?: boolean;
  readonly rows?: number;
  /** Parse error message (already computed by the parent), shown under the field. */
  readonly error?: string | null;
  readonly validLabel: string;
  readonly invalidLabel: string;
  readonly formatLabel: string;
};

/** A JSON textarea with a live validity badge, a "format" action, and an
 *  inline parse error — the friendly wrapper around raw schema editing. */
const JsonField = ({
  label,
  hint,
  value,
  onChange,
  disabled,
  rows = 10,
  error,
  validLabel,
  invalidLabel,
  formatLabel,
}: JsonFieldProps) => {
  const isEmpty = value.trim() === "";
  const isValid = !isEmpty && !error;

  const handleFormat = () => {
    try {
      onChange(JSON.stringify(JSON.parse(value), null, 2));
    } catch {
      // Button is disabled when invalid; nothing to do on a stray click.
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        {label !== undefined ? <FormLabel>{label}</FormLabel> : <span />}
        <div className="flex items-center gap-2">
          {isValid && (
            <Badge tone="success" size="sm">
              {validLabel}
            </Badge>
          )}
          {error && (
            <Badge tone="danger" size="sm">
              {invalidLabel}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleFormat}
            disabled={disabled || !isValid}
          >
            <Braces className="size-3.5" /> {formatLabel}
          </Button>
        </div>
      </div>
      {hint !== undefined ? (
        <p className="text-xs text-muted-foreground/80">{hint}</p>
      ) : null}
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="font-mono text-xs"
        rows={rows}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
};

export default ArtifactSchemaEditor;
