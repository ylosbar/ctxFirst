import path from "node:path";
import type { PathPort } from "../../application/ports/outbound/path";

/**
 * Default {@link PathPort} backed by Node's `path` module. The only place in
 * `wf/application` and `wf/plugins` that depends on `node:path` is this
 * adapter — everywhere else, code receives a `PathPort` through DI.
 */
export const createNodePath = (): PathPort => ({
  resolve(...segments) {
    return path.resolve(...segments);
  },
  sep: path.sep,
});
