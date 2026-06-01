import { useEffect, useMemo, useState } from "react";
import {
  Captions,
  CaptionsOff,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  FolderPlus,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { ErrorState } from "@/components/ui/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SearchInput } from "@/components/ui/search-input";
import { cn } from "@/lib/utils";
import useArtifactSchemas from "../../hooks/useArtifactSchemas";
import useSkills from "../../hooks/useSkills";
import useWorkflowTemplates from "../../hooks/useWorkflowTemplates";
import useExplorerFolders from "../../hooks/useExplorerFolders";
import { useServices } from "../../di/services-provider";
import { useT } from "../../i18n";
import {
  useActiveEditor,
  useEditors,
  useWorkbench,
} from "../../workbench/WorkbenchProvider";
import {
  useAllExpanded,
  useShowSubtitles,
  useToggleExpandAll,
  useToggleSubtitles,
} from "../../stores/explorer-view-store";
import { NEW_TEMPLATE_URI, templateUriFor } from "../templates/template-uri";
import type { ExplorerFolderView } from "../../../domain/explorer/folder";
import { buildUnifiedTree } from "./build-tree";
import NewResourceMenu from "./menus/NewResourceMenu";
import TemplateLeafMenu from "./menus/TemplateLeafMenu";
import PromptLeafMenu from "./menus/PromptLeafMenu";
import ArtifactSchemaLeafMenu from "./menus/ArtifactSchemaLeafMenu";
import FolderMenu from "./menus/FolderMenu";
import TreeFolderUser from "./TreeFolderUser";
import TreeFolderStatic from "./TreeFolderStatic";
import TreeLeaf from "./TreeLeaf";
import OpenedEditorsSection from "./OpenedEditorsSection";
import FolderInlineCreate from "./FolderInlineCreate";
import RootDroppable from "./RootDroppable";
import type { TreeLeafNode, TreeNode } from "./types";
import type { FolderDragData } from "./TreeFolderUser";
import type { LeafDragData } from "./TreeLeaf";
import type { RootDropData } from "./RootDroppable";

const SEARCH_DEBOUNCE_MS = 200;

const isFolder = (
  n: TreeNode,
): n is Extract<TreeNode, { kind: "folder" }> => n.kind === "folder";

const buildDescendantMap = (
  folders: ReadonlyArray<ExplorerFolderView>,
): Map<string, Set<string>> => {
  const childrenByParent = new Map<string, ExplorerFolderView[]>();
  for (const f of folders) {
    if (f.parentId !== null) {
      const arr = childrenByParent.get(f.parentId) ?? [];
      arr.push(f);
      childrenByParent.set(f.parentId, arr);
    }
  }
  const out = new Map<string, Set<string>>();
  const visit = (id: string): Set<string> => {
    const cached = out.get(id);
    if (cached) return cached;
    const set = new Set<string>();
    for (const child of childrenByParent.get(id) ?? []) {
      set.add(child.id);
      for (const grand of visit(child.id)) set.add(grand);
    }
    out.set(id, set);
    return set;
  };
  for (const f of folders) visit(f.id);
  return out;
};

const ResourceTreeView = () => {
  const t = useT();
  const wb = useWorkbench();
  const services = useServices();
  const editors = useEditors();
  const activeEditor = useActiveEditor();

  const showSubtitles = useShowSubtitles();
  const toggleSubtitles = useToggleSubtitles();

  const allExpanded = useAllExpanded();
  const toggleExpandAll = useToggleExpandAll();

  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const timeoutId = setTimeout(() => setQuery(rawQuery), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeoutId);
  }, [rawQuery]);

  const { templates, error: templatesError } = useWorkflowTemplates();
  const { skills, error: skillsError, refresh: refreshSkills } = useSkills();
  const { types, error: typesError, refresh: refreshTypes } = useArtifactSchemas();

  const explorerFolders = useExplorerFolders();

  const activeUri = activeEditor?.uri ?? null;
  const openUris = useMemo(
    () => new Set(editors.map((e) => e.uri)),
    [editors],
  );

  const { nodes, totalCount } = useMemo(
    () =>
      buildUnifiedTree({
        templates,
        prompts: skills,
        types,
        folders: explorerFolders.folders,
        assignments: explorerFolders.items,
        query,
      }),
    [
      templates,
      skills,
      types,
      explorerFolders.folders,
      explorerFolders.items,
      query,
    ],
  );

  // Pre-compute folder descendant sets so drag drops can reject cycles in O(1).
  const descendants = useMemo(
    () => buildDescendantMap(explorerFolders.folders),
    [explorerFolders.folders],
  );

  const hasQuery = query.trim().length > 0;

  const errors = [templatesError, skillsError, typesError].filter(
    (e): e is string => !!e,
  );

  const handleDeletePrompt = async (ref: string) => {
    try {
      await services.deleteSkill(ref);
      await refreshSkills();
    } catch (e) {
      toast.error(t("explorer.resourceTree.toast.deleteFailed"), {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const handleDeleteType = async (id: string, version: string) => {
    try {
      await services.deleteArtifactSchema({ id, version });
      await refreshTypes();
    } catch (e) {
      toast.error(t("explorer.resourceTree.toast.deleteFailed"), {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const handleDuplicateTemplate = (ref: string) => {
    const url = `${NEW_TEMPLATE_URI}?from=${encodeURIComponent(ref)}`;
    wb.openEditor(url, { focus: true });
  };

  const handleExportTemplate = async (ref: string) => {
    try {
      const { path } = await services.exportWorkflowTemplate(ref);
      if (path) {
        toast.success(t("explorer.resourceTree.toast.exported"), { description: path });
      }
    } catch (e) {
      toast.error(t("explorer.resourceTree.toast.exportFailed"), {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  // ── Folder UX state ─────────────────────────────────────────────────────
  type FolderEditState =
    | { mode: "creating"; parentId: string | null }
    | { mode: "renaming"; folderId: string }
    | null;
  const [folderEdit, setFolderEdit] = useState<FolderEditState>(null);

  const startCreate = (parentId: string | null) =>
    setFolderEdit({ mode: "creating", parentId });
  const startRename = (folderId: string) =>
    setFolderEdit({ mode: "renaming", folderId });
  const cancelEdit = () => setFolderEdit(null);

  const submitCreate = async (parentId: string | null, name: string) => {
    await explorerFolders.createFolder(parentId, name);
    setFolderEdit(null);
  };

  const submitRename = async (folderId: string, name: string) => {
    await explorerFolders.renameFolder(folderId, name);
    setFolderEdit(null);
  };

  const handleDeleteFolder = async (folderId: string) => {
    try {
      await explorerFolders.deleteFolder(folderId);
    } catch (e) {
      toast.error(t("explorer.resourceTree.toast.deleteFolderFailed"), {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  // ── DnD wiring ──────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const overData = e.over?.data.current as
      | LeafDragData
      | FolderDragData
      | RootDropData
      | undefined;
    const activeData = e.active.data.current as
      | LeafDragData
      | FolderDragData
      | undefined;
    if (!overData || !activeData) return;

    if (activeData.kind === "leaf") {
      const targetFolderId =
        overData.kind === "folder" ? overData.folderId : null;
      void explorerFolders
        .assign(activeData.resourceKind, activeData.resourceId, targetFolderId)
        .catch((err: unknown) => {
          toast.error(t("explorer.resourceTree.toast.moveFailed"), {
            description: err instanceof Error ? err.message : String(err),
          });
        });
      return;
    }

    if (activeData.kind === "folder") {
      if (overData.kind === "folder" && overData.folderId === activeData.folderId)
        return;
      if (
        overData.kind === "folder" &&
        activeData.descendants.has(overData.folderId)
      )
        return;
      const newParent = overData.kind === "folder" ? overData.folderId : null;
      void explorerFolders
        .moveFolder(activeData.folderId, newParent)
        .catch((err: unknown) => {
          toast.error(t("explorer.resourceTree.toast.moveFolderFailed"), {
            description: err instanceof Error ? err.message : String(err),
          });
        });
    }
  };

  // ── Renderers ────────────────────────────────────────────────────────────
  const renderLeafWithMenu = (node: TreeLeafNode, depth: number) => {
    const isLeafOpen = openUris.has(node.uri);
    const isActive = activeUri === node.uri;
    const onPick = () => wb.openEditor(node.uri, { focus: true });
    const triggerEl = (
      <div>
        <TreeLeaf
          node={node}
          isOpen={isLeafOpen}
          isActive={isActive}
          depth={depth}
          onPick={onPick}
          showSubtitle={showSubtitles}
        />
      </div>
    );

    if (node.resourceKind === "templates") {
      const ref = node.resourceId;
      return (
        <TemplateLeafMenu
          key={node.id}
          trigger={triggerEl}
          onOpen={() => wb.openEditor(templateUriFor(ref), { focus: true })}
          onDuplicate={() => handleDuplicateTemplate(ref)}
          onExport={() => void handleExportTemplate(ref)}
        />
      );
    }
    if (node.resourceKind === "prompts") {
      const ref = node.resourceId;
      return (
        <PromptLeafMenu
          key={node.id}
          trigger={triggerEl}
          skillRef={ref}
          onOpen={onPick}
          onDelete={() => void handleDeletePrompt(ref)}
        />
      );
    }
    const ref = node.resourceId;
    const [id, version] = ref.split("@");
    const type = types.find((ty) => ty.id === id && ty.version === version);
    const isUserDefined = type?.source.kind === "user";
    return (
      <ArtifactSchemaLeafMenu
        key={node.id}
        trigger={triggerEl}
        typeRef={ref}
        isUserDefined={isUserDefined}
        onOpen={onPick}
        onDelete={() => void handleDeleteType(id, version)}
      />
    );
  };

  const renderFolderTree = (node: TreeNode, depth: number): React.ReactNode => {
    if (!isFolder(node)) {
      return renderLeafWithMenu(node, depth);
    }
    // Synthetic groups (e.g. BuiltIns) are read-only: no rename/delete menu and
    // no drag-and-drop — just a collapsible bucket of leaves.
    if (node.synthetic) {
      return (
        <TreeFolderStatic
          key={node.id}
          name={node.label}
          count={node.count}
          hasChildren={node.children.length > 0}
          depth={depth}
          persistKey={`app.explorer.folder.${node.id}`}
          forceOpen={hasQuery && node.count > 0 ? true : undefined}
        >
          {node.children.map((c) => renderFolderTree(c, depth + 1))}
        </TreeFolderStatic>
      );
    }
    const folderDescendants = descendants.get(node.id) ?? new Set<string>();
    const isEditingThis =
      folderEdit?.mode === "renaming" && folderEdit.folderId === node.id;
    const isCreatingHere =
      folderEdit?.mode === "creating" && folderEdit.parentId === node.id;
    const persistKey = `app.explorer.folder.${node.id}`;
    const folderTrigger = (
      <div>
        <TreeFolderUser
          folderId={node.id}
          name={node.label}
          count={node.count}
          hasChildren={node.children.length > 0 || isCreatingHere}
          depth={depth}
          persistKey={persistKey}
          forceOpen={
            (hasQuery && node.count > 0) || isCreatingHere ? true : undefined
          }
          descendants={folderDescendants}
          isEditing={isEditingThis}
          onStartRename={() => startRename(node.id)}
          onSubmitRename={(newName) => submitRename(node.id, newName)}
          onCancelRename={cancelEdit}
        >
          {folderEdit?.mode === "creating" &&
          folderEdit.parentId === node.id ? (
            <FolderInlineCreate
              depth={depth + 1}
              onSubmit={(name) => submitCreate(node.id, name)}
              onCancel={cancelEdit}
            />
          ) : null}
          {node.children.map((c) => renderFolderTree(c, depth + 1))}
        </TreeFolderUser>
      </div>
    );
    return (
      <FolderMenu
        key={node.id}
        trigger={folderTrigger}
        folderName={node.label}
        onCreateChild={() => startCreate(node.id)}
        onRename={() => startRename(node.id)}
        onDelete={() => void handleDeleteFolder(node.id)}
      />
    );
  };

  const isCreatingAtRoot =
    folderEdit?.mode === "creating" && folderEdit.parentId === null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragEnd={onDragEnd}
    >
      <div className="flex h-full min-w-0 flex-col">
        <div className="flex items-center gap-1.5 px-3 pb-2 pt-2">
          <div className="min-w-0 flex-1">
            <SearchInput
              placeholder={t("explorer.resourceTree.searchPlaceholder")}
              value={rawQuery}
              onChange={(e) => setRawQuery(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={toggleExpandAll}
            aria-label={
              allExpanded
                ? "Replier tous les dossiers"
                : "Déplier tous les dossiers"
            }
            aria-pressed={allExpanded}
            title={
              allExpanded
                ? "Replier tous les dossiers"
                : "Déplier tous les dossiers"
            }
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {allExpanded ? (
              <ChevronsDownUp className="size-4" />
            ) : (
              <ChevronsUpDown className="size-4" />
            )}
          </button>
          <button
            type="button"
            onClick={toggleSubtitles}
            aria-label={
              showSubtitles ? "Masquer les sous-titres" : "Afficher les sous-titres"
            }
            aria-pressed={showSubtitles}
            title={
              showSubtitles ? "Masquer les sous-titres" : "Afficher les sous-titres"
            }
            className={cn(
              "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              showSubtitles && "bg-accent text-foreground",
            )}
          >
            {showSubtitles ? (
              <Captions className="size-4" />
            ) : (
              <CaptionsOff className="size-4" />
            )}
          </button>
          <button
            type="button"
            onClick={() => startCreate(null)}
            aria-label={t("explorer.resourceTree.newFolder")}
            title={t("explorer.resourceTree.newFolder")}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <FolderPlus className="size-4" />
          </button>
          <NewResourceMenu triggerClassName="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[popup-open]:bg-accent data-[popup-open]:text-foreground">
            <Plus className="size-4" />
            <ChevronDown className="-ml-0.5 size-3" aria-hidden />
          </NewResourceMenu>
        </div>

        {errors.length > 0 ? (
          <ErrorState variant="inline" message={errors[0]} />
        ) : null}

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex min-h-full flex-col pb-2">
            <OpenedEditorsSection />
            <RootDroppable className="flex-1">
              {isCreatingAtRoot ? (
                <FolderInlineCreate
                  depth={0}
                  onSubmit={(name) => submitCreate(null, name)}
                  onCancel={cancelEdit}
                />
              ) : null}
              {nodes.length === 0 && !isCreatingAtRoot ? (
                <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {hasQuery
                    ? `Aucun résultat pour « ${query.trim()} »`
                    : "Aucun dossier ni ressource."}
                </div>
              ) : (
                nodes.map((node) => renderFolderTree(node, 0))
              )}
            </RootDroppable>
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-1.5 text-2xs uppercase tracking-wide text-muted-foreground">
          <span>
            {totalCount} ressource{totalCount > 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </DndContext>
  );
};

export default ResourceTreeView;
