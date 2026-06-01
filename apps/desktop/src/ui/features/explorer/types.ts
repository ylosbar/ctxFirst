import type { ReactNode } from "react";
import type { EditorUri } from "../../workbench/types";
import type { ResourceKind } from "../../../domain/explorer/folder";

export type TreeLeafNode = {
  readonly kind: "leaf";
  /** Type of the underlying resource (run / template / prompt / artifact-schema). */
  readonly resourceKind: ResourceKind;
  readonly id: string;
  readonly uri: EditorUri;
  /** Stable resource id used as the folder-assignment key (run id, template ref, …). */
  readonly resourceId: string;
  readonly label: string;
  /** Optional secondary text rendered below the label (two-line layout). */
  readonly description?: string;
  readonly leading?: ReactNode;
};

export type TreeFolderNode = {
  readonly kind: "folder";
  readonly id: string;
  readonly label: string;
  readonly count: number;
  /**
   * `true` for system-provided groups (e.g. the `BuiltIns` bucket of built-in
   * artifact types). Synthetic folders are read-only: rendered without the
   * rename/delete menu and without drag-and-drop, and their membership is
   * computed — not driven by user folder assignments.
   */
  readonly synthetic?: boolean;
  readonly children: ReadonlyArray<TreeFolderNode | TreeLeafNode>;
};

export type TreeNode = TreeLeafNode | TreeFolderNode;
