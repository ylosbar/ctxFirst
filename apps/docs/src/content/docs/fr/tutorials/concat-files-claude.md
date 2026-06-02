---
title: "Fusionner deux fichiers pour Claude"
description: Charger deux fichiers dans des variables, les fusionner avec Concat Markdown, puis envoyer le résultat à Claude Code Invoke.
sidebar:
  order: 3
---

Cet exemple montre comment **assembler plusieurs sources** avant d'appeler le modèle, en s'appuyant sur les **variables de template** pour découpler le chargement de la fusion.

Le scénario : deux fichiers Markdown sont lus, rangés chacun dans une variable, fusionnés par [Concat Markdown](/fr/nodes/concat-markdown/), et le tout est envoyé comme prompt à [Claude Code Invoke](/fr/nodes/claude-code-invoke/).

```
(Start) → [ Load File ] → [ Load File ] → [ Concat Markdown ] → [ Claude Code Invoke ] → out
            writesTo:        writesTo:        readsFrom:
            fileA            fileB            main=fileA, markdown1=fileB
```

![Le workflow fusionnant deux fichiers via des variables puis appelant Claude](../../../../assets/tutorials/concat-files-claude.png)

Le **Start** est le marqueur d'entrée du workflow : il pointe vers le premier node. Les deux chargements s'enchaînent, puis la fusion lit les deux variables.

## Les variables, en bref

Un port de **sortie** peut publier son artifact dans une **variable de template** (`writesTo`), et un port d'**entrée** peut aller lire une variable (`readsFrom`) — sans câble direct entre les deux nodes. C'est ce qui permet ici aux deux chargements d'alimenter la fusion sans que leurs ports soient reliés un à un.

## 1. Déclarer les deux variables

Dans l'inspecteur du template, déclarez deux variables (rôle `internal`, le défaut) :

| Nom | Kind |
| --- | --- |
| `fileA` | `Markdown` |
| `fileB` | `Markdown` |

## 2. Charger le premier fichier → `fileA`

Ajoutez un node [Load File](/fr/nodes/overview/) (`file.load`). C'est le **node d'entrée** : reliez-y le **Start**.

| Réglage | Valeur |
| --- | --- |
| `path` (config) | chemin **absolu** du premier fichier |
| `outputKind` | `Markdown` |
| `writesTo.out` | `fileA` |

À l'exécution, il lit le fichier et **publie** son contenu dans la variable `fileA`.

## 3. Charger le second fichier → `fileB`

Ajoutez un second **Load File**, enchaîné après le premier (transition `Load File #1 → Load File #2`).

| Réglage | Valeur |
| --- | --- |
| `path` (config) | chemin **absolu** du second fichier |
| `outputKind` | `Markdown` |
| `writesTo.out` | `fileB` |

Il publie son contenu dans `fileB`.

## 4. Fusionner — Concat Markdown

Ajoutez un node [Concat Markdown](/fr/nodes/concat-markdown/), enchaîné après le second chargement.

| Réglage | Valeur |
| --- | --- |
| `mode` | `concat` |
| `readsFrom.main` | `fileA` |
| `readsFrom.markdown1` | `fileB` |
| `separator` | `\n\n` (défaut) |

Plutôt que de câbler les sorties des deux loads sur ses ports, le node **va chercher** `fileA` dans son port `main` et `fileB` dans `markdown1` via `readsFrom`. La transition depuis le second chargement ne sert qu'à **ordonner** l'exécution : quand la fusion s'exécute, les deux variables sont déjà remplies.

Sa sortie `out` est un seul `Markdown` : `fileA`, un séparateur, puis `fileB`.

## 5. Envoyer à Claude

Ajoutez un [Claude Code Invoke](/fr/nodes/claude-code-invoke/) et câblez `Concat Markdown.out` → `Claude Code Invoke.prompt`.

| Réglage | Valeur |
| --- | --- |
| `model` | `claude-opus-4-7` |
| `outputKind` | `Markdown` |

Le Markdown fusionné devient le prompt envoyé au modèle.

## 6. Le run

1. **Load File #1** lit le premier fichier → `fileA`.
2. **Load File #2** lit le second fichier → `fileB`.
3. **Concat Markdown** lit `fileA` et `fileB`, les fusionne, et émet le Markdown combiné.
4. **Claude Code Invoke** reçoit ce Markdown comme prompt et produit la réponse sur `out`.

## Et ensuite ?

- Passez Concat Markdown en **mode `template`** : faites de `fileA` un gabarit avec un placeholder `{{extrait}}` rempli par `fileB`, pour insérer une source au bon endroit plutôt que de simplement la coller à la suite.
- Remplacez les chargements par un seul [Load Files](/fr/nodes/overview/) (`files.load`) qui lit N fichiers sous un répertoire de base.
- Ajoutez une [boucle de validation humaine](/fr/tutorials/human-validation-loop/) sur le Claude Code Invoke.
