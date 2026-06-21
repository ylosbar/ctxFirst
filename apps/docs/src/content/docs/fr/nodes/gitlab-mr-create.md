---
title: "GitLab: create MR"
description: Le node GitLab create MR — crée une merge request GitLab via l'API REST et produit le JSON de la MR.
---

`gitlab.mr.create`

**GitLab: create MR** crée une merge request via l'API REST GitLab (`POST /projects/:id/merge_requests`) et émet l'objet MR complet comme artifact `Json` — notamment `iid`, `project_id` et `web_url`, que [GitLab: merge MR](/fr/nodes/gitlab-mr-merge/) consomme ensuite.

Les champs (`project`, `sourceBranch`, `targetBranch`, `title`, `description`) sont résolus dynamiquement depuis l'input JSON `in` avec un repli sur la config — on peut ainsi brancher directement dans la MR un nom de branche produit en amont (par ex. par un [Git Commit & Push](/fr/nodes/git-commit-push/)).

![Le node GitLab create MR dans le studio de workflow (capture à ajouter)](../../../../assets/nodes/placeholder.png)

## Ports

| Sens | Port | Kind | Notes |
| --- | --- | --- | --- |
| Entrée | `in` | `Json`, `*` | **Optionnel**. Enveloppe JSON pouvant fournir `project` / `sourceBranch` / `targetBranch` / `title` / `description` (l'input l'emporte sur la config). |
| Sortie | `out` | `Json` | Port primaire. L'objet merge request créé (`iid`, `project_id`, `web_url`, …). |

## Configuration

| Clé | Type | Défaut | Description |
| --- | --- | --- | --- |
| `project` | `string` | `""` | Id numérique **ou** chemin `group/project`. **Obligatoire** (config ou `in.project`) — lève une erreur si absent. |
| `sourceBranch` | `string` | `""` | Branche source de la MR. **Obligatoire** (config ou `in.sourceBranch`) — lève une erreur si absente. |
| `targetBranch` | `string` | `main` | Branche cible de la MR. |
| `title` | `string` | `Merge <sourceBranch>` | Titre de la MR. **Obligatoire** — repli sur `Merge <sourceBranch>` si ni la config ni l'input n'en fournit. |
| `description` | `string` | `""` | Description de la MR. Envoyée seulement si non vide. |
| `baseUrl` | `string` | `https://gitlab.com` | Instance GitLab (sans slash final). À définir pour une instance auto-hébergée. |

## Sécurité

- Le token d'accès est résolu à l'exécution (settings chiffrés, avec repli sur la variable d'env `GITLAB_TOKEN`), **jamais** stocké dans le template — comme `git.clone` / `gitlab.files.fetch`. Le runner lève `no GitLab access token (set it in Settings or the GITLAB_TOKEN env var)` si aucun token n'est disponible.
- Le token voyage dans l'en-tête `PRIVATE-TOKEN`, **jamais dans l'URL**, donc les statuts et corps d'erreur sont sûrs à logger.
- Utilise le `fetch` global du main process (aucune CSP renderer à toucher).

## Comportement à l'exécution

1. Le runner lit le payload JSON `in` (le cas échéant) et la config.
2. Il résout `project` (`in.project` → `config.project` ; erreur si absent), `sourceBranch` (`in` → config ; erreur si absente), `targetBranch` (`in` → config → `main`), `title` (`in` → config → `Merge <sourceBranch>` ; erreur si absent) et `description` (`in` → config → `""`).
3. Il normalise `baseUrl` et résout le token GitLab (settings, puis `GITLAB_TOKEN` ; erreur si aucun).
4. Il appelle `POST {baseUrl}/api/v4/projects/{encProject}/merge_requests` avec `source_branch`, `target_branch`, `title` et `description` (si défini).
5. Une réponse non-ok lève `HTTP {status}` plus un extrait du corps.
6. Il stocke le JSON de la MR comme artifact `Json` (métadonnées : `source`, `project`, `iid`, `webUrl`) et le produit sur `out`.

## Exemple

Ouvrir une MR pour une branche poussée en amont :

- `project` : `group/project`, `sourceBranch` : la branche de travail, `targetBranch` : `main`, `title` : un résumé.
- Sortie `out` (`Json`) → entrée `mr` d'un [GitLab: merge MR](/fr/nodes/gitlab-mr-merge/) en aval, qui y lit `iid` + `project_id`.

## Voir aussi

- [Vue d'ensemble des nodes](/fr/nodes/overview/)
- [GitLab: merge MR](/fr/nodes/gitlab-mr-merge/) — consomme la sortie `out` de ce node pour merger la MR.
- [GitLab Files Fetch](/fr/nodes/gitlab-files-fetch/) — lit des fichiers d'un dépôt GitLab via la même API REST et le même token.
- [Git Commit & Push](/fr/nodes/git-commit-push/) — pousse la branche pour laquelle cette MR est ouverte.
