---
title: "Prompt → réponse"
description: Le workflow minimal — une saisie utilisateur envoyée à un modèle, en deux nodes.
sidebar:
  order: 1
---

Ce premier exemple construit le **workflow le plus simple possible** : l'utilisateur saisit un texte, le texte est envoyé à un modèle comme prompt, et la réponse du modèle est produite comme artifact.

Il se résume à deux nodes câblés bout à bout :

```
[ User Input ] --(Markdown)--> [ Claude Code Invoke ] --(Markdown)--> out
```

![Le workflow « Prompt → réponse » dans le studio de workflow](../../../../assets/tutorials/user-input-claude-invoke.png)

## Ce dont vous avez besoin

- Un template vide ouvert dans le studio de workflow.
- Les nodes [User Input](/fr/nodes/user-input/) et [Claude Code Invoke](/fr/nodes/claude-code-invoke/) (famille **Sources / Entrées** et **Génération IA** de la palette).

## 1. Le point d'entrée — User Input

Ajoutez un node **User Input**. C'est lui qui capture la _seed_ : le texte que l'utilisateur fournira au démarrage du run.

Configuration :

| Clé | Valeur |
| --- | --- |
| `outputKind` | `Markdown` |

Sa sortie `out` émettra un artifact `Markdown` contenant la saisie telle quelle.

## 2. La génération — Claude Code Invoke

Ajoutez un node **Claude Code Invoke**. Il prend son port d'entrée `prompt`, l'envoie au modèle, et produit la réponse sur `out`.

Configuration :

| Clé | Valeur |
| --- | --- |
| `model` | `claude-opus-4-7` |
| `outputKind` | `Markdown` |
| `maxTokens` | `8000` |

## 3. Le câblage

Reliez la sortie `out` du **User Input** à l'entrée `prompt` du **Claude Code Invoke**.

Le port `prompt` est polymorphe (`*`) : il accepte n'importe quel kind et envoie le contenu de l'artifact comme prompt utilisateur. La saisie `Markdown` passe donc directement, sans transformation.

## 4. Le run

Lancez le workflow. CtxFirst demande la saisie de départ (le node User Input), puis :

1. **User Input** sérialise le texte en `Markdown` et l'émet sur `out`.
2. **Claude Code Invoke** reçoit ce Markdown comme prompt, invoque le modèle en streaming, et produit la réponse en `Markdown` sur son `out`.

L'artifact final `out` est la réponse du modèle — visible dans le détail du run.

## Et ensuite ?

- Insérez un [Human Gate](/fr/nodes/human-gate/) entre le modèle et la suite pour valider la réponse avant de continuer.
- Remplacez le prompt brut par un prompt réutilisable de la bibliothèque avec un [Skill Loader](/fr/nodes/skill-loader/) en amont.
- Assemblez plusieurs fragments en un seul prompt avec [Concat Markdown](/fr/nodes/concat-markdown/).
