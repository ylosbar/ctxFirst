---
title: GitLab Files Fetch
description: The GitLab Files Fetch node — fetches N files from a GitLab repo over the REST API and exposes each on its own typed port.
---

`gitlab.files.fetch`

**GitLab Files Fetch** reads **several files** from a GitLab repository over the REST API (`/api/v4`), without cloning the repo. It is the **remote counterpart of [Load Files](/en/nodes/file-load/)** (`files.load`):

- `files.load` reads N files under a **local base directory**.
- `gitlab.files.fetch` reads N files under a **repository prefix** (`basePath`), each file expressed as a **repo-relative path** (`subpath`) joined to that prefix.

Each file is exposed on **its own named output port**, typed `Markdown` or `Json` (text-envelope kinds), via a `produced-many` outcome — exactly like `files.load`. Typical use: pull `docs/spec.md`, `docs/api.json`, `CLAUDE.md`… from a repo at a pinned ref to feed a downstream agent, with no `git.clone` or `workspace.set` step.

<!-- Screenshot pending: ![The GitLab Files Fetch node in the workflow studio](../../../../assets/nodes/gitlab-files-fetch.png) -->

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | `in` | `Json`, `*` | **Optional**, not consumed. JSON envelope that can dynamically provide `project` / `ref` / `basePath` (the input wins over config — same logic as `gitlab.mr.create`). |
| Output | `<slot.port>` | `Markdown` \| `Json` | One port **per slot**, in declaration order; the first is primary. Description is `<joined file path> → <outputKind>`. |

No output port appears until at least one valid slot is declared (permissive signature, like `files.load` / `file.load`).

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `project` | `string` | — | Numeric id **or** `group/project` path. **Required** (config or input `in.project`). |
| `ref` | `string` | repo default branch | Branch / tag / SHA. Optional; empty ⇒ the `ref` param is omitted and GitLab uses the default branch. **Pinning it is recommended** for reproducibility. |
| `baseUrl` | `string` | `https://gitlab.com` | GitLab instance (no trailing slash). Set it for a self-hosted instance. |
| `basePath` | `string` | `""` (repo root) | Repo-relative prefix (POSIX). Each slot `subpath` is joined to it. |
| `slots` | `Array<{ port, subpath, outputKind }>` | `[{ port: "out", subpath: "", outputKind: "Markdown" }]` | ≥ 1 slot. Identical shape to `files.load`. |

Each slot declares a `port` (unique, matches `^[a-zA-Z_][a-zA-Z0-9_-]*$`), a non-empty `subpath` (repo-relative, joined to `basePath`, cannot rise above it), and an `outputKind` (`Markdown` or `Json`).

## Security

- The access token is resolved at runtime (encrypted settings, with a fallback on the `GITLAB_TOKEN` env var), **never** stored in the template — same as `git.clone` / `gitlab.mr.*`.
- The token travels in the `PRIVATE-TOKEN` header, **never in the URL**, so statuses and bodies are safe to log.
- Anti-traversal: a `subpath` whose normalized join escapes `basePath` is **refused before any network call** — strict parity with the containment of `files.load`.
- Uses the main process's global `fetch` (no renderer CSP to touch).

## Runtime behavior

1. The runner validates `slots` (≥ 1; ports / subpaths / outputKind).
2. It resolves `project` (`in.project`, then `config.project`; error if absent), `ref` (`in.ref` → `config.ref` → default), and `basePath` (`in.basePath` → `config.basePath` → `""`).
3. For each slot (**sequentially**):
   - It computes `filePath = joinRepoPath(basePath, subpath)` (anti-traversal; throws on escape).
   - It calls `GET {baseUrl}/api/v4/projects/{encProject}/repository/files/{encFilePath}/raw?ref={ref}` — the file path is fully URL-encoded (slashes become `%2F`).
   - `404` ⇒ a clear "file not found" error naming the file and ref; any other non-ok ⇒ `HTTP {status}` plus a body excerpt.
   - It validates the body (empty ⇒ error; `Json` is parsed to fail early) and stores the artifact (metadata: `source`, `project`, `ref`, `filePath`, `byteLength`).
4. It emits a `produced-many` outcome covering every declared port.

## Example

Pull a pinned spec and its API schema, then feed an agent:

- `project`: `group/project`, `ref`: `v1.2.0`, `basePath`: `docs`.
- Slots: `{ port: "spec", subpath: "spec.md", outputKind: "Markdown" }`, `{ port: "api", subpath: "api/openapi.json", outputKind: "Json" }`.
- Output `spec` (`Markdown`) → input of a downstream [Claude Code Invoke](/en/nodes/claude-code-invoke/).

## See also

- [Nodes overview](/en/nodes/overview/)
- [Load File](/en/nodes/file-load/) — the local file loader; **Load Files** (`files.load`) is the local counterpart of this node.
- [Git Clone](/en/nodes/git-clone/) — the alternative that clones the whole repo into a working directory.
