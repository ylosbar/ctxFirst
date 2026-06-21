---
title: Invoke sub-template
description: Le node Invoke sub-template — spawn une instance enfant isolée d'un autre template publié et l'attend.
---

`template.invoke`

**Invoke sub-template** délègue à une **instance enfant** d'un autre template publié. À l'exécution, l'orchestrateur spawn une instance isolée du sous-template référencé — avec **son propre run** —, suspend ce step en `awaitingChild`, puis le reprend une fois que l'enfant atteint un état terminal. Le parent et l'enfant sont câblés via les variables d'interface du sous-template.

À opposer à [Sub-workflow](/fr/nodes/workflow-call/), qui **inline** le graphe référencé dans le même run, sans instance enfant.

![Le node Invoke sub-template dans le studio de workflow (capture à ajouter)](../../../../assets/nodes/placeholder.png)

## Ports

Pas de ports statiques. Le node est configuré par `templateId` / `templateVersion`, et ses ports sont **dérivés des variables d'interface du sous-template référencé** — un port d'entrée par variable de rôle `input`, un slot de sortie par variable de rôle `output`. Tant que le snapshot du sous-template n'est pas résolu, le node retombe sur une signature vide (aucun port) mais reste sélectionnable dans l'éditeur.

Le câblage se fait via ces ports dérivés : l'hôte les lie via les `readsFrom` / `writesTo` du step, exactement comme tout autre node. Les variables d'entrée amorcent l'instance enfant ; les variables de sortie de l'enfant remontent vers les slots de sortie du parent à sa terminaison.

## Configuration

| Clé | Type | Défaut | Description |
| --- | --- | --- | --- |
| `templateId` | `string` | `—` | Id du template publié à invoquer comme enfant. **Obligatoire** — l'enfant ne peut pas se résoudre sans référence littérale. |
| `templateVersion` | `string` | `—` | Version du template référencé. **Obligatoire** — épinglée quand l'auteur choisit le sous-template. |

## Comportement à l'exécution

1. Le runner est sans effet de bord : `run()` retourne un marqueur `spawned-child` portant la config du step, déclarant seulement l'intention de spawn.
2. L'orchestrateur (qui possède le journal d'événements) lit `{ templateId, templateVersion }`, résout le template enfant et l'amorce depuis les variables d'entrée.
3. Il émet `ChildInstanceSpawned` et le `InstanceStarted` de l'enfant, puis bascule ce step en `awaitingChild`.
4. L'enfant s'exécute comme une instance isolée avec son propre run ; le step parent est suspendu pendant ce temps.
5. Quand l'enfant atteint un état terminal, le step reprend et ses variables de sortie remontent vers le parent. La profondeur d'invocation est bornée à 8 (vérifiée au démarrage racine et à chaque spawn) pour garantir la terminaison.

## Exemple

Exécuter un sous-pipeline réutilisable comme enfant isolé :

- `templateId` / `templateVersion`: le template publié à invoquer.
- Câblez les entrées de l'hôte sur les ports d'entrée dérivés (ses variables d'interface `input`) pour amorcer l'enfant, et consommez ses ports de sortie dérivés en aval une fois l'enfant terminé.

## Voir aussi

- [Vue d'ensemble des nodes](/fr/nodes/overview/)
- [Sub-workflow](/fr/nodes/workflow-call/) — l'alternative inline ; s'exécute dans le même run sans instance enfant.
- [Human Gate](/fr/nodes/human-gate/) — met le parent en pause pour une décision humaine autour d'une invocation.
