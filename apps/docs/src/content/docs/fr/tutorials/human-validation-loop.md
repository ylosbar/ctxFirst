---
title: "Génération avec boucle de validation"
description: User Input → Claude Code Invoke avec validation humaine cochée sur le node, et une boucle de feedback qui le ré-invoque tant que l'humain n'a pas validé.
sidebar:
  order: 2
---

Ce deuxième exemple reprend le [workflow minimal](/fr/tutorials/user-input-claude-invoke/) et y ajoute une **validation humaine en boucle** — sans node supplémentaire. Il suffit de **cocher la validation humaine sur le node de génération** : sa sortie passe par un point de contrôle, et si la personne demande un ajustement, le modèle est **ré-invoqué avec son feedback**, sans repartir de zéro.

C'est le cœur du produit : itérer sur une étape avec le contexte préservé.

```
[ User Input ] --(Markdown)--> [ Claude Code Invoke ✓ validation humaine ]
                                        ▲                         │
                                        └──── feedback (boucle isLoop) ────┘
```

![Le workflow avec validation humaine et self-loop de feedback dans le studio](../../../../assets/tutorials/human-validation-loop.png)

## Ce dont vous avez besoin

- Le [premier exemple](/fr/tutorials/user-input-claude-invoke/) en tête : vous savez câbler [User Input](/fr/nodes/user-input/) → [Claude Code Invoke](/fr/nodes/claude-code-invoke/).

## 1. Le socle — saisie puis génération

Reprenez les deux nodes de l'exemple [Prompt → réponse](/fr/tutorials/user-input-claude-invoke/) :

- **User Input** — `outputKind: Markdown`.
- **Claude Code Invoke** — `model: claude-opus-4-7`, `outputKind: Markdown`.

Câblez `User Input.out` → `Claude Code Invoke.prompt`.

## 2. Activer la validation humaine sur la génération

Sélectionnez le node **Claude Code Invoke** et, dans l'inspecteur (section « Comportement »), cochez **« Requiert une validation humaine »** (`humanGateRequired`).

À l'exécution, dès que le node a produit sa sortie, il met le workflow **en pause** (`awaiting-human`) au lieu de continuer : sa réponse attend une décision. Aucun node Human Gate séparé n'est nécessaire — la pause est portée par le node de génération lui-même.

:::tip[Le rôle de l'acteur]
Le rôle attendu pour la validation vient de `config.actorRole` (sinon le rôle du step, sinon `Developer`). C'est lui qui détermine qui est sollicité pour valider.
:::

## 3. La boucle de feedback (self-loop)

Pour que « demander un ajustement » relance la génération, ajoutez une **transition de boucle du node vers lui-même**. Tracez une arête de **Claude Code Invoke** vers **Claude Code Invoke**, puis, l'arête sélectionnée, activez **« Boucle de feedback (dashed) »** (`isLoop`) dans l'inspecteur.

```
Claude Code Invoke ──(isLoop)──▶ Claude Code Invoke   (self-loop)
```

Cette arête ne s'emprunte que lorsque l'humain **demande un ajustement**. Elle ne consomme pas d'artifact : elle indique à l'orchestrateur de ré-invoquer le node, en y injectant le feedback.

## 4. Le run

Lancez le workflow et fournissez la seed. Le déroulé :

1. **User Input** émet la saisie en `Markdown`.
2. **Claude Code Invoke** produit une première réponse, puis met le run **en pause** (validation humaine cochée).
3. La personne tranche :
   - **Valider** → le workflow progresse (ici, il se termine).
   - **Demander un ajustement** → l'orchestrateur ré-invoque le **même** node, le feedback ajouté à son `loopHistory`. Le modèle régénère en tenant compte du commentaire, et la nouvelle réponse repasse par la validation.

Le cycle « génère → valide → ajuste » se répète jusqu'à validation. Chaque tour conserve le contexte des précédents : le modèle ne recommence pas à zéro, il corrige.

## Variante — un node Human Gate dédié

Cocher la validation sur le node garde le workflow compact. Si vous préférez un **point de contrôle explicite** dans le graphe — par exemple pour valider un artifact d'un autre kind, ou matérialiser l'étape de revue — ajoutez plutôt un node [Human Gate](/fr/nodes/human-gate/) en aval :

```
[ Claude Code Invoke ] --(Markdown)--> [ Human Gate ]
          ▲                                  │
          └──────── feedback (isLoop) ───────┘
```

Le câblage : `Claude Code Invoke.out` → `Human Gate.artifact`, et la transition `isLoop` part du **Human Gate** vers le **Claude Code Invoke** (et non plus du node vers lui-même). Le comportement de boucle est identique ; seul le point de pause change.

## Et ensuite ?

- Remplacez la validation humaine par un **LLM Judge** (`llm.judge`) pour une boucle **automatique** : le juge approuve / rejette, et une transition `isLoop` relance la génération sur rejet.
- Enrichissez le prompt en amont avec un [Skill Loader](/fr/nodes/skill-loader/) et un [Concat Markdown](/fr/nodes/concat-markdown/).
