---
title: "Fusionner deux prompts en un seul contexte"
description: Charger deux fichiers dans des variables, les fusionner avec Concat Markdown, puis envoyer le résultat à Claude Code Invoke.
sidebar:
  order: 3
---

Cet exemple montre comment **assembler plusieurs sources** avant d'appeler le modèle, en s'appuyant sur les **variables de template** pour découpler le chargement de la fusion.

Le scénario : deux fichiers Markdown sont lus, rangés chacun dans une variable, fusionnés par [Concat Markdown](/fr/nodes/concat-markdown/), et le tout est envoyé comme prompt à [Claude Code Invoke](/fr/nodes/claude-code-invoke/).

```
(Start) → [ Load File #1 ] → [ Load File #2 ] → [ Concat Markdown ] → [ Claude Code Invoke ] → out
            writesTo.out =                       main      ← câble depuis Load File #2.out
            Context1                             markdown1 ← Context1 (readsFrom)
```

![Le workflow fusionnant deux fichiers via des variables puis appelant Claude](../../../../assets/tutorials/concat-files-claude.png)

Le **Start** est le marqueur d'entrée du workflow : il pointe vers le premier node. Les deux chargements s'enchaînent, puis la fusion lit les deux variables.

## Les variables, en bref

Un port de **sortie** peut publier son artifact dans une **variable de template** (`writesTo`), et un port d'**entrée** peut aller lire une variable (`readsFrom`) — sans câble direct entre les deux nodes. Ce tutoriel combine les deux approches : le **premier** chargement passe par une variable (`Context1`), tandis que le **second** est **câblé directement** sur le port `main` de la fusion.

## 1. Déclarer la variable

Dans l'inspecteur du template, déclarez une variable (rôle `internal`, le défaut) :

| Nom | Kind |
| --- | --- |
| `Context1` | `Markdown` |

## 2. Charger le premier fichier → `Context1`

Ajoutez un node [Load File](/fr/nodes/overview/) (`file.load`). C'est le **node d'entrée** : reliez-y le **Start**.

| Réglage | Valeur |
| --- | --- |
| `path` (config) | chemin **absolu** du premier fichier |
| `outputKind` | `Markdown` |
| `writesTo.out` | `Context1` |

À l'exécution, il lit le fichier et **publie** son contenu dans la variable `Context1`.

## 3. Charger le second fichier (câble direct)

Ajoutez un second **Load File**, enchaîné après le premier (transition `Load File #1 → Load File #2`).

| Réglage | Valeur |
| --- | --- |
| `path` (config) | chemin **absolu** du second fichier |
| `outputKind` | `Markdown` |

Celui-ci **n'écrit pas** dans une variable : sa sortie `out` sera **câblée directement** sur le port `main` de Concat Markdown (étape suivante).

## 4. Fusionner — Concat Markdown

Ajoutez un node [Concat Markdown](/fr/nodes/concat-markdown/). Câblez `Load File #2.out` → `Concat Markdown.main`.

| Réglage | Valeur |
| --- | --- |
| `mode` | `concat` |
| `main` | câble depuis `Load File #2.out` |
| `readsFrom.markdown1` | `Context1` |
| `separator` | `\n\n` (défaut) |

Le node mélange les deux modes d'alimentation : son port `main` reçoit le second fichier par **câble direct**, tandis qu'il **va chercher** `Context1` dans `markdown1` via `readsFrom`. Le câble depuis `Load File #2` assure aussi l'**ordre** d'exécution : quand la fusion s'exécute, le second fichier est arrivé et `Context1` est déjà remplie.

Sa sortie `out` est un seul `Markdown` : le contenu de `Load File #2` (port `main`), un séparateur, puis `Context1` (port `markdown1`).

## 5. Envoyer à Claude

Ajoutez un [Claude Code Invoke](/fr/nodes/claude-code-invoke/) et câblez `Concat Markdown.out` → `Claude Code Invoke.prompt`.

| Réglage | Valeur |
| --- | --- |
| `model` | `claude-opus-4-7` |
| `outputKind` | `Markdown` |

Le Markdown fusionné devient le prompt envoyé au modèle.

## 6. Le run

1. **Load File #1** lit le premier fichier → `Context1`.
2. **Load File #2** lit le second fichier → sa sortie part directement vers `Concat Markdown.main`.
3. **Concat Markdown** combine le second fichier (`main`) et `Context1` (`markdown1`), et émet le Markdown combiné.
4. **Claude Code Invoke** reçoit ce Markdown comme prompt et produit la réponse sur `out`.

## Et ensuite ?

- Passez Concat Markdown en **mode `template`** : faites de `Context1` un gabarit avec un placeholder `{{extrait}}` rempli par le contenu du second fichier (port `main`), pour insérer une source au bon endroit plutôt que de simplement la coller à la suite.
- Remplacez les chargements par un seul [Load Files](/fr/nodes/overview/) (`files.load`) qui lit N fichiers sous un répertoire de base.
- Ajoutez une [boucle de validation humaine](/fr/tutorials/human-validation-loop/) sur le Claude Code Invoke.
