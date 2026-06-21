---
title: Webhook / HTTP call
description: The Webhook / HTTP call node — calls a REST endpoint and stores the JSON response as a typed artifact.
---

`webhook.call`

**Webhook / HTTP call** emits a single HTTP request to an arbitrary REST endpoint and stores the JSON response as an artifact of the kind you choose (`config.outputKind`, polymorphic). The URL is resolved dynamically from the `url` input port, falling back to `config.url` — the input wins when both are present (same pattern as `file.load` for the path).

It runs in the Electron main process and uses the global `fetch`, so it bypasses the renderer CSP — no CSP change is required for new origins.

![The Webhook / HTTP call node in the workflow studio (screenshot to add)](../../../../assets/nodes/placeholder.png)

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | `url` | `Markdown`, `*` | **Optional**, primary. When wired it overrides `config.url`. The URL is read from a text envelope's `body`, else from the raw content. |
| Input | `body` | `*` | **Optional**. Request body, taken from the input's `content` (falls back to `config.bodyTemplate`). Sent only for non-`GET`/`HEAD` methods. |
| Output | `out` | `config.outputKind` | Primary. The parsed JSON response serialized into the chosen kind. No output port appears until `outputKind` is set. |

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `outputKind` | `string` | — | Kind of the produced artifact (the response type). **Required** — the runner fails if missing. |
| `url` | `string` | — | Target URL. Used only when the `url` input is not wired. A URL is required from one of the two sources. |
| `method` | `string` | `GET` | HTTP method (upper-cased). |
| `headers` | `Record<string, string>` | — | Extra request headers (merged onto `Accept: application/json`). |
| `bodyTemplate` | `string` | — | Default request body, used when the `body` input is not wired. |
| `failOnError` | `boolean` | `true` | When `true`, a non-2xx response throws. Set `false` to accept any status. |
| `allowedHosts` | `string[]` | — | Optional host allow-list, enforced before any fetch — a host outside the list throws. |

## Runtime behavior

1. The runner reads `config.outputKind` (error if missing).
2. It resolves the URL: `url` input if wired (text-envelope `body`, else raw content), otherwise `config.url` (error if neither is set).
3. If `allowedHosts` is non-empty, it checks the URL host against it (error if not allowed) **before** any network access.
4. It builds the request (method, headers, and a body for non-`GET`/`HEAD` methods, defaulting `Content-Type: application/json`) and `fetch`es it once (no streaming).
5. It reads the full body; if `failOnError !== false` and the response is non-2xx, it throws with the status and a body excerpt.
6. It `JSON.parse`s the body (error on invalid JSON) and stores it through the artifact store, which **re-validates** the payload against `outputKind`'s schema (a mismatch surfaces as a failed step, never a corrupt artifact). Metadata: `url`, `method`, `statusCode`, `latencyMs`.

## Example

Fetch a record from an API and feed it downstream:

- `outputKind`: e.g. `Json`, `url`: the endpoint (or wire the `url` input from an upstream node).
- For a `POST`, set `method`: `POST` and wire the `body` input (or set `bodyTemplate`).
- Output `out` → input of a [JSON Transform](/en/nodes/json-transform/) or a [Format Validate](/en/nodes/format-validate/) to check the shape.

## See also

- [Nodes overview](/en/nodes/overview/)
- [Load File](/en/nodes/file-load/) — same polymorphic `outputKind` + input-overrides-config pattern, but reads from disk.
- [Format Validate](/en/nodes/format-validate/) — validate the response shape before consuming it.
- [JSON Transform](/en/nodes/json-transform/) — reshape the JSON response.
