/**
 * Plugin manifest — declarative metadata read at load time, before any
 * plugin code runs. Validated with zod; invalid manifests are rejected with
 * a precise error and the plugin is skipped.
 *
 * Phase 3 adds `permissions` validation against the catalog and a
 * `networkHosts` allow-list for the `network` permission (PLUGINS.md §4).
 */
import { z } from "zod";
import { PermissionSchema } from "./permissions-catalog";

const SlugRe = /^[a-z0-9][a-z0-9.-]*$/;
const SemverLikeRe = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/;
// Plain hostnames; no scheme, no path, no port — matches `URL.hostname`.
const HostnameRe = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;

const StepKindContribution = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  icon: z.string().optional(),
  /**
   * Optional UX hint: when an input of `suggestedFor.inputKind` is wired into
   * a step, the template editor proposes this kind as a code-action. `role`
   * is a free-form tag (e.g. `"context-simplifier"`) the editor may use to
   * group suggestions. Strict subset of the SDK type — anything outside
   * `inputKind` / `role` is rejected to prevent silent drift.
   */
  suggestedFor: z
    .object({
      inputKind: z.string().min(1),
      role: z.string().optional(),
    })
    .strict()
    .optional(),
});

const Contributions = z
  .object({
    stepKinds: z.array(StepKindContribution).optional(),
    // Reserved for later phases; we accept and ignore them here so manifests
    // shipped against the full spec don't get rejected.
    routes: z.array(z.unknown()).optional(),
    navItems: z.array(z.unknown()).optional(),
    artifactSchemas: z.array(z.unknown()).optional(),
    parsers: z.array(z.unknown()).optional(),
  })
  .strict();

export const PluginManifestSchema = z
  .object({
    id: z.string().regex(SlugRe, "id must be a lowercase slug"),
    name: z.string().min(1),
    version: z.string().regex(SemverLikeRe, "version must be semver-like"),
    /**
     * App version this plugin requires at minimum. Compared against the
     * desktop app's own version at load time. Optional — when absent, the
     * plugin is assumed compatible with any app version.
     */
    minAppVersion: z.string().regex(SemverLikeRe).optional(),
    /** Relative path to the main-process entry (CJS for now, ESM later). */
    main: z.string().optional(),
    /** Relative path to the renderer entry (Phase 2). */
    renderer: z.string().optional(),
    description: z.string().optional(),
    /** Author display name shown in the Plugins settings panel. Optional. */
    author: z.string().optional(),
    /** Project homepage URL — surfaced in the authorization dialog. Optional. */
    homepage: z.string().url().optional(),
    /**
     * Marks the plugin as load-bearing: legacy templates / on-disk artifacts
     * reference kinds it publishes (`plugin:<id>:<type>@<v>`), so disabling it
     * would orphan them. Boot fails fast if a `core: true` plugin can't be
     * activated, and the Settings UI refuses to flip its `enabled` flag.
     *
     * Only meaningful for built-in plugins; user plugins setting this field are
     * accepted by the schema but ignored by the runtime (a user plugin can
     * always be removed by the user). Defaults to `false`.
     */
    core: z.boolean().optional(),
    /**
     * Permissions the plugin requests. Each entry must be a known
     * {@link PERMISSION_IDS}; unknown values fail validation. The grant flow
     * (built-in: auto, user: dialog) drives whether the corresponding API
     * helper is actually exposed at runtime.
     */
    permissions: z.array(PermissionSchema).optional(),
    /**
     * Mandatory allow-list of hostnames when `permissions` includes `"network"`.
     * Empty list ⇒ outgoing `fetch` is rejected. Hostname-only (no scheme, no
     * path) — `api.net.fetch` checks the request URL's hostname against this
     * list at each call. Matched case-insensitively, no wildcards.
     */
    networkHosts: z.array(z.string().regex(HostnameRe)).optional(),
    contributions: Contributions.optional(),
  })
  .strict()
  .superRefine((m, ctx) => {
    if (m.permissions?.includes("network")) {
      if (!m.networkHosts || m.networkHosts.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["networkHosts"],
          message:
            'when permissions includes "network", networkHosts must list at least one hostname',
        });
      }
    } else if (m.networkHosts && m.networkHosts.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["networkHosts"],
        message:
          'networkHosts is only meaningful when permissions includes "network"',
      });
    }
  });

export type PluginManifest = z.infer<typeof PluginManifestSchema>;
