---
title: Load Markdown File
description: Le node Load Markdown File — lit un fichier Markdown à un chemin absolu et l'expose comme artifact Markdown.
---

`file.load-markdown`

**Load Markdown File** lit un fichier Markdown à un chemin absolu (`config.path`) et expose son contenu comme un artifact `Markdown` sur `out`. C'est le pendant non polymorphe, Markdown uniquement, de [Load File](/fr/nodes/file-load/) : aucun kind de sortie à choisir, toujours `Markdown`.

Ce kind est un **alias deprecated** conservé pour que les templates persistés existants continuent de fonctionner — il délègue au même cœur partagé que `file.load`. Les nouveaux workflows devraient utiliser [Load File](/fr/nodes/file-load/) avec `outputKind = Markdown`, qui supporte en plus un input `path` dynamique.

![Le node Load Markdown File dans le studio de workflow (capture à ajouter)](../../../../assets/nodes/placeholder.png)

## Ports

| Sens | Port | Kind | Notes |
| --- | --- | --- | --- |
| Entrée | `in` | `*` | **Optionnel**. Disponible pour le chaînage (p. ex. ordonnancement) mais non consommé — le chemin vient de `config.path`, jamais de ce port. |
| Sortie | `out` | `Markdown` | Port primaire. Le contenu du fichier emballé en envelope texte `Markdown` (`{ format, body }`). |

## Configuration

| Clé | Type | Défaut | Description |
| --- | --- | --- | --- |
| `path` | `string` | `""` | Chemin absolu du fichier Markdown à lire. **Obligatoire** — le runner échoue s'il est absent ou vide. |

## Comportement à l'exécution

1. Le runner lit `config.path`, le trim, et échoue s'il est vide.
2. Il délègue au cœur partagé `file.load` avec `outputKind = Markdown`.
3. Il vérifie que le chemin est **absolu** (erreur sinon) et lit le fichier (erreur si vide).
4. Il stocke l'artifact (`{ format, body }`) avec les métadonnées `source`, `path` et `byteLength`, et le produit sur `out`.

## Exemple

Charger une spec Markdown depuis le disque et l'envoyer à un agent :

- `path` : le chemin absolu du fichier Markdown.
- Sortie `out` (`Markdown`) → entrée d'un node [Claude Code Invoke](/fr/nodes/claude-code-invoke/) en aval.

## Voir aussi

- [Vue d'ensemble des nodes](/fr/nodes/overview/)
- [Load File](/fr/nodes/file-load/) — le successeur polymorphe ; choisissez `Markdown` ou `Json` et câblez un `path` dynamique.
- [Load Files](/fr/nodes/files-load/) — lit plusieurs fichiers sous un répertoire de base en une fois.
