/**
 * Module-scope store that flags templates that were just imported, so the
 * editor can pop the "missing dependencies" modal exactly once on its first
 * mount and never again. Calling `consume(ref)` clears the flag and returns
 * `true` if it was set — subsequent calls always return `false`.
 */
const pending = new Set<string>();

export const postImportStore = {
  markFresh: (ref: string): void => {
    pending.add(ref);
  },
  consume: (ref: string): boolean => {
    if (!pending.has(ref)) return false;
    pending.delete(ref);
    return true;
  },
};
