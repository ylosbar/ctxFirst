import { createElement, type ReactNode } from "react";
import { Cog, FileText, Network, ShieldCheck, Variable } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ArtifactSchemaView,
  SkillView,
  TemplateView,
} from "../../../domain/workflow/types";
import type {
  ExplorerFolderView,
  ResourceKind,
} from "../../../domain/explorer/folder";
import { templateUriFor } from "../templates/template-uri";
import type { TreeFolderNode, TreeLeafNode, TreeNode } from "./types";

const SKILL_URI_PREFIX = "skill://";
const NEW_SKILL_URI = "skill://new";
const ARTIFACT_SCHEMA_URI_PREFIX = "artifact-schema://";
const NEW_TYPE_URI = "artifact-schema://new";
const NEW_TEMPLATE_URI = "template://new";

// Spec runs-dedicated-activity.md non-goals : on garde `runs` dans les maps
// (`ResourceKind` reste union de 4 — palette de commandes, icônes de tab et
// autres surfaces s'en servent). C'est juste l'arbre Explorer qui n'émet plus
// de feuilles `runs` depuis cette même spec §5.
export const KIND_LABEL: Record<ResourceKind, string> = {
  runs: "Run",
  templates: "Template",
  prompts: "Prompt",
  "artifact-schemas": "Artifact type",
};

export const KIND_ICON = {
  runs: Cog,
  templates: Network,
  prompts: Variable,
  "artifact-schemas": ShieldCheck,
} as const;

/**
 * Per-kind icon tint so resources are distinguishable at a glance in the tree.
 * Mirrors the command palette's `--chart-*` mapping (run→1, template→4,
 * prompt→3, artifact-schema→2). Folders keep the default (uncolored) styling.
 */
export const KIND_ICON_COLOR: Record<ResourceKind, string> = {
  runs: "text-[var(--chart-1)]",
  templates: "text-[var(--chart-4)]",
  prompts: "text-[var(--chart-3)]",
  "artifact-schemas": "text-[var(--chart-2)]",
};

const kindLeading = (kind: ResourceKind): ReactNode =>
  createElement(KIND_ICON[kind], {
    "aria-label": KIND_LABEL[kind],
    className: cn("size-3.5 shrink-0", KIND_ICON_COLOR[kind]),
  });

// ─────────────── Generic folder-tree assembly ───────────────────────────

const byFolderName = (a: ExplorerFolderView, b: ExplorerFolderView): number =>
  a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

const byLeafLabel = (a: TreeLeafNode, b: TreeLeafNode): number =>
  a.label.localeCompare(b.label) || a.id.localeCompare(b.id);

/**
 * Filters a folder sub-tree: a folder survives only if it (recursively)
 * contains at least one matching leaf when a query is active. With an empty
 * query, every folder is kept — including the empty ones, since they remain
 * valid drop targets.
 */
type AssembleArgs = {
  folders: ReadonlyArray<ExplorerFolderView>;
  assignments: ReadonlyMap<string, string>;
  leaves: ReadonlyArray<TreeLeafNode>;
  hasQuery: boolean;
};

const leafAssignmentKey = (l: TreeLeafNode): string =>
  `${l.resourceKind}:${l.resourceId}`;

const assembleFolderTree = (args: AssembleArgs): ReadonlyArray<TreeNode> => {
  const { folders, assignments, leaves, hasQuery } = args;

  // Group folders by parent for fast traversal.
  const knownFolderIds = new Set(folders.map((f) => f.id));
  const childrenByParent = new Map<string | null, ExplorerFolderView[]>();
  for (const f of folders) {
    const key = f.parentId;
    const arr = childrenByParent.get(key) ?? [];
    arr.push(f);
    childrenByParent.set(key, arr);
  }
  for (const arr of childrenByParent.values()) arr.sort(byFolderName);

  // Group leaves by folder (orphans = the null bucket). A leaf assigned to a
  // folder that no longer exists silently falls back to orphan.
  const leavesByFolder = new Map<string | null, TreeLeafNode[]>();
  for (const leaf of leaves) {
    const assigned = assignments.get(leafAssignmentKey(leaf));
    const key = assigned && knownFolderIds.has(assigned) ? assigned : null;
    const arr = leavesByFolder.get(key) ?? [];
    arr.push(leaf);
    leavesByFolder.set(key, arr);
  }
  for (const arr of leavesByFolder.values()) arr.sort(byLeafLabel);

  const buildFolderNode = (f: ExplorerFolderView): TreeFolderNode | null => {
    const subFolders = childrenByParent.get(f.id) ?? [];
    const folderChildren = subFolders
      .map(buildFolderNode)
      .filter((n): n is TreeFolderNode => n !== null);
    const leafChildren = leavesByFolder.get(f.id) ?? [];
    const count =
      leafChildren.length +
      folderChildren.reduce((acc, n) => acc + n.count, 0);
    // With an active search, empty folders are hidden so the user sees only
    // matches. When the query is empty, an empty folder is rendered as a
    // drop target placeholder.
    if (hasQuery && count === 0) return null;
    return {
      kind: "folder",
      id: f.id,
      label: f.name,
      count,
      children: [...folderChildren, ...leafChildren],
    };
  };

  const topFolders = (childrenByParent.get(null) ?? [])
    .map(buildFolderNode)
    .filter((n): n is TreeFolderNode => n !== null);
  const orphanLeaves = leavesByFolder.get(null) ?? [];
  return [...topFolders, ...orphanLeaves];
};

