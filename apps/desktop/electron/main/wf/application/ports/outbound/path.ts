/**
 * Outbound port for filesystem path manipulation. Abstracts `node:path` so
 * application/plugin code stays free of platform imports and can be tested
 * with a deterministic stub (POSIX-style or Windows-style at will).
 *
 * Implementations MUST follow the host platform's conventions for `resolve`
 * (absolute path computation) and `sep` (path separator).
 */
export interface PathPort {
  /**
   * Resolves a sequence of path segments into an absolute path, following
   * the host platform's rules (cf. Node's `path.resolve`).
   */
  resolve(...segments: ReadonlyArray<string>): string;
  /** The host platform's path separator (`"/"` on POSIX, `"\\"` on Windows). */
  readonly sep: string;
}
