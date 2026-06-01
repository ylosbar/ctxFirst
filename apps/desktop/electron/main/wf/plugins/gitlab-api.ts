/**
 * Petits helpers partagés pour appeler l'API REST GitLab (`/api/v4`) depuis les
 * step runners du main process. On utilise le `fetch` global d'Electron — donc
 * pas de CSP renderer à toucher (même régime que `webhook.call` /
 * `gitlab.pipeline.wait`).
 *
 * Auth : header `PRIVATE-TOKEN` avec un Personal Access Token (scope `api`). Le
 * token est résolu à l'exécution depuis les settings chiffrés (comme
 * `git.clone`), avec fallback sur la variable d'env `GITLAB_TOKEN` — jamais en
 * clair dans le template.
 */
import type { RunContext } from "../application/step-runner";

export type GitLabApiDeps = {
  /** Résout le token GitLab à l'exécution. Précède le fallback env GITLAB_TOKEN. */
  getAccessToken?: () => string | null | undefined;
};

export const DEFAULT_GITLAB_BASE = "https://gitlab.com";

/** Normalise une base URL (défaut gitlab.com, sans slash final). */
export const normalizeBaseUrl = (raw: unknown): string => {
  const s = typeof raw === "string" ? raw.trim() : "";
  return (s || DEFAULT_GITLAB_BASE).replace(/\/+$/, "");
};

/**
 * Résout le token : settings d'abord (via `deps.getAccessToken`), puis env
 * `GITLAB_TOKEN` (lu via le port environment, jamais `process.env` direct).
 * Lève une erreur explicite si aucun token n'est disponible.
 */
export const resolveGitLabToken = (
  ctx: RunContext,
  deps: GitLabApiDeps,
  who: string,
): string => {
  const token =
    deps.getAccessToken?.() ??
    ctx.deps.environment.read(["GITLAB_TOKEN"])["GITLAB_TOKEN"];
  if (!token) {
    throw new Error(
      `${who}: no GitLab access token (set it in Settings or the GITLAB_TOKEN env var).`,
    );
  }
  return token;
};

export type GitLabResponse = {
  status: number;
  ok: boolean;
  json: unknown;
  text: string;
};

/**
 * Appel API GitLab brut. Le token n'est jamais dans l'URL (header
 * `PRIVATE-TOKEN`), donc `text`/`status` sont sûrs à logger en cas d'erreur.
 */
export const gitlabRequest = async (opts: {
  baseUrl: string;
  token: string;
  method: string;
  path: string;
  body?: unknown;
}): Promise<GitLabResponse> => {
  const url = `${opts.baseUrl}/api/v4${opts.path}`;
  const headers: Record<string, string> = {
    "PRIVATE-TOKEN": opts.token,
    Accept: "application/json",
  };
  let bodyInit: string | undefined;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    bodyInit = JSON.stringify(opts.body);
  }
  const res = await fetch(url, {
    method: opts.method,
    headers,
    body: bodyInit,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, ok: res.ok, json, text };
};

/** Encode un id de projet GitLab (numérique ou chemin `group/project`). */
export const encodeProjectId = (project: string): string =>
  encodeURIComponent(project);