// ─────────────────────────── Templates ──────────────────────────────────

const matchesTemplate = (tpl: TemplateView, q: string): boolean => {
  if (q.length === 0) return true;
  const ref = `${tpl.id}@${tpl.version}`;
  const haystack = [tpl.name, tpl.id, tpl.version, ref, tpl.description ?? ""]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
};

const templateRef = (tpl: TemplateView): string => `${tpl.id}@${tpl.version}`;

const templateToLeaf = (tpl: TemplateView): TreeLeafNode => {
  const ref = templateRef(tpl);
  return {
    kind: "leaf",
    resourceKind: "templates",
    id: `template/${ref}`,
    uri: templateUriFor(ref),
    resourceId: ref,
    label: tpl.name || tpl.id,
    description: tpl.description || undefined,
    leading: kindLeading("templates"),
  };
};

// ─────────────────────────── Prompts ────────────────────────────────────

const matchesPrompt = (skill: SkillView, q: string): boolean => {
  if (q.length === 0) return true;
  const firstLine = skill.body.split("\n")[0] ?? "";
  const haystack = [skill.ref, firstLine].join(" ").toLowerCase();
  return haystack.includes(q);
};

const promptToLeaf = (skill: SkillView): TreeLeafNode => ({
  kind: "leaf",
  resourceKind: "prompts",
  id: `prompt/${skill.ref}`,
  uri: `${SKILL_URI_PREFIX}${skill.ref}`,
  resourceId: skill.ref,
  label: skill.ref,
  description: skill.body.split("\n")[0] || undefined,
  leading: kindLeading("prompts"),
});

// ────────────────────── Artifact types ──────────────────────────────────

const matchesType = (t: ArtifactSchemaView, q: string): boolean => {
  if (q.length === 0) return true;
  const haystack = [t.id, t.name, t.version, t.description ?? ""]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
};

const artifactSchemaRef = (t: ArtifactSchemaView): string => `${t.id}@${t.version}`;

const artifactSchemaLabel = (t: ArtifactSchemaView): string => {
  const name = t.name || t.id;
  switch (t.source.kind) {
    case "builtin":
      return `@builtin/${name}`;
    case "plugin":
      return `@${t.source.pluginId}/${name}`;
    case "user":
      return name;
  }
};

const typeToLeaf = (
  t: ArtifactSchemaView,
  opts?: { stripPluginPrefix?: boolean },
): TreeLeafNode => ({
  kind: "leaf",
  resourceKind: "artifact-schemas",
  id: `artifact-schema/${artifactSchemaRef(t)}`,
  uri: `${ARTIFACT_SCHEMA_URI_PREFIX}${artifactSchemaRef(t)}`,
  resourceId: artifactSchemaRef(t),
  // Inside its own `@<pluginId>` folder the prefix is redundant, so we show the
  // bare name; everywhere else the fully-qualified `@<pluginId>/<name>` is kept.
  label:
    opts?.stripPluginPrefix && t.source.kind === "plugin"
      ? t.name || t.id
      : artifactSchemaLabel(t),
  leading: kindLeading("artifact-schemas"),
});

// ─────────────────────── Unified tree builder ───────────────────────────

/**
 * Synthetic folder id/label grouping every built-in artifact type. Membership
 * is computed from the descriptor source (`source.kind === "builtin"`), not from
 * user folder assignments — so built-ins always live here, never at the root.
 */
const BUILTINS_FOLDER_ID = "__builtins__";
const BUILTINS_FOLDER_LABEL = "@builtin";

/**
 * Prefix for the synthetic per-plugin folder id (`__plugin__<pluginId>`). Kept
 * stable so the `persistKey` (`app.explorer.folder.<id>`) survives across renders.
 */
