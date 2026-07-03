export const START_NODE_ID = "__start__";
export const START_EDGE_ID = "__start-edge__";
export const VARIABLE_NODE_PREFIX = "__var-";
export const VARIABLE_EDGE_PREFIX = "__var-edge-";
export const GROUP_NODE_PREFIX = "grp-";
export const STICKY_NODE_PREFIX = "note-";

export const isSyntheticId = (id: string): boolean =>
  id === START_NODE_ID ||
  id === START_EDGE_ID ||
  id.startsWith(VARIABLE_NODE_PREFIX) ||
  id.startsWith(VARIABLE_EDGE_PREFIX);

/**
 * Step kinds whose loop edges are *auto-loops* (the orchestrator re-invokes
 * automatically on the pinned `fromPort`). These keep their `fromPort` on save;
 * loop edges from any other kind are human-feedback loops and drop it. Mirrors
 * `AUTO_LOOP_WHITELIST` in the main-process `validateAutoLoopWhitelist`.
 */
export const AUTO_LOOP_SOURCE_KINDS: ReadonlySet<string> = new Set([
  "llm.judge",
  "format.validate",
  "agent.judge",
  "claude_code.judge",
]);

export const makeStepId = (kind: string, counter: number) =>
  `${kind.replace(/\./g, "-")}-${counter}`;

export const highestCounterForKind = (
  kind: string,
  ids: ReadonlyArray<string>,
): number => {
  const prefix = `${kind.replace(/\./g, "-")}-`;
  let max = 0;
  for (const id of ids) {
    if (!id.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return max;
};
