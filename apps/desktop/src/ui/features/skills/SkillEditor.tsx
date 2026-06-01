import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Download,
  FileText,
  Save,
  ShieldAlert,
  Trash2,
  Variable,
} from "lucide-react";
import { extractPlaceholders } from "@shared/wf/placeholders";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/empty-state";
import { Separator } from "@/components/ui/separator";
import { STATUS_STYLE } from "@/components/ui/step-status";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useServices } from "../../di/services-provider";
import type { SkillDraft, SkillView } from "../../../domain/workflow/types";
import type { EditorUri, WorkbenchApi } from "../../workbench/types";
import { useRegisterSkillEditor } from "../../stores/skill-editor-store";
import { notifySkillCreated } from "./events";
import SkillSourceEditor from "./SkillSourceEditor";
import {
  EMPTY_TEMPLATE,
  NEW_SKILL_CURSOR_POS,
  skillToSource,
  sourceToSkill,
} from "./skill-source-codec";

const SKILL_URI_PREFIX = "skill://";
const NEW_SKILL_URI = "skill://new";

const refToFileName = (ref: string): string => {
  const safe = ref.trim().replace(/[\\/:*?"<>|]/g, "-");
  return `${safe || "prompt"}.md`;
};

type EditorState = {
  /** Full buffer: frontmatter + body. */
  source: string;
};

const emptyState = (): EditorState => ({ source: EMPTY_TEMPLATE });

const stateFromSkill = (skill: SkillView): EditorState => ({
  source: skillToSource(skill),
});

type ToolbarIconButtonProps = {
  readonly label: string;
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly destructive?: boolean;
};

const ToolbarIconButton = ({
  label,
  icon: Icon,
  onClick,
  disabled,
  destructive,
}: ToolbarIconButtonProps) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          className={cn(
            destructive && "text-destructive hover:text-destructive",
          )}
        >
          <Icon className="size-3.5" />
        </Button>
      }
    />
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
);

type Props = {
  readonly uri: EditorUri;
  readonly api: WorkbenchApi;
};