const PLUGIN_FOLDER_ID_PREFIX = "__plugin__";

/**
 * One synthetic `@<pluginId>` folder per contributing plugin. Like `BuiltIns`,
 * membership is computed from the descriptor source (`source.kind === "plugin"`),
 * never from user folder assignments — so plugin resources always live here.
 * Folders are sorted alphabetically by plugin id; a folder exists only when it
 * has ≥ 1 matching leaf, so a plugin with no match drops out during search.
 */
const buildPluginFolders = (
  types: ReadonlyArray<ArtifactSchemaView>,
): ReadonlyArray<TreeFolderNode> => {
  const byPlugin = new Map<string, TreeLeafNode[]>();
  for (const t of types) {
    if (t.source.kind !== "plugin") continue; // narrows source.pluginId for TS
    const arr = byPlugin.get(t.source.pluginId) ?? [];
    arr.push(typeToLeaf(t, { stripPluginPrefix: true }));
    byPlugin.set(t.source.pluginId, arr);
  }
  return [...byPlugin.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([pluginId, leaves]) => ({
      kind: "folder" as const,
      id: `${PLUGIN_FOLDER_ID_PREFIX}${pluginId}`,
      label: `@${pluginId}`,
      synthetic: true,
      count: leaves.length,
      children: leaves.sort(byLeafLabel),
    }));
};

// Spec runs-dedicated-activity.md §5 : l'arbre Explorer n'émet plus de feuilles
// `runs` — les runs vivent désormais dans l'activité Runs dédiée
// (`RunsView` + `build-runs-list.ts`).
export const buildUnifiedTree = (args: {
  templates: ReadonlyArray<TemplateView>;
  prompts: ReadonlyArray<SkillView>;
  types: ReadonlyArray<ArtifactSchemaView>;
  folders: ReadonlyArray<ExplorerFolderView>;
  /** `${kind}:${resourceId}` → folderId */
  assignments: ReadonlyMap<string, string>;
  query: string;
}): { nodes: ReadonlyArray<TreeNode>; totalCount: number } => {
  const q = args.query.trim().toLowerCase();

  // Built-in artifact types are pulled out of the folder-assignment pipeline and
  // bucketed under the synthetic `BuiltIns` group; everything else flows through
  // the user folder tree as before.
  const matchedTypes = args.types.filter((t) => matchesType(t, q));
  const builtinLeaves = matchedTypes
    .filter((t) => t.source.kind === "builtin")
    .map((t) => typeToLeaf(t))
    .sort(byLeafLabel);
  // Only `user` artifact-schemas flow into the user folder tree. Plugin-sourced
  // ones are bucketed under their `@<pluginId>` folder below — restricting this
  // filter to `=== "user"` (not `!== "builtin"`) is what prevents double-counting.
  const otherTypeLeaves = matchedTypes
    .filter((t) => t.source.kind === "user")
    .map((t) => typeToLeaf(t));

  const leaves: TreeLeafNode[] = [
    ...args.templates.filter((t) => matchesTemplate(t, q)).map(templateToLeaf),
    ...args.prompts.filter((s) => matchesPrompt(s, q)).map(promptToLeaf),
    ...otherTypeLeaves,
  ];
  const folderTree = assembleFolderTree({
    folders: args.folders,
    assignments: args.assignments,
    leaves,
    hasQuery: q.length > 0,
  });

  // The BuiltIns group leads the tree. During an active search it is hidden when
  // no built-in matches, mirroring how empty folders collapse out of results.
  const builtinsFolder: TreeNode | null =
    builtinLeaves.length > 0
      ? {
          kind: "folder",
          id: BUILTINS_FOLDER_ID,
          label: BUILTINS_FOLDER_LABEL,
          synthetic: true,
          count: builtinLeaves.length,
          children: builtinLeaves,
        }
      : null;

  // Order: BuiltIns, then the alpha-sorted `@<plugin>` folders, then user folders.
  const pluginFolders = buildPluginFolders(matchedTypes);
  const nodes = [
    ...(builtinsFolder ? [builtinsFolder] : []),
    ...pluginFolders,
    ...folderTree,
  ];
  const totalCount =
    leaves.length +
    builtinLeaves.length +
    pluginFolders.reduce((acc, f) => acc + f.count, 0);
  return { nodes, totalCount };
};

// ──────────────────────────── URIs ──────────────────────────────────────

export const EXPLORER_NEW_URIS = {
  template: NEW_TEMPLATE_URI,
  skill: NEW_SKILL_URI,
  artifactSchema: NEW_TYPE_URI,
} as const;

export { FileText };
