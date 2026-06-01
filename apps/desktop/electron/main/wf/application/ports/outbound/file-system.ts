/**
 * Outbound port for filesystem reads from inside step runners. Keeps plugins
 * free of direct `node:fs` imports so they remain testable with deterministic
 * stubs. Write access is intentionally not exposed: artifacts go through the
 * `ArtifactStore` port instead.
 */
export interface FileSystemPort {
  /**
   * Reads the entire file at `absolutePath` as UTF-8 text. The caller is
   * expected to have already resolved the path (typically via `PathPort`) and
   * enforced any containment checks against the workspace cwd.
   */
  readTextFile(absolutePath: string): Promise<string>;
}