const SkillEditor = ({ uri, api }: Props) => {
  const services = useServices();
  const queryClient = useQueryClient();
  const isNew = uri === NEW_SKILL_URI;
  const originalRef = isNew ? null : uri.slice(SKILL_URI_PREFIX.length);

  const [state, setState] = useState<EditorState>(emptyState);
  const [savedState, setSavedState] = useState<EditorState>(emptyState);
  const [loading, setLoading] = useState<boolean>(!isNew);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) {
      const empty = emptyState();
      setState(empty);
      setSavedState(empty);
      setLoading(false);
      setNotFound(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    (async () => {
      try {
        const all = await services.listSkills();
        if (cancelled) return;
        const found = all.find((s) => s.ref === originalRef);
        if (!found) {
          const fallback = stateFromSkill({
            ref: originalRef ?? "",
            body: "",
            meta: {},
          });
          setNotFound(true);
          setState(fallback);
          setSavedState(fallback);
        } else {
          const loaded = stateFromSkill(found);
          setState(loaded);
          setSavedState(loaded);
        }
      } catch (e) {
        if (!cancelled) {
          setFormError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, originalRef, services]);

  const parsed = useMemo(() => sourceToSkill(state.source), [state.source]);
  const dirty = state.source !== savedState.source;

  const description = useMemo(() => {
    if (!parsed.ok) return "";
    const value = parsed.meta["description"];
    return typeof value === "string" ? value : "";
  }, [parsed]);

  const skillHandle = useMemo(
    () => ({
      uri,
      ref: parsed.ok ? parsed.ref : "",
      body: parsed.ok ? parsed.body : "",
      description,
      isNew,
      dirty,
    }),
    [uri, parsed, description, isNew, dirty],
  );
  useRegisterSkillEditor(uri, skillHandle);

  const bodyLines = useMemo(
    () => (parsed.ok ? parsed.body.split("\n").length : 0),
    [parsed],
  );
  const charCount = parsed.ok ? parsed.body.length : 0;
  const wordCount = useMemo(() => {
    if (!parsed.ok) return 0;
    const trimmed = parsed.body.trim();
    return trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  }, [parsed]);

  const placeholders = useMemo(
    () => (parsed.ok ? extractPlaceholders(parsed.body) : []),
    [parsed],
  );

  const handleSourceChange = useCallback((next: string) => {
    setState({ source: next });
    setFormError(null);
  }, []);

  const save = async () => {
    setFormError(null);
    if (!parsed.ok) {
      setFormError(parsed.error);
      return;
    }
    const newRef = parsed.ref;
    const renaming = !isNew && originalRef !== null && originalRef !== newRef;
    const movingToRealRef = isNew;

    setBusy(true);
    try {
      const draft: SkillDraft = {
        ref: newRef,
        body: parsed.body,
        meta: parsed.meta,
      };
      await services.saveSkill(draft);
      if (renaming && originalRef) {
        await services.deleteSkill(originalRef);
      }
      await queryClient.invalidateQueries({ queryKey: ["skills"] });
      if (movingToRealRef) {
        notifySkillCreated(newRef);
      }

      if (movingToRealRef || renaming) {
        const newUri = `${SKILL_URI_PREFIX}${newRef}`;
        api.openEditor(newUri, { focus: true });
        api.closeEditor(uri);
        return;
      }
      setSavedState(state);
      setNotFound(false);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const exportMarkdown = async () => {
    setFormError(null);
    setBusy(true);
    try {
      await services.saveTextFile({
        content: state.source,
        defaultFileName: refToFileName(parsed.ok ? parsed.ref : "prompt"),
        title: "Exporter le prompt",
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (isNew || !originalRef) return;
    const ok = window.confirm(
      `Supprimer le prompt "${originalRef}" ? Cette action est définitive.`,
    );
    if (!ok) return;
    setBusy(true);
    setFormError(null);
    try {
      await services.deleteSkill(originalRef);
      await queryClient.invalidateQueries({ queryKey: ["skills"] });
      api.closeEditor(uri);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const canSave = dirty && !busy && parsed.ok;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isSaveCombo =
        (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s";
      if (!isSaveCombo) return;
      e.preventDefault();
      if (!canSave) return;
      void save();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (loading) {
    return <LoadingState />;
  }

  const canDelete = !isNew && !notFound;
  const banner = formError ?? (!parsed.ok ? parsed.error : null);

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center gap-2 border-b bg-muted/10 px-3 py-2">
        <Variable className="size-4 shrink-0 text-[var(--chart-3)]" />
        <span className="flex-1 truncate text-sm font-medium">
          {parsed.ok ? (
            parsed.ref
          ) : (
            <em className="font-normal text-muted-foreground">sans nom</em>
          )}
        </span>
        <ToolbarIconButton
          label="Exporter en Markdown"
          icon={Download}
          onClick={exportMarkdown}
          disabled={busy || !state.source.trim()}
        />
        {canDelete ? (
          <ToolbarIconButton
            label="Supprimer le prompt"
            icon={Trash2}
            onClick={remove}
            disabled={busy}
            destructive
          />
        ) : null}
        <Separator orientation="vertical" className="mx-1 h-5" />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="sm"
                onClick={save}
                disabled={!canSave}
                aria-label="Sauvegarder le prompt"
              >
                <Save className="size-3.5" />
                {dirty ? "Enregistrer" : "À jour"}
              </Button>
            }
          />
          <TooltipContent>
            {dirty ? "Sauvegarder (⌘S)" : "Aucun changement"}
          </TooltipContent>
        </Tooltip>
      </header>

      {banner ? (
        <div
          role="alert"
          className="flex shrink-0 items-start gap-2 border-b border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive"
        >
          <AlertCircle className="mt-px size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{banner}</span>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col">
        <SkillSourceEditor
          value={state.source}
          onChange={handleSourceChange}
          disabled={busy}
          placeholder="Tu es un agent…"
          initialCaret={isNew ? NEW_SKILL_CURSOR_POS : undefined}
        />
      </div>

      {placeholders.length > 0 ? (
        <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-t bg-muted/10 px-3 py-1.5">
          <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            Variables
          </span>
          <div className="flex flex-wrap items-center gap-1">
            {placeholders.map((name) => (
              <Badge key={name} tone="info" size="sm" font="mono">
                {`{{${name}}}`}
              </Badge>
            ))}
          </div>
          <Tooltip>
            <TooltipTrigger
              render={
                <Badge tone="warning" size="sm" className="ml-auto cursor-help">
                  <ShieldAlert className="size-3" />
                  Source de confiance requise
                </Badge>
              }
            />
            <TooltipContent className="max-w-xs">
              Ces variables sont injectées telles quelles dans le prompt.
              Assurez-vous qu'elles proviennent d'une source de confiance : une
              valeur non vérifiée peut détourner les instructions de la skill
              (injection de prompt).
            </TooltipContent>
          </Tooltip>
        </div>
      ) : null}

      <div className="flex h-6 shrink-0 items-center gap-3 border-t bg-muted/20 px-3 text-2xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <FileText className="size-3" />
          Markdown
        </span>
        <span>
          {bodyLines} ligne{bodyLines > 1 ? "s" : ""}
        </span>
        <span>{charCount} car.</span>
        <span>
          {wordCount} mot{wordCount > 1 ? "s" : ""}
        </span>
        <div className="flex-1" />
        {dirty ? (
          <span
            className={cn(
              "flex items-center gap-1",
              STATUS_STYLE.awaitingHuman.text,
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                STATUS_STYLE.awaitingHuman.dot,
              )}
            />
            Modifications non sauvegardées
          </span>
        ) : (
          <span>Sauvegardé</span>
        )}
        <span className="font-mono">UTF-8</span>
      </div>
    </section>
  );
};

export default SkillEditor;
