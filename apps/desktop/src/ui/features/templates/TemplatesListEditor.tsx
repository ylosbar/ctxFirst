import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Menu } from "@base-ui/react/menu";
import {
  Copy,
  Download,
  FileText,
  MoreHorizontal,
  Pencil,
  Play,
  Search,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { resolveNodeSpec } from "@shared/wf/resolve-node-spec";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SearchInput } from "@/components/ui/search-input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useServices } from "../../di/services-provider";
import { useT } from "../../i18n";
import useNodeSpecs from "../../hooks/useNodeSpecs";
import useWorkflowTemplates from "../../hooks/useWorkflowTemplates";
import type {
  ArtifactKind,
  NodeSpecView,
  StepKindId,
  TemplateView,
} from "../../../domain/workflow/types";
import type { WorkbenchApi } from "../../workbench/types";
import { runUriFor } from "../runs/run-uri";
import {
  NEW_TEMPLATE_URI,
  templateUriFor,
} from "./template-uri";
import { postImportStore } from "./post-import-store";
import LaunchRunDialog from "./LaunchRunDialog";

const seedKindFor = (
  tpl: TemplateView,
  byKind: ReadonlyMap<StepKindId, NodeSpecView>,
): ArtifactKind | null => {
  const entry = tpl.steps.find((s) => s.id === tpl.entryStep);
  if (!entry) return null;
  const base = byKind.get(entry.kind);
  if (!base) return null;
  const spec = resolveNodeSpec(entry.kind, entry.config ?? {}, base);
  return (spec.outputs[0]?.kind as ArtifactKind) ?? null;
};

/**
 * `user.input` is the only step kind whose first-step output is *populated by a
 * user-typed seed*. Every other entry (loop.foreach, transform.run, …) builds
 * its output from `config` and runs without any human seed — those templates
 * start with `seeds: []`.
 */
const templateRequiresSeed = (tpl: TemplateView): boolean => {
  const entry = tpl.steps.find((s) => s.id === tpl.entryStep);
  return entry?.kind === "user.input";
};

type LaunchState = {
  templateRef: string;
  text: string;
  busy: boolean;
  error: string | null;
};

type RenameState = {
  templateRef: string;
  name: string;
  busy: boolean;
  error: string | null;
};

const stopRowActivation = (e: React.SyntheticEvent) => {
  e.stopPropagation();
};

type Props = {
  readonly api: WorkbenchApi;
};

