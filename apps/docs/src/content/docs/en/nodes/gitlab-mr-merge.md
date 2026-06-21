---
title: "GitLab: merge MR"
description: The GitLab merge MR node — merges a GitLab merge request immediately over the REST API and outputs the merged MR JSON.
---

`gitlab.mr.merge`

**GitLab: merge MR** merges a merge request immediately via the GitLab REST API (`PUT /projects/:id/merge_requests/:iid/merge`) and emits the API response as a `Json` artifact. The target is resolved from the `mr` input — typically the output of [GitLab: create MR](/en/nodes/gitlab-mr-create/), i.e. `{ iid, project_id }` — with a fallback on config.

It is an **immediate merge only**: if the MR is not mergeable (conflicts, missing approvals, a running pipeline), GitLab returns a `405`/`406` and the step fails with the API message.

![The GitLab merge MR node in the workflow studio (screenshot to add)](../../../../assets/nodes/placeholder.png)

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | `mr` | `Json`, `*` | **Primary**. MR JSON to merge — reads `project_id` / `iid` (the output of `gitlab.mr.create` fits directly). Falls back to config when these are absent. |
| Output | `out` | `Json` | Primary. The merged merge request object. |

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `project` | `string` | `""` | Numeric id **or** `group/project` path. Used when the `mr` input does not carry `project_id` / `project`. **Required** from one of the two sources. |
| `mergeRequestIid` | `string` | `""` | MR internal id (`iid`). Used when the `mr` input does not carry `iid`. **Required** from one of the two sources. |
| `baseUrl` | `string` | `https://gitlab.com` | GitLab instance (no trailing slash). Set it for a self-hosted instance. |

If neither input nor config yields a `project` **and** an `iid`, the runner throws `missing project/MR iid (wire the mr input from gitlab.mr.create, or set config.project + config.mergeRequestIid)`.

## Security

- The access token is resolved at runtime (encrypted settings, with a fallback on the `GITLAB_TOKEN` env var), **never** stored in the template — same as `git.clone` / `gitlab.files.fetch`. The runner throws `no GitLab access token (set it in Settings or the GITLAB_TOKEN env var)` if none is available.
- The token travels in the `PRIVATE-TOKEN` header, **never in the URL**, so statuses and error bodies are safe to log.
- Uses the main process's global `fetch` (no renderer CSP to touch).

## Runtime behavior

1. The runner reads the `mr` input payload (if any) and the config.
2. It resolves `project` (`mr.project_id` → `mr.project` → `config.project`) and `iid` (`mr.iid` → `config.mergeRequestIid`); it throws if either is missing.
3. It normalizes `baseUrl` and resolves the GitLab token (settings, then `GITLAB_TOKEN`; throws if none).
4. It calls `PUT {baseUrl}/api/v4/projects/{encProject}/merge_requests/{iid}/merge`.
5. A non-ok response throws `HTTP {status}` plus a body excerpt (e.g. a `405`/`406` when the MR is not mergeable).
6. It stores the merged MR JSON as a `Json` artifact (metadata: `source`, `project`, `iid`, `state`) and produces it on `out`.

## Example

Create then merge an MR in one flow:

- Wire the `out` (`Json`) of an upstream [GitLab: create MR](/en/nodes/gitlab-mr-create/) into this node's `mr` input — `project_id` and `iid` are read straight from it, no config needed.
- Output `out` (`Json`) → downstream reporting (e.g. a [Concat Markdown](/en/nodes/concat-markdown/) run summary).

## See also

- [Nodes overview](/en/nodes/overview/)
- [GitLab: create MR](/en/nodes/gitlab-mr-create/) — produces the MR JSON this node merges.
- [GitLab Files Fetch](/en/nodes/gitlab-files-fetch/) — reads files from a GitLab repo over the same REST API and token.
- [Human Gate](/en/nodes/human-gate/) — insert before the merge for a manual approval step.
