/**
 * Synchronous snapshot of saved skill bodies, keyed by `ref`. Feeds the
 * `skill.loader` runner's pure/sync `resolveSpec` (which derives one input port
 * per `{{placeholder}}`) while the {@link SkillRegistry} itself is async.
 *
 * Exact analogue of the `workflow.call` template snapshot in the composition
 * root (`getChildTemplate`): warmed from the registry at boot, refreshed
 * opportunistically on a miss, and explicitly re-warmed by the composition root
 * after a skill mutation. A cold miss degrades the runner to its permissive
 * signature rather than throwing.
 */
import type { SkillRegistry } from "../application/ports/outbound/skill-registry";

export type SkillBodySnapshot = {
  /**
   * Body of the skill referenced by `ref`, or `undefined` on a cold snapshot /
   * unknown ref. A miss schedules a re-warm so the next call is exact.
   */
  get: (ref: string) => string | undefined;
  /**
   * (Re)loads the snapshot from the registry. Fire-and-forget at the call site
   * (the returned promise is exposed only so tests can await completion).
   */
  warm: () => Promise<void>;
};

export const createSkillBodySnapshot = (
  skills: Pick<SkillRegistry, "list">,
): SkillBodySnapshot => {
  const byRef = new Map<string, string>();
  const warm = (): Promise<void> =>
    skills
      .list()
      .then((all) => {
        byRef.clear();
        for (const s of all) byRef.set(String(s.ref), s.body);
      })
      .catch(() => undefined);
  void warm();
  const get = (ref: string): string | undefined => {
    const hit = byRef.get(ref);
    if (hit === undefined) void warm();
    return hit;
  };
  return { get, warm };
};
