---
title: "GitLab: create MR"
description: The GitLab create MR node — creates a GitLab merge request over the REST API and outputs the MR JSON.
---

`gitlab.mr.create`

**GitLab: create MR** creates a merge request via the GitLab REST API (`POST /projects/:id/merge_requests`) and emits the full MR object as a `Json` artifact — including `iid`, `project_id`, and `web_url`, which [GitLab: merge MR](/en/nodes/gitlab-mr-merge/) consumes downstream.

The fields (`project`, `sourceBranch`, `targetBranch`, `title`, `description`) are resolved dynamically from the JSON `in` input with a fallback on config — so you can branch a name produced upstream (e.g. by a [Git Commit & Push](/en/nodes/git-commit-push/)) straight into the MR.

![The GitLab create MR node in the workflow studio (screenshot to add)](../../../../assets/nodes/placeholder.png)

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | `in` | `Json`, `*` | **Optional**. JSON envelope that can provide `project` / `sourceBranch` / `targetBranch` / `title` / `description` (the input wins over config). |
| Output | `out` | `Json` | Primary. The created merge request object (`iid`, `project_id`, `web_url`, …). |

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `project` | `string` | `""` | Numeric id **or** `group/project` path. **Required** (config or `in.project`) — throws if absent. |
| `sourceBranch` | `string` | `""` | Source branch of the MR. **Required** (config or `in.sourceBranch`) — throws if absent. |
| `targetBranch` | `string` | `main` | Target branch of the MR. |
| `title` | `string` | `Merge <sourceBranch>` | MR title. **Required** — falls back to `Merge <sourceBranch>` when neither config nor input provides one. |
| `description` | `string` | `""` | MR description. Sent only when non-empty. |
| `baseUrl` | `string` | `https://gitlab.com` | GitLab instance (no trailing slash). Set it for a self-hosted instance. |

## Security

- The access token is resolved at runtime (encrypted settings, with a fallback on the `GITLAB_TOKEN` env var), **never** stored in the template — same as `git.clone` / `gitlab.files.fetch`. The runner throws `no GitLab access token (set it in Settings or the GITLAB_TOKEN env var)` if none is available.
- The token travels in the `PRIVATE-TOKEN` header, **never in the URL**, so statuses and error bodies are safe to log.
- Uses the main process's global `fetch` (no renderer CSP to touch).

## Runtime behavior

1. The runner reads the JSON `in` payload (if any) and the config.
2. It resolves `project` (`in.project` → `config.project`; throws if absent), `sourceBranch` (`in` → config; throws if absent), `targetBranch` (`in` → config → `main`), `title` (`in` → config → `Merge <sourceBranch>`; throws if absent), and `description` (`in` → config → `""`).
3. It normalizes `baseUrl` and resolves the GitLab token (settings, then `GITLAB_TOKEN`; throws if none).
4. It calls `POST {baseUrl}/api/v4/projects/{encProject}/merge_requests` with `source_branch`, `target_branch`, `title`, and `description` (when set).
5. A non-ok response throws `HTTP {status}` plus a body excerpt.
6. It stores the MR JSON as a `Json` artifact (metadata: `source`, `project`, `iid`, `webUrl`) and produces it on `out`.

## Example

Open an MR for a branch pushed upstream:

- `project`: `group/project`, `sourceBranch`: the working branch, `targetBranch`: `main`, `title`: a summary.
- Output `out` (`Json`) → input `mr` of a downstream [GitLab: merge MR](/en/nodes/gitlab-mr-merge/), which reads `iid` + `project_id` from it.

## See also

- [Nodes overview](/en/nodes/overview/)
- [GitLab: merge MR](/en/nodes/gitlab-mr-merge/) — consumes this node's `out` to merge the MR.
- [GitLab Files Fetch](/en/nodes/gitlab-files-fetch/) — reads files from a GitLab repo over the same REST API and token.
- [Git Commit & Push](/en/nodes/git-commit-push/) — pushes the branch this MR is opened for.
