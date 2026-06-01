import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useNavigate } from "react-router";
import { Dialog } from "@base-ui/react/dialog";
import {
  ArrowLeft,
  Brain,
  CornerDownLeft,
  FileText,
  GitBranch,
  Palette,
  PanelLeft,
  PanelRight,
  Play,
  Plus,
  Search,
  SearchX,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useServices } from "../../di/services-provider";
import type {
  ArtifactSchemaView,
  InstanceStatus,
  InstanceSummaryView,
  SkillView,
  TemplateView,
} from "../../../domain/workflow/types";
import {
  useWorkbench,
  useWorkbenchPrefs,
} from "../../workbench/WorkbenchProvider";
import {
  THEMES,
  useSetPreviewTheme,
  useSetTheme,
  useTheme,
  type ThemeId,
} from "../../stores/appearance-store";
import {
  NEW_TEMPLATE_URI,
  templateUriFor,
} from "../../features/templates/template-uri";
import { runUriFor } from "../../features/runs/run-uri";
import { useT } from "@/ui/i18n";
import { cn } from "@/lib/utils";

const NEW_SKILL_URI = "skill://new";
const SKILL_URI_PREFIX = "skill://";
const ARTIFACT_SCHEMA_URI_PREFIX = "artifact-schema://";

type ItemKind =
  | "run"
  | "template"
  | "skill"
  | "artifact-schema"
  | "action"
  | "theme";

// Spec workbench-unified-dockview.md §11 — palette splittée :
//   `quickopen`  ⌘P    : ressources (runs, templates, skills, artifact-schemas).
//   `commands`   ⌘⇧P  : actions (création, toggles, navigation, paramètres).
//   `theme`            : sous-mode du picker de thème, entré depuis `commands`.
// Un changement de mode reset query + sélection (cf. `useEffect` sur `mode`).
type PaletteMode = "quickopen" | "commands" | "theme";

type CommandItem = {
  readonly id: string;
  readonly kind: ItemKind;
  readonly label: string;
  readonly description?: string;
  readonly status?: InstanceStatus;
  readonly keepOpen?: boolean;
  readonly perform: () => void;
};

type Scored = {
  readonly item: CommandItem;
  readonly score: number;
};

const STATUS_LABEL: Record<InstanceStatus, string> = {
  running: "En cours",
  awaitingHuman: "Attente humaine",
  completed: "Terminé",
  failed: "Échoué",
};

const STATUS_TONE: Record<
  InstanceStatus,
  "info" | "warning" | "success" | "danger"
> = {
  running: "info",
  awaitingHuman: "warning",
  completed: "success",
  failed: "danger",
};

const KIND_GROUP_LABEL: Record<ItemKind, string> = {
  action: "Actions",
  run: "Runs",
  template: "Templates",
  skill: "Prompts",
  "artifact-schema": "Types d'artifact",
  theme: "Thèmes",
};

const KIND_ORDER: ReadonlyArray<ItemKind> = [
  "action",
  "run",
  "template",
  "skill",
  "artifact-schema",
  "theme",
];

const KIND_ICON: Record<ItemKind, LucideIcon> = {
  run: Play,
  template: GitBranch,
  skill: Brain,
  "artifact-schema": ShieldCheck,
  action: Plus,
  theme: Palette,
};

const KIND_ICON_CLASS: Record<ItemKind, string> = {
  action: "bg-primary/10 text-primary",
  run: "bg-[var(--chart-1)]/15 text-[var(--chart-1)]",
  template: "bg-[var(--chart-4)]/15 text-[var(--chart-4)]",
  skill: "bg-[var(--chart-3)]/15 text-[var(--chart-3)]",
  "artifact-schema": "bg-[var(--chart-2)]/15 text-[var(--chart-2)]",
  theme: "bg-[var(--chart-2)]/15 text-[var(--chart-2)]",
};

const fuzzyScore = (haystack: string, needle: string): number | null => {
  if (!needle) return 0;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  const sub = h.indexOf(n);
  if (sub !== -1) {
    let score = 1000 - sub;
    if (sub === 0) score += 500;
    return score;
  }
  let hi = 0;
  let ni = 0;
  let score = 0;
  let lastMatch = -1;
  while (hi < h.length && ni < n.length) {
    if (h[hi] === n[ni]) {
      const gap = lastMatch === -1 ? 0 : hi - lastMatch - 1;
      score += 100 - Math.min(gap * 5, 80);
      lastMatch = hi;
      ni++;
    }
    hi++;
  }
  if (ni < n.length) return null;
  return score;
};