const TemplatesListEditor = ({ api }: Props) => {
  const t = useT();
  const services = useServices();
  const queryClient = useQueryClient();
  const { templates, loading, error } = useWorkflowTemplates();
  const specs = useNodeSpecs();
  const byKind = specs.status === "ready" ? specs.byKind : null;
  const [launch, setLaunch] = useState<LaunchState | null>(null);
  const [rename, setRename] = useState<RenameState | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return templates;
    return templates.filter((tpl) => {
      const ref = `${tpl.id}@${tpl.version}`.toLowerCase();
      return (
        tpl.name.toLowerCase().includes(q) ||
        (tpl.description ?? "").toLowerCase().includes(q) ||
        ref.includes(q)
      );
    });
  }, [templates, query]);

  const openLauncher = (tpl: TemplateView) => {
    setLaunch({
      templateRef: `${tpl.id}@${tpl.version}`,
      text: "",
      busy: false,
      error: null,
    });
  };

  const closeLauncher = () => setLaunch(null);

  const openRename = (tpl: TemplateView) => {
    setRename({
      templateRef: `${tpl.id}@${tpl.version}`,
      name: tpl.name,
      busy: false,
      error: null,
    });
  };

  const closeRename = () => setRename(null);

  const submitRename = async () => {
    if (!rename) return;
    const name = rename.name.trim();
    if (!name) {
      setRename({ ...rename, error: "Le nom est requis." });
      return;
    }
    setRename({ ...rename, busy: true, error: null });
    try {
      await services.renameWorkflowTemplate({
        templateRef: rename.templateRef,
        newName: name,
      });
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      setRename(null);
    } catch (e) {
      setRename({
        ...rename,
        busy: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const submit = async (tpl: TemplateView) => {
    if (!launch) return;
    const needsSeed = templateRequiresSeed(tpl);
    if (needsSeed && launch.text.trim().length === 0) return;
    let seeds: ReadonlyArray<{ kind: ArtifactKind; content: string }> = [];
    if (needsSeed) {
      if (!byKind) {
        setLaunch({
          ...launch,
          error: "Catalogue des nodes non chargé — réessaie.",
        });
        return;
      }
      const seedKind = seedKindFor(tpl, byKind);
      if (!seedKind) {
        setLaunch({
          ...launch,
          error: `Impossible de déterminer le kind de seed pour ${tpl.id}@${tpl.version}.`,
        });
        return;
      }
      seeds = [{ kind: seedKind, content: launch.text }];
    }
    setLaunch({ ...launch, busy: true, error: null });
    try {
      const result = await services.startWorkflow({
        templateRef: launch.templateRef,
        seeds,
      });
      api.activateActivity("explorer");
      api.openEditor(runUriFor(result.instanceId), { focus: true });
      setLaunch(null);
    } catch (e) {
      setLaunch({
        ...launch,
        busy: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const handleExport = async (ref: string) => {
    try {
      const { path } = await services.exportWorkflowTemplate(ref);
      if (path) {
        toast.success(t("templates.list.toast.exported"), { description: path });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(t("templates.list.toast.exportFailed"), { description: message });
    }
  };

  const handleImport = async () => {
    const existingRefs = new Set(
      templates.map((t) => `${t.id}@${t.version}`),
    );
    try {
      const outcome = await services.importWorkflowTemplate({ existingRefs });
      if (outcome.kind === "cancelled") return;
      postImportStore.markFresh(outcome.templateRef);
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      api.openEditor(templateUriFor(outcome.templateRef), { focus: true });
      const descriptionParts: string[] = [outcome.templateRef];
      if (outcome.renamed) {
        descriptionParts.push(`renommé depuis ${outcome.originalRef}`);
      }
      toast.success(t("templates.list.toast.imported"), {
        description: descriptionParts.join(" · "),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(t("templates.list.toast.importFailed"), { description: message });
    }
  };

  const totalCount = templates.length;
  const visibleCount = filtered.length;
  const hasQuery = query.trim().length > 0;

  const launchTpl = launch
    ? templates.find((t) => `${t.id}@${t.version}` === launch.templateRef) ??
      null
    : null;
  const launchNeedsSeed = launchTpl ? templateRequiresSeed(launchTpl) : false;
  const launchSeedKind =
    launchTpl && byKind ? seedKindFor(launchTpl, byKind) : null;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <PageHeader
        title={t("templates.list.title")}
        trailing={
          totalCount > 0 ? (
            <Badge tone="neutral" size="sm" font="mono">
              {hasQuery ? `${visibleCount}/${totalCount}` : totalCount}
            </Badge>
          ) : undefined
        }
        actions={
          <>
            <SearchInput
              className="w-56"
              placeholder={t("templates.list.searchPlaceholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void handleImport()}
            >
              <Upload data-icon="inline-start" className="size-3.5" />
              {t("templates.list.import")}
            </Button>
            <Button
              size="sm"
              onClick={() => api.openEditor(NEW_TEMPLATE_URI, { focus: true })}
            >
              {t("templates.list.newTemplate")}
            </Button>
          </>
        }
      />
      {error ? <ErrorState variant="inline" message={error} /> : null}
      {loading && templates.length === 0 ? (
        <LoadingState />
      ) : templates.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-6" />}
          title={t("templates.list.empty.title")}
          description={t("templates.list.empty.description")}
          actions={
            <Button
              size="sm"
              onClick={() =>
                api.openEditor(NEW_TEMPLATE_URI, { focus: true })
              }
            >
              {t("templates.list.newTemplate")}
            </Button>
          }
        />
      ) : visibleCount === 0 ? (
        <EmptyState
          icon={<Search className="size-6" />}
          title={t("templates.list.noResults.title")}
          description={`Aucun template ne correspond à « ${query.trim()} ».`}
          actions={
            <Button size="sm" variant="ghost" onClick={() => setQuery("")}>
              {t("templates.list.noResults.clearSearch")}
            </Button>
          }
        />
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex min-h-0 min-w-0 flex-col p-6">
            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-muted/40 backdrop-blur supports-[backdrop-filter]:bg-muted/30 [&_tr]:border-b">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">{t("templates.list.columns.name")}</TableHead>
                    <TableHead className="w-[110px]">{t("templates.list.columns.status")}</TableHead>
                    <TableHead className="w-[80px] text-right">{t("templates.list.columns.steps")}</TableHead>
                    <TableHead className="w-[120px]">{t("templates.list.columns.entry")}</TableHead>
                    <TableHead className="w-[200px]">{t("templates.list.columns.reference")}</TableHead>
                    <TableHead className="w-[120px] pr-4 text-right">
                      <span className="sr-only">{t("templates.list.columns.actions")}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((tpl) => {
                    const ref = `${tpl.id}@${tpl.version}`;
                    const isOpen = launch?.templateRef === ref;
                    const isRenaming = rename?.templateRef === ref;
                    const seedKind = byKind ? seedKindFor(tpl, byKind) : null;
                    const isPublished = tpl.status === "published";
                    return (
                        <TableRow
                          key={ref}
                          className="group/row border-b border-border/60 align-top transition-colors last:border-0 hover:bg-muted/40 data-[state=open]:bg-muted/40"
                          data-state={isOpen ? "open" : undefined}
                        >
                          <TableCell className="max-w-0 py-3 pl-4">
                            {isRenaming && rename ? (
                              <div className="flex flex-col gap-2">
                                <Input
                                  autoFocus
                                  value={rename.name}
                                  onChange={(e) =>
                                    setRename({ ...rename, name: e.target.value })
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      void submitRename();
                                    } else if (e.key === "Escape") {
                                      e.preventDefault();
                                      closeRename();
                                    }
                                  }}
                                  disabled={rename.busy}
                                />
                                {rename.error ? (
                                  <div className="text-xs text-destructive">
                                    {rename.error}
                                  </div>
                                ) : null}
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => void submitRename()}
                                    disabled={
                                      rename.busy || rename.name.trim().length === 0
                                    }
                                  >
                                    {rename.busy ? "Enregistrement…" : "Enregistrer"}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={closeRename}
                                    disabled={rename.busy}
                                  >
                                    {t("common.cancel")}
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex min-w-0 flex-col gap-0.5">
                                <div
                                  className="truncate text-sm font-medium text-foreground"
                                  title={tpl.name}
                                >
                                  {tpl.name}
                                </div>
                                {tpl.description ? (
                                  <div
                                    className="truncate text-xs text-muted-foreground"
                                    title={tpl.description}
                                  >
                                    {tpl.description}
                                  </div>
                                ) : null}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="py-3">
                            <Badge
                              tone={isPublished ? "success" : "neutral"}
                              size="sm"
                              className="capitalize"
                            >
                              <span
                                aria-hidden
                                className="mr-1 size-1.5 rounded-full bg-current opacity-70"
                              />
                              {tpl.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-3 text-right text-xs tabular-nums text-muted-foreground">
                            {tpl.steps.length}
                          </TableCell>
                          <TableCell className="py-3">
                            {seedKind ? (
                              <Badge tone="neutral" size="sm" font="mono">
                                {seedKind}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground/60">
                                {byKind ? "—" : "…"}
                              </span>
                            )}
                          </TableCell>
                          <TableCell
                            className="py-3 font-mono text-xs text-muted-foreground"
                            title={ref}
                          >
                            <span className="truncate">{ref}</span>
                          </TableCell>
                          <TableCell className="py-3 pr-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="icon-sm"
                                variant={isOpen ? "secondary" : "default"}
                                onClick={() =>
                                  isOpen ? closeLauncher() : openLauncher(tpl)
                                }
                                disabled={isRenaming}
                                aria-label={isOpen ? "Fermer" : "Lancer"}
                                title={isOpen ? "Fermer" : "Lancer"}
                              >
                                {isOpen ? (
                                  <X className="size-3.5" />
                                ) : (
                                  <Play className="size-3.5" />
                                )}
                              </Button>
                              <Menu.Root>
                                <Menu.Trigger
                                  aria-label={t("templates.list.actions.menuAriaLabel")}
                                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[popup-open]:bg-accent data-[popup-open]:text-foreground"
                                  onClick={stopRowActivation}
                                  onKeyDown={stopRowActivation}
                                >
                                  <MoreHorizontal className="size-4" />
                                </Menu.Trigger>
                                <Menu.Portal>
                                  <Menu.Positioner
                                    align="end"
                                    sideOffset={4}
                                    className="z-50"
                                  >
                                    <Menu.Popup
                                      onClick={stopRowActivation}
                                      className="min-w-48 overflow-hidden rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-md outline-none"
                                    >
                                      <Menu.Item
                                        className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 outline-none data-[highlighted]:bg-accent"
                                        onClick={() =>
                                          api.openEditor(templateUriFor(ref), {
                                            focus: true,
                                          })
                                        }
                                      >
                                        <Pencil className="size-4 text-muted-foreground" />
                                        {t("templates.list.actions.edit")}
                                      </Menu.Item>
                                      <Menu.Item
                                        className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 outline-none data-[highlighted]:bg-accent"
                                        onClick={() => openRename(tpl)}
                                      >
                                        <Pencil className="size-4 text-muted-foreground" />
                                        {t("templates.list.actions.rename")}
                                      </Menu.Item>
                                      <Menu.Item
                                        className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 outline-none data-[highlighted]:bg-accent"
                                        onClick={() => {
                                          const url = `${NEW_TEMPLATE_URI}?from=${encodeURIComponent(ref)}`;
                                          api.openEditor(url, { focus: true });
                                        }}
                                      >
                                        <Copy className="size-4 text-muted-foreground" />
                                        {t("templates.list.actions.duplicate")}
                                      </Menu.Item>
                                      <Menu.Item
                                        className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 outline-none data-[highlighted]:bg-accent"
                                        onClick={() => void handleExport(ref)}
                                      >
                                        <Download className="size-4 text-muted-foreground" />
                                        {t("templates.list.actions.exportJson")}
                                      </Menu.Item>
                                    </Menu.Popup>
                                  </Menu.Positioner>
                                </Menu.Portal>
                              </Menu.Root>
                            </div>
                          </TableCell>
                        </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </ScrollArea>
      )}
      <LaunchRunDialog
        open={launch !== null}
        title={launchTpl ? `Lancer « ${launchTpl.name} »` : "Lancer un run"}
        needsSeed={launchNeedsSeed}
        seedKind={launchSeedKind}
        text={launch?.text ?? ""}
        busy={launch?.busy ?? false}
        error={launch?.error ?? null}
        onTextChange={(text) =>
          setLaunch((prev) => (prev ? { ...prev, text } : prev))
        }
        onSubmit={() => {
          if (launchTpl) void submit(launchTpl);
        }}
        onClose={closeLauncher}
      />
    </div>
  );
};

export default TemplatesListEditor;
