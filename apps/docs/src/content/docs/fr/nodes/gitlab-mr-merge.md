---
title: "GitLab: merge MR"
description: Le node GitLab merge MR — merge immédiatement une merge request GitLab via l'API REST et produit le JSON de la MR mergée.
---

`gitlab.mr.merge`

**GitLab: merge MR** merge une merge request immédiatement via l'API REST GitLab (`PUT /projects/:id/merge_requests/:iid/merge`) et émet la réponse de l'API comme artifact `Json`. La cible est résolue depuis l'input `mr` — typiquement la sortie de [GitLab: create MR](/fr/nodes/gitlab-mr-create/), c.-à-d. `{ iid, project_id }` — avec un repli sur la config.

C'est un **merge immédiat uniquement** : si la MR n'est pas mergeable (conflits, approbations manquantes, pipeline en cours), GitLab renvoie un `405`/`406` et le step échoue avec le message de l'API.

![Le node GitLab merge MR dans le studio de workflow (capture à ajouter)](../../../../assets/nodes/placeholder.png)

## Ports

| Sens | Port | Kind | Notes |
| --- | --- | --- | --- |
| Entrée | `mr` | `Json`, `*` | **Primaire**. JSON de la MR à merger — lit `project_id` / `iid` (la sortie de `gitlab.mr.create` convient directement). Repli sur la config si absents. |
| Sortie | `out` | `Json` | Port primaire. L'objet merge request mergé. |

## Configuration

| Clé | Type | Défaut | Description |
| --- | --- | --- | --- |
| `project` | `string` | `""` | Id numérique **ou** chemin `group/project`. Utilisé quand l'input `mr` ne porte pas `project_id` / `project`. **Obligatoire** depuis l'une des deux sources. |
| `mergeRequestIid` | `string` | `""` | Id interne de la MR (`iid`). Utilisé quand l'input `mr` ne porte pas `iid`. **Obligatoire** depuis l'une des deux sources. |
| `baseUrl` | `string` | `https://gitlab.com` | Instance GitLab (sans slash final). À définir pour une instance auto-hébergée. |

Si ni l'input ni la config ne fournit un `project` **et** un `iid`, le runner lève `missing project/MR iid (wire the mr input from gitlab.mr.create, or set config.project + config.mergeRequestIid)`.

## Sécurité

- Le token d'accès est résolu à l'exécution (settings chiffrés, avec repli sur la variable d'env `GITLAB_TOKEN`), **jamais** stocké dans le template — comme `git.clone` / `gitlab.files.fetch`. Le runner lève `no GitLab access token (set it in Settings or the GITLAB_TOKEN env var)` si aucun token n'est disponible.
- Le token voyage dans l'en-tête `PRIVATE-TOKEN`, **jamais dans l'URL**, donc les statuts et corps d'erreur sont sûrs à logger.
- Utilise le `fetch` global du main process (aucune CSP renderer à toucher).

## Comportement à l'exécution

1. Le runner lit le payload de l'input `mr` (le cas échéant) et la config.
2. Il résout `project` (`mr.project_id` → `mr.project` → `config.project`) et `iid` (`mr.iid` → `config.mergeRequestIid`) ; il lève une erreur si l'un manque.
3. Il normalise `baseUrl` et résout le token GitLab (settings, puis `GITLAB_TOKEN` ; erreur si aucun).
4. Il appelle `PUT {baseUrl}/api/v4/projects/{encProject}/merge_requests/{iid}/merge`.
5. Une réponse non-ok lève `HTTP {status}` plus un extrait du corps (par ex. un `405`/`406` quand la MR n'est pas mergeable).
6. Il stocke le JSON de la MR mergée comme artifact `Json` (métadonnées : `source`, `project`, `iid`, `state`) et le produit sur `out`.

## Exemple

Créer puis merger une MR dans un même flux :

- Câbler la sortie `out` (`Json`) d'un [GitLab: create MR](/fr/nodes/gitlab-mr-create/) amont vers l'input `mr` de ce node — `project_id` et `iid` y sont lus directement, sans config.
- Sortie `out` (`Json`) → un reporting en aval (par ex. un récapitulatif [Concat Markdown](/fr/nodes/concat-markdown/)).

## Voir aussi

- [Vue d'ensemble des nodes](/fr/nodes/overview/)
- [GitLab: create MR](/fr/nodes/gitlab-mr-create/) — produit le JSON de MR que ce node merge.
- [GitLab Files Fetch](/fr/nodes/gitlab-files-fetch/) — lit des fichiers d'un dépôt GitLab via la même API REST et le même token.
- [Human Gate](/fr/nodes/human-gate/) — à insérer avant le merge pour une étape d'approbation manuelle.