const ACTION_ICON: Record<string, LucideIcon> = {
  "action:new-run": Plus,
  "action:new-template": FileText,
  "action:new-skill": Brain,
  "action:theme": Palette,
  "action:settings": Settings,
  "action:back": ArrowLeft,
  "action:toggle-primary-sidebar": PanelLeft,
  "action:toggle-secondary-sidebar": PanelRight,
};

const CommandPalette = () => {
  const t = useT();
  const navigate = useNavigate();
  const services = useServices();
  const workbench = useWorkbench();
  const workbenchPrefs = useWorkbenchPrefs();
  const theme = useTheme();
  const setTheme = useSetTheme();
  const previewTheme = useSetPreviewTheme();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PaletteMode>("quickopen");
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [instances, setInstances] = useState<ReadonlyArray<InstanceSummaryView>>(
    [],
  );
  const [templates, setTemplates] = useState<ReadonlyArray<TemplateView>>([]);
  const [skills, setSkills] = useState<ReadonlyArray<SkillView>>([]);
  const [artifactSchemas, setArtifactSchemas] = useState<
    ReadonlyArray<ArtifactSchemaView>
  >([]);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Spec §11 / Raccourcis : ⌘P → quick-open ressources, ⌘⇧P → palette de
  // commandes. Re-presser le raccourci alors que la palette est déjà ouverte
  // *dans le même mode* la ferme (toggle) ; presser l'autre raccourci
  // bascule simplement le mode sans fermer.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.altKey) return;
      if (event.key.toLowerCase() !== "p") return;
      event.preventDefault();
      const next: PaletteMode = event.shiftKey ? "commands" : "quickopen";
      setOpen((isOpen) => {
        if (!isOpen) {
          setMode(next);
          return true;
        }
        if (mode !== next) {
          setMode(next);
          return true;
        }
        return false;
      });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mode]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedIndex(0);
  }, [open]);

  useEffect(() => {
    setQuery("");
    setSelectedIndex(0);
  }, [mode]);

  useEffect(() => {
    if (mode !== "theme") previewTheme(null);
  }, [mode, previewTheme]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([
      services.listInstances(),
      services.listWorkflowTemplates(),
      services.listSkills(),
      services.listArtifactSchemas(),
    ])
      .then(([is, ts, ss, ats]) => {
        if (cancelled) return;
        setInstances(is);
        setTemplates(ts);
        setSkills(ss);
        setArtifactSchemas(ats);
      })
      .catch((e) => {

        console.error("[wf:ui] command-palette load failed", e);
      });
    return () => {
      cancelled = true;
    };
  }, [open, services]);

  const items = useMemo<ReadonlyArray<CommandItem>>(() => {
    // `theme` est un sous-mode de `commands` : on revient toujours sur
    // commands en sortant, pas sur quickopen.
    if (mode === "theme") {
      const out: CommandItem[] = [];
      out.push({
        id: "action:back",
        kind: "action",
        label: "← Retour aux commandes",
        keepOpen: true,
        perform: () => setMode("commands"),
      });
      for (const t of THEMES) {
        out.push({
          id: `theme:${t.id}`,
          kind: "theme",
          label: t.label,
          description: t.variant === "dark" ? "Sombre" : "Clair",
          perform: () => setTheme(t.id),
        });
      }
      return out;
    }

    // Spec §11 : quickopen = ressources uniquement (ouvre l'éditeur de la
    // ressource via `openEditor`, pas la liste). Commands = actions
    // uniquement. Pas de mixage — chaque mode a un rôle clair.
    if (mode === "quickopen") {
      const out: CommandItem[] = [];
      for (const it of instances) {
        out.push({
          id: `run:${it.id}`,
          kind: "run",
          label: `${it.templateId} · ${it.id.slice(0, 8)}`,
          status: it.status,
          // Fix du bug d'origine (`navigate(\`/runs/${id}\`)` → ouvrait la
          // liste). On ouvre l'éditeur du run dans l'aire d'édition partagée.
          perform: () =>
            workbench.openEditor(runUriFor(it.id), { focus: true }),
        });
      }
      for (const t of templates) {
        out.push({
          id: `template:${t.id}@${t.version}`,
          kind: "template",
          label: t.name,
          description: `${t.id}@${t.version}`,
          // Fix : `navigate("/templates")` ouvrait la liste. On ouvre l'éditeur
          // du template ciblé (spec §11).
          perform: () =>
            workbench.openEditor(templateUriFor(`${t.id}@${t.version}`), {
              focus: true,
            }),
        });
      }
      for (const s of skills) {
        const firstLine = (s.body || "").split("\n")[0]?.trim() ?? "";
        out.push({
          id: `skill:${s.ref}`,
          kind: "skill",
          label: s.ref,
          description: firstLine.slice(0, 80),
          // Fix : `navigate("/skills")` ouvrait la liste. URI canonique tirée
          // de skills/contributions.ts.
          perform: () =>
            workbench.openEditor(`${SKILL_URI_PREFIX}${s.ref}`, {
              focus: true,
            }),
        });
      }
      for (const t of artifactSchemas) {
        const ref = `${t.id}@${t.version}`;
        out.push({
          id: `artifact-schema:${ref}`,
          kind: "artifact-schema",
          label: t.name || t.id,
          description: ref,
          perform: () =>
            workbench.openEditor(`${ARTIFACT_SCHEMA_URI_PREFIX}${ref}`, {
              focus: true,
            }),
        });
      }
      return out;
    }

    // mode === "commands" : actions uniquement (création, toggles, palette,
    // paramètres). Aucune ressource — celles-ci sont en quickopen.
    const out: CommandItem[] = [];
    out.push({
      id: "action:new-run",
      kind: "action",
      label: "Nouveau run",
      description: "Créer un nouveau run",
      // Non-goal de la spec : la création de run reste sur la route /runs/new
      // (cf. §Non-goals "navigate la création de run reste sur navigate").
      perform: () => navigate("/runs/new"),
    });
    out.push({
      id: "action:new-template",
      kind: "action",
      label: "Créer un template",
      description: "Ouvrir l'éditeur d'un nouveau template",
      perform: () => workbench.openEditor(NEW_TEMPLATE_URI, { focus: true }),
    });
    out.push({
      id: "action:new-skill",
      kind: "action",
      label: "Créer un prompt",
      description: "Ouvrir l'éditeur d'un nouveau prompt",
      perform: () => workbench.openEditor(NEW_SKILL_URI, { focus: true }),
    });
    out.push({
      id: "action:theme",
      kind: "action",
      label: "Changer de thème…",
      description: "Parcourir les thèmes disponibles",
      keepOpen: true,
      perform: () => setMode("theme"),
    });
    out.push({
      id: "action:toggle-primary-sidebar",
      kind: "action",
      label: workbenchPrefs.primarySidebar.collapsed
        ? "Afficher la barre latérale gauche"
        : "Réduire la barre latérale gauche",
      description: "⌘B",
      perform: () => workbench.togglePrimarySidebar(),
    });
    out.push({
      id: "action:toggle-secondary-sidebar",
      kind: "action",
      label: workbenchPrefs.secondarySidebar.collapsed
        ? "Afficher la barre latérale droite"
        : "Réduire la barre latérale droite",
      description: "⌘⌥B",
      perform: () => workbench.toggleSecondarySidebar(),
    });
    out.push({
      id: "action:settings",
      kind: "action",
      label: "Paramètres",
      perform: () => navigate("/settings"),
    });
    return out;
  }, [
    mode,
    instances,
    templates,
    skills,
    artifactSchemas,
    navigate,
    workbench,
    workbenchPrefs.primarySidebar.collapsed,
    workbenchPrefs.secondarySidebar.collapsed,
    setTheme,
  ]);

  const filtered = useMemo<ReadonlyArray<Scored>>(() => {
    const q = query.trim();
    const scored: Scored[] = [];
    if (!q) {
      for (const item of items) scored.push({ item, score: 0 });
    } else {
      for (const item of items) {
        const parts: string[] = [item.label];
        if (item.description) parts.push(item.description);
        if (item.status) parts.push(STATUS_LABEL[item.status]);
        const score = fuzzyScore(parts.join(" "), q);
        if (score == null) continue;
        scored.push({ item, score });
      }
    }
    const groups = new Map<ItemKind, Scored[]>();
    for (const entry of scored) {
      const arr = groups.get(entry.item.kind);
      if (arr) arr.push(entry);
      else groups.set(entry.item.kind, [entry]);
    }
    for (const arr of groups.values()) {
      arr.sort((a, b) => b.score - a.score);
    }
    const out: Scored[] = [];
    for (const kind of KIND_ORDER) {
      const arr = groups.get(kind);
      if (arr) out.push(...arr);
    }
    return out.slice(0, 50);
  }, [items, query]);

  useEffect(() => {
    setSelectedIndex((idx) => {
      if (filtered.length === 0) return 0;
      return Math.min(idx, filtered.length - 1);
    });
  }, [filtered]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>(`[data-idx="${selectedIndex}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, filtered]);

  useEffect(() => {
    if (mode !== "theme") return;
    const entry = filtered[selectedIndex];
    if (!entry || entry.item.kind !== "theme") {
      previewTheme(null);
      return;
    }
    const themeId = entry.item.id.slice("theme:".length) as ThemeId;
    previewTheme(themeId);
  }, [mode, filtered, selectedIndex, previewTheme]);

  const close = useCallback(() => setOpen(false), []);

  const performIndex = useCallback(
    (idx: number) => {
      const entry = filtered[idx];
      if (!entry) return;
      entry.item.perform();
      if (!entry.item.keepOpen) close();
    },
    [filtered, close],
  );

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      performIndex(selectedIndex);
    } else if (event.key === "Home") {
      event.preventDefault();
      setSelectedIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setSelectedIndex(Math.max(0, filtered.length - 1));
    } else if (event.key === "Escape" && mode === "theme") {
      event.preventDefault();
      event.stopPropagation();
      setMode("commands");
    } else if (event.key === "Backspace" && mode === "theme" && query === "") {
      event.preventDefault();
      setMode("commands");
    }
  };

  const groupCounts = useMemo(() => {
    const counts = new Map<ItemKind, number>();
    for (const entry of filtered) {
      counts.set(entry.item.kind, (counts.get(entry.item.kind) ?? 0) + 1);
    }
    return counts;
  }, [filtered]);

  return (
    <Dialog.Root open={open} onOpenChange={(next) => setOpen(next)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[1px] transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed left-1/2 top-[10vh] z-50 flex w-[820px] max-w-[92vw] -translate-x-1/2 flex-col overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-[0_16px_40px_-12px_rgba(0,0,0,0.45)] outline-none transition-all duration-150 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0">
          <Dialog.Title className="sr-only">
            {mode === "theme"
              ? "Choix du thème"
              : mode === "quickopen"
                ? "Ouverture rapide"
                : "Palette de commandes"}
          </Dialog.Title>

          <div className="flex items-center gap-2.5 border-b border-border px-3">
            {mode === "theme" ? (
              <Palette className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            {mode === "theme" ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setMode("commands")}
                      className="shrink-0 rounded-sm bg-primary/10 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wider text-primary hover:bg-primary/15 hover:text-primary"
                    >
                      Thème
                    </Button>
                  }
                />
                <TooltipContent>
                  {t("commandPalette.themeBackTooltip")}
                </TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() =>
                        setMode(mode === "quickopen" ? "commands" : "quickopen")
                      }
                      className="shrink-0 rounded-sm bg-primary/10 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wider text-primary hover:bg-primary/15 hover:text-primary"
                    >
                      {mode === "quickopen" ? "Ouvrir" : "Commandes"}
                    </Button>
                  }
                />
                <TooltipContent>
                  {mode === "quickopen"
                    ? t("commandPalette.toggleTooltipToCommands")
                    : t("commandPalette.toggleTooltipToQuickOpen")}
                </TooltipContent>
              </Tooltip>
            )}
            <Input
              autoFocus
              type="text"
              placeholder={
                mode === "theme"
                  ? "Filtrer les thèmes…"
                  : mode === "quickopen"
                    ? "Ouvrir un run, template, prompt…"
                    : "Rechercher une commande…"
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
              className="h-11 rounded-none border-0 bg-transparent px-0 text-sm placeholder:text-muted-foreground focus:border-0"
            />
            {query ? (
              <Button
                variant="outline"
                size="xs"
                onClick={() => setQuery("")}
                className="shrink-0 px-1.5 py-0.5 text-2xs font-medium text-muted-foreground"
              >
                {t("commandPalette.clear")}
              </Button>
            ) : null}
            <kbd className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-2xs font-medium text-muted-foreground">
              {t("commandPalette.kbd.esc")}
            </kbd>
          </div>

          <ScrollArea className="max-h-[55vh]">
            <div ref={listRef} className="py-1.5">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
                  <SearchX className="h-6 w-6 text-muted-foreground/60" />
                  <div className="text-xs text-muted-foreground">
                    {query ? (
                      <>
                        {t("commandPalette.empty.prefix")}{" "}
                        <span className="font-medium text-foreground">
                          {t("commandPalette.empty.query", { query })}
                        </span>
                        {t("commandPalette.empty.suffix")}
                      </>
                    ) : (
                      t("commandPalette.empty.noQuery")
                    )}
                  </div>
                </div>
              ) : (
                filtered.map((entry, idx) => {
                  const Icon =
                    entry.item.kind === "action"
                      ? (ACTION_ICON[entry.item.id] ?? KIND_ICON.action)
                      : KIND_ICON[entry.item.kind];
                  const selected = idx === selectedIndex;
                  const prevKind =
                    idx > 0 ? filtered[idx - 1]?.item.kind : null;
                  const showHeader = prevKind !== entry.item.kind;
                  return (
                    <div key={entry.item.id}>
                      {showHeader ? (
                        <div
                          className={cn(
                            "flex items-center justify-between px-3 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground/80",
                            idx > 0 && "mt-1 border-t border-border/60",
                          )}
                        >
                          <span>{KIND_GROUP_LABEL[entry.item.kind]}</span>
                          <span className="font-mono text-2xs font-normal tabular-nums text-muted-foreground/60">
                            {groupCounts.get(entry.item.kind) ?? 0}
                          </span>
                        </div>
                      ) : null}
                      <div
                        data-idx={idx}
                        role="option"
                        aria-selected={selected}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        onClick={() => performIndex(idx)}
                        className={cn(
                          "group/item mx-1.5 flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-xs transition-colors",
                          selected
                            ? "bg-accent text-accent-foreground"
                            : "text-foreground",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded",
                            KIND_ICON_CLASS[entry.item.kind],
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="truncate text-xs font-medium">
                          {entry.item.label}
                        </span>
                        {entry.item.description ? (
                          <span className="min-w-0 flex-1 truncate text-2xs text-muted-foreground">
                            {entry.item.description}
                          </span>
                        ) : (
                          <span className="flex-1" />
                        )}
                        {entry.item.status ? (
                          <Badge
                            tone={STATUS_TONE[entry.item.status]}
                            size="sm"
                            className="shrink-0 rounded-sm"
                          >
                            {STATUS_LABEL[entry.item.status]}
                          </Badge>
                        ) : null}
                        {entry.item.kind === "theme" &&
                        entry.item.id === `theme:${theme}` ? (
                          <Badge
                            variant="outline"
                            size="sm"
                            className="shrink-0 rounded-sm border-primary/40 bg-primary/10 text-primary"
                          >
                            {t("commandPalette.themeActive")}
                          </Badge>
                        ) : null}
                        {selected ? (
                          <CornerDownLeft className="h-3 w-3 shrink-0 text-muted-foreground" />
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>

          <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/40 px-3 py-1.5 text-2xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono text-2xs">
                  {t("commandPalette.kbd.arrowUp")}
                </kbd>
                <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono text-2xs">
                  {t("commandPalette.kbd.arrowDown")}
                </kbd>
                {t("commandPalette.footer.navigate")}
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono text-2xs">
                  {t("commandPalette.kbd.enter")}
                </kbd>
                {t("commandPalette.footer.open")}
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono text-2xs">
                  {t("commandPalette.kbd.esc")}
                </kbd>
                {t("common.close")}
              </span>
            </div>
            <span className="tabular-nums">
              {t("commandPalette.footer.resultCount", { count: filtered.length })}
            </span>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default CommandPalette;
