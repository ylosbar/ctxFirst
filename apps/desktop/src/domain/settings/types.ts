/**
 * UI-side view of the user's settings store. The plaintext API key never
 * crosses this boundary on read — only this presence + suffix summary, used
 * by the settings page to confirm what is currently stored.
 */
export type LinearApiKeyStatus = {
  hasKey: boolean;
  /** Last 4 chars of the stored key, or `null` if no key is set. */
  lastFour: string | null;
};

/**
 * UI-side view of the stored GitLab access token (consumed by the `git.clone`
 * step). The plaintext token never crosses the boundary on read — only
 * presence + suffix.
 */
export type GitLabTokenStatus = {
  hasToken: boolean;
  /** Last 4 chars of the stored token, or `null` if none is set. */
  lastFour: string | null;
};
