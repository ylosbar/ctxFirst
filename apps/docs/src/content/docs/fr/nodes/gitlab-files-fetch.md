---
title: GitLab Files Fetch
description: Le node GitLab Files Fetch — récupère N fichiers d'un dépôt GitLab via l'API REST et expose chacun sur son port typé.
---

`gitlab.files.fetch`

**GitLab Files Fetch** lit **plusieurs fichiers** d'un dépôt GitLab via l'API REST (`/api/v4`), sans cloner le repo. C'est le **pendant distant de [Load Files](/fr/nodes/file-load/)** (`files.load`) :

- `files.load` lit N fichiers sous un **répertoire de base local**.
- `gitlab.files.fetch` lit N fichiers sous un **préfixe de dépôt** (`basePath`), chaque fichier étant exprimé en **chemin relatif au dépôt** (`subpath`) joint à ce préfixe.

Chaque fichier est exposé sur **son propre port de sortie nommé**, typé `Markdown` ou `Json` (kinds text-envelope), via un outcome `produced-many` — exactement comme `files.load`. Cas d'usage : charger d'un coup `docs/spec.md`, `docs/api.json`, `CLAUDE.md`… d'un repo à une réf épinglée pour alimenter un agent en aval, sans étape `git.clone` ni `workspace.set`.

<!-- Capture à ajouter : ![Le node GitLab Files Fetch dans le studio de workflow](../../../../assets/nodes/gitlab-files-fetch.png) -->

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Entrée | `in` | `Json`, `*` | **Optionnel**, non consommé. Enveloppe JSON pouvant fournir dynamiquement `project` / `ref` / `basePath` (l'input l'emporte sur la config — même logique que `gitlab.mr.create`). |
| Sortie | `<slot.port>` | `Markdown` \| `Json` | Un port **par slot**, dans l'ordre de déclaration ; le premier est primaire. Description : `<chemin joint> → <outputKind>`. |

Tant qu'aucun slot valide n'est déclaré, aucun port de sortie n'apparaît (signature permissive, comme `files.load` / `file.load`).

## Configuration

| Clé | Type | Défaut | Description |
| --- | --- | --- | --- |
| `project` | `string` | — | Id numérique **ou** chemin `group/project`. **Requis** (config ou input `in.project`). |
| `ref` | `string` | branche par défaut | Branche / tag / SHA. Optionnel ; vide ⇒ paramètre `ref` omis, GitLab utilise la branche par défaut. **Recommandé d'épingler** pour la reproductibilité. |
| `baseUrl` | `string` | `https://gitlab.com` | Instance GitLab (sans slash final). À renseigner pour une instance self-hosted. |
| `basePath` | `string` | `""` (racine du repo) | Préfixe relatif au dépôt (POSIX). Chaque `subpath` de slot lui est joint. |
| `slots` | `Array<{ port, subpath, outputKind }>` | `[{ port: "out", subpath: "", outputKind: "Markdown" }]` | ≥ 1 slot. Forme identique à `files.load`. |

Chaque slot déclare un `port` (unique, match `^[a-zA-Z_][a-zA-Z0-9_-]*$`), un `subpath` non vide (relatif au dépôt, joint à `basePath`, sans remonter au-dessus), et un `outputKind` (`Markdown` ou `Json`).

## Sécurité

- Le token d'accès est résolu à l'exécution (settings chiffrés, fallback sur la variable d'env `GITLAB_TOKEN`), **jamais** stocké dans le template — comme `git.clone` / `gitlab.mr.*`.
- Le token transite dans le header `PRIVATE-TOKEN`, **jamais dans l'URL** — statuts et corps sont sûrs à logger.
- Anti-traversal : un `subpath` dont la jointure normalisée sort de `basePath` est **refusé avant tout appel réseau** — cohérence stricte avec le containment de `files.load`.
- Utilise le `fetch` global du process main (pas de CSP renderer à toucher).

## Comportement à l'exécution

1. Le runner valide `slots` (≥ 1 ; ports / subpaths / outputKind).
2. Il résout `project` (`in.project`, puis `config.project` ; erreur si absent), `ref` (`in.ref` → `config.ref` → défaut) et `basePath` (`in.basePath` → `config.basePath` → `""`).
3. Pour chaque slot (**séquentiellement**) :
   - Il calcule `filePath = joinRepoPath(basePath, subpath)` (anti-traversal ; throw en cas d'évasion).
   - Il appelle `GET {baseUrl}/api/v4/projects/{encProject}/repository/files/{encFilePath}/raw?ref={ref}` — le chemin est entièrement URL-encodé (les `/` deviennent `%2F`).
   - `404` ⇒ erreur explicite « file not found » nommant le fichier et la réf ; tout autre non-ok ⇒ `HTTP {status}` + extrait du corps.
   - Il valide le corps (vide ⇒ erreur ; `Json` parsé pour échouer tôt) et stocke l'artifact (méta : `source`, `project`, `ref`, `filePath`, `byteLength`).
4. Il émet un outcome `produced-many` couvrant tous les ports déclarés.

## Exemple

Récupérer une spec épinglée et son schéma d'API, puis alimenter un agent :

- `project` : `group/project`, `ref` : `v1.2.0`, `basePath` : `docs`.
- Slots : `{ port: "spec", subpath: "spec.md", outputKind: "Markdown" }`, `{ port: "api", subpath: "api/openapi.json", outputKind: "Json" }`.
- Sortie `spec` (`Markdown`) → entrée d'un [Claude Code Invoke](/fr/nodes/claude-code-invoke/) en aval.

## Voir aussi

- [Vue d'ensemble des nodes](/fr/nodes/overview/)
- [Load File](/fr/nodes/file-load/) — le loader de fichier local ; **Load Files** (`files.load`) est le pendant local de ce node.
- [Git Clone](/fr/nodes/git-clone/) — l'alternative qui clone tout le dépôt dans un répertoire de travail.
