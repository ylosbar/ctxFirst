/**
 * Permission catalog for the plugin sandbox. Each entry maps a manifest-level
 * string (e.g. `"fs:read"`) to a short human-readable description, used by the
 * authorization dialog (PLUGINS.md §4 + §13.1).
 *
 * Mechanics:
 *  - Manifest declarations are validated against this list (`PermissionSchema`).
 *  - The grant store persists which permissions the user has accepted for a
 *    given plugin version. Revocation is hot — the gated API helpers re-read
 *    the grant set on every call, so revoking from Settings takes effect
 *    immediately for the next invocation without an app restart.
 *  - Built-in plugins are auto-granted everything they declare. Only user
 *    plugins go through the authorization flow.
 *
 * Phase 3 surfaces only the permissions that have a real backing implementation:
 *  - `fs:read` / `fs:write` — scoped to `pluginDataDir`
 *  - `secrets`              — `safeStorage`-backed key/value scoped by pluginId
 *  - `engine:read`          — read-only access to instances, timelines, artifacts
 *  - `engine:steps`         — `registerStepRunner` gate
 *  - `network`              — `fetch` with a host allow-list from the manifest
 *  - `notifications`        — rate-limited OS notifications
 *
 * The remaining permissions (`db:read`/`db:write`, `engine:llm`, `protocol`,
 * `http-server`) are accepted by the manifest schema but have no backing API
 * yet — the loader logs a warning, the API surface is omitted, and a future
 * phase wires the corresponding capability.
 */
import { z } from "zod";

export const PERMISSION_IDS = [
  "fs:read",
  "fs:write",
  "secrets",
  "engine:read",
  "engine:steps",
  "engine:llm",
  "network",
  "notifications",
  "protocol",
  "http-server",
  "db:read",
  "db:write",
] as const;

export type PermissionId = (typeof PERMISSION_IDS)[number];

export const PermissionSchema = z.enum(PERMISSION_IDS);

/**
 * Permissions whose API surface is currently wired. The loader emits a warning
 * when a manifest requests a permission outside this set (the grant still
 * works, but the corresponding `api.*` namespace stays absent).
 */
export const IMPLEMENTED_PERMISSIONS: ReadonlySet<PermissionId> = new Set([
  "fs:read",
  "fs:write",
  "secrets",
  "engine:read",
  "engine:steps",
  "network",
  "notifications",
]);

type CatalogEntry = {
  id: PermissionId;
  /** Short label shown in the authorization dialog and Settings list. */
  label: string;
  /** One-sentence rationale shown alongside the label. */
  rationale: string;
  /** `true` when this permission has a meaningful security blast-radius. */
  sensitive: boolean;
};

export const PERMISSION_CATALOG: Readonly<Record<PermissionId, CatalogEntry>> = {
  "fs:read": {
    id: "fs:read",
    label: "Lire des fichiers du plugin",
    rationale:
      "Lecture confinée au dossier de données du plugin. Ne donne pas accès au reste du disque.",
    sensitive: false,
  },
  "fs:write": {
    id: "fs:write",
    label: "Écrire dans des fichiers du plugin",
    rationale:
      "Écriture confinée au dossier de données du plugin. Aucune autre zone du disque n'est touchée.",
    sensitive: false,
  },
  secrets: {
    id: "secrets",
    label: "Stocker des secrets chiffrés",
    rationale:
      "Mémorise des clés/valeurs chiffrées via le trousseau de l'OS. Chaque plugin a son espace, isolé des autres.",
    sensitive: true,
  },
  "engine:read": {
    id: "engine:read",
    label: "Lire l'historique des workflows",
    rationale:
      "Accès en lecture aux instances, timelines et artifacts produits par le moteur.",
    sensitive: false,
  },
  "engine:steps": {
    id: "engine:steps",
    label: "Contribuer des types d'étapes",
    rationale:
      "Enregistre des runners de step kinds. Ces runners s'exécutent avec les privilèges du process principal.",
    sensitive: true,
  },
  "engine:llm": {
    id: "engine:llm",
    label: "Invoquer un LLM",
    rationale:
      "Appelle le LLM configuré pour le compte du plugin. Compte sur les quotas de l'utilisateur.",
    sensitive: true,
  },
  network: {
    id: "network",
    label: "Accès réseau (allow-list)",
    rationale:
      "Émet des requêtes HTTP sortantes vers la liste d'hôtes déclarée par le plugin (`networkHosts`).",
    sensitive: true,
  },
  notifications: {
    id: "notifications",
    label: "Notifications système",
    rationale:
      "Émet des notifications natives. Le nombre est limité dans le temps pour éviter le spam.",
    sensitive: false,
  },
  protocol: {
    id: "protocol",
    label: "Handler `ctxfirst://` (à venir)",
    rationale:
      "Réservé : le plugin pourra recevoir des callbacks de schéma `ctxfirst://<plugin-id>/<action>`. Pas encore implémenté.",
    sensitive: true,
  },
  "http-server": {
    id: "http-server",
    label: "Serveur HTTP localhost (à venir)",
    rationale:
      "Réservé : démarrera un serveur HTTP local pour recevoir des webhooks. Pas encore implémenté.",
    sensitive: true,
  },
  "db:read": {
    id: "db:read",
    label: "Lecture base SQLite (à venir)",
    rationale: "Réservé. Pas encore implémenté.",
    sensitive: true,
  },
  "db:write": {
    id: "db:write",
    label: "Écriture base SQLite (à venir)",
    rationale: "Réservé. Pas encore implémenté.",
    sensitive: true,
  },
};
