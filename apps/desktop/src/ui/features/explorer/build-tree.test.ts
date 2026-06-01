import { describe, expect, it } from "vitest";
import type {
  ArtifactSchemaSourceView,
  ArtifactSchemaView,
} from "../../../domain/workflow/types";
import { buildUnifiedTree } from "./build-tree";
import type { TreeFolderNode, TreeLeafNode, TreeNode } from "./types";

const mkType = (
  id: string,
  source: ArtifactSchemaSourceView,
  name = id,
): ArtifactSchemaView => ({
  id,
  version: "v1",
  name,
  description: "",
  rawSchema: null,
  simplifiedSchema: {},
  sampleRaw: null,
  sample: null,
  source,
  extends: null,
  structuralHash: `hash-${id}`,
  markdownTemplate: null,
});

const isFolder = (n: TreeNode): n is TreeFolderNode => n.kind === "folder";

const buildTypesOnly = (
  types: ReadonlyArray<ArtifactSchemaView>,
  query = "",
) =>
  buildUnifiedTree({
    templates: [],
    prompts: [],
    types,
    folders: [],
    assignments: new Map(),
    query,
  });

describe("buildUnifiedTree — ternary source partition", () => {
  it("groups plugin artifact-schemas under one synthetic `@<pluginId>` folder each, ordered after BuiltIns and alpha-sorted", () => {
    const { nodes } = buildTypesOnly([
      mkType("ticket", { kind: "plugin", pluginId: "linear" }, "Ticket"),
      mkType("board", { kind: "plugin", pluginId: "kanban" }),
      mkType("card", { kind: "plugin", pluginId: "kanban" }),
      mkType("doc", { kind: "builtin" }),
    ]);

    const folders = nodes.filter(isFolder);
    expect(folders.map((f) => f.label)).toEqual([
      "@builtin",
      "@kanban",
      "@linear",
    ]);

    const gf = folders.find((f) => f.label === "@kanban");
    expect(gf?.synthetic).toBe(true);
    expect(gf?.id).toBe("__plugin__kanban");
    expect(gf?.count).toBe(2);
  });

  it("strips the redundant `@<pluginId>/` prefix from leaf labels inside the plugin folder, keeping uri/resourceId intact", () => {
    const { nodes } = buildTypesOnly([
      mkType("ticket", { kind: "plugin", pluginId: "linear" }, "Ticket"),
    ]);
    const folder = nodes.filter(isFolder).find((f) => f.label === "@linear");
    const leaf = folder?.children[0] as TreeLeafNode;
    expect(leaf.label).toBe("Ticket"); // bare, not "@linear/Ticket"
    expect(leaf.resourceId).toBe("ticket@v1");
    expect(leaf.uri).toBe("artifact-schema://ticket@v1");
  });

  it("uses a stable persistable id `__plugin__<pluginId>`", () => {
    const { nodes } = buildTypesOnly([
      mkType("ticket", { kind: "plugin", pluginId: "linear" }),
    ]);
    const folder = nodes.filter(isFolder).find((f) => f.label === "@linear");
    expect(folder?.id).toBe("__plugin__linear");
  });

  it("keeps `user` artifact-schemas in the orphan/user flow, never aspired into a plugin folder", () => {
    const { nodes } = buildTypesOnly([
      mkType("mine", { kind: "user" }, "Mine"),
      mkType("ticket", { kind: "plugin", pluginId: "linear" }),
    ]);
    // The user type is an orphan leaf at the root (no folders defined).
    const orphan = nodes.find(
      (n): n is TreeLeafNode => n.kind === "leaf",
    );
    expect(orphan?.label).toBe("Mine");
  });

  it("does not double-count: totalCount = builtins + plugin leaves + user leaves, with no duplicated leaf", () => {
    const { nodes, totalCount } = buildTypesOnly([
      mkType("doc", { kind: "builtin" }),
      mkType("ticket", { kind: "plugin", pluginId: "linear" }),
      mkType("board", { kind: "plugin", pluginId: "kanban" }),
      mkType("mine", { kind: "user" }),
    ]);
    expect(totalCount).toBe(4);

    // Flatten every leaf in the tree and assert each resource appears once.
    const allLeaves: TreeLeafNode[] = [];
    const walk = (n: TreeNode): void => {
      if (n.kind === "leaf") allLeaves.push(n);
      else n.children.forEach(walk);
    };
    nodes.forEach(walk);
    const ids = allLeaves.map((l) => l.resourceId);
    expect(ids.length).toBe(new Set(ids).size);
    expect(ids.length).toBe(4);
  });

  it("hides a plugin folder with no match during an active search, and surfaces only the matching one", () => {
    const { nodes } = buildTypesOnly(
      [
        mkType("ticket", { kind: "plugin", pluginId: "linear" }, "Ticket"),
        mkType("board", { kind: "plugin", pluginId: "kanban" }, "Board"),
        mkType("doc", { kind: "builtin" }, "Doc"),
      ],
      "ticket",
    );
    const folderLabels = nodes.filter(isFolder).map((f) => f.label);
    expect(folderLabels).toEqual(["@linear"]);
  });
});
