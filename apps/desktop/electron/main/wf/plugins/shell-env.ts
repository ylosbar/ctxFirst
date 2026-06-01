/**
 * Shared environment helpers for shell-based runners (`shell.exec`, `git.*`).
 *
 * Centralising the whitelist + builder here keeps the security guarantee
 * (G3 / G3-git: no arbitrary env passthrough from the host) consistent across
 * runners and prevents accidental divergence.
 *
 * The whitelist intentionally stays explicit and review-able. It covers:
 *  - shell baseline (`PATH`, `HOME`, `USER`, `LANG`, `LC_ALL`, `TZ`, `TERM`),
 *  - git's SSH-handshake plumbing (`SSH_AUTH_SOCK`, `GIT_SSH`,
 *    `GIT_SSH_COMMAND`) — required so a `git push` over SSH can reach the
 *    user's running agent,
 *  - `XDG_CONFIG_HOME` — git reads it to locate `~/.config/git/config`.
 *
 * Secret-looking variables (API keys, tokens, credentials) are intentionally
 * NOT in this list and must never be added without an explicit security
 * review.
 */
import type { EnvironmentPort } from "../application/ports/outbound/environment";

/** Env keys safe to forward to the child by default. */
export const SAFE_ENV_KEYS = [
  "PATH",
  "HOME",
  "USER",
  "LANG",
  "LC_ALL",
  "TZ",
  "TERM",
  // Git / SSH plumbing — needed for `git push` over SSH to find the agent
  // and any user-configured ssh command. Not secrets in themselves: they
  // point at sockets / programs already present on the host.
  "SSH_AUTH_SOCK",
  "GIT_SSH",
  "GIT_SSH_COMMAND",
  "XDG_CONFIG_HOME",
] as const;

/**
 * Builds the child's environment from {@link SAFE_ENV_KEYS} read through the
 * injected {@link EnvironmentPort}, merged with caller-provided overrides.
 * Explicit overrides win over the inherited defaults, but nothing else from
 * the host environment leaks.
 */
export const buildEnv = (
  overrides: Record<string, string> | undefined,
  environment: EnvironmentPort,
): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = { ...environment.read(SAFE_ENV_KEYS) };
  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      env[k] = v;
    }
  }
  return env;
};
