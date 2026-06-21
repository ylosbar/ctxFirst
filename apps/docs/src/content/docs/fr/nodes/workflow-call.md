---
title: Sub-workflow
description: Le node Sub-workflow — inline le graphe d'un autre template publié au démarrage, ses steps s'exécutant dans le même run.
---

`workflow.call`

**Sub-workflow** référence un autre template publié et **inline** son graphe dans le template courant. Avant le démarrage du run, la passe d'expansion remplace chaque step `workflow.call` par les steps du template référencé — ils s'exécutent dans le **même run**, sans instance enfant. Ce step kind est un marqueur : son `run()` n'est jamais invoqué.

À opposer à [Invoke sub-template](/fr/nodes/template-invoke/), qui spawn une **instance enfant isolée** (son propre run) au lieu d'inliner.

![Le node Sub-workflow dans le studio de workflow (capture à ajouter)](../../../../assets/nodes/placeholder.png)

## Ports

Pas de ports statiques. Le node est configuré par `templateId` / `templateVersion`, et ses ports sont **dérivés des variables d'interface du sous-template référencé** — un port d'entrée par variable de rôle `input`, un slot de sortie par variable de rôle `output`. Tant que le snapshot du sous-template n'est pas résolu, le node retombe sur une signature vide (aucun port) mais reste sélectionnable dans l'éditeur.

Le câblage se fait via ces ports dérivés : l'hôte les lie via les `readsFrom` / `writesTo` du step, en aliasant les variables d'interface du sous-template sur les variables locales de l'hôte. À l'inline, les arêtes de frontière deviennent des fils de contrôle (les données circulent par les variables aliasées).

## Configuration

| Clé | Type | Défaut | Description |
| --- | --- | --- | --- |
| `templateId` | `string` | `—` | Id du template publié à inliner. **Obligatoire** — l'aplatissement échoue sans référence littérale. |
| `templateVersion` | `string` | `—` | Version du template référencé. **Obligatoire** — épinglée pour que le graphe inliné soit reproductible. |

## Comportement à l'exécution

1. Le step `workflow.call` ne s'exécute jamais directement — atteindre son `run()` est un bug d'aplatissement.
2. Avant l'exécution de l'instance, `flattenTemplate` lit `{ templateId, templateVersion }` et inline récursivement les steps, transitions et variables du template référencé à la place de l'appel.
3. Les variables d'interface enfant liées par l'appel (`readsFrom` / `writesTo`) sont aliasées sur des variables hôtes ; les variables enfant non liées ou internes deviennent des variables hôtes privées et namespacées.
4. Les arêtes de frontière sont réduites à des fils de contrôle ; les arêtes entrantes ciblent l'entrée enfant, les sortantes partent de l'exit produisant la variable de sortie routée.
5. Le résultat est un unique **template effectif** plat sans step `workflow.call`, que l'orchestrateur exécute tel quel. Les cycles de référence et une profondeur d'expansion supérieure à 8 sont rejetés.

## Exemple

Réutiliser un sous-workflow partagé « lint et format » en inline :

- `templateId` / `templateVersion`: le template publié à inliner.
- Câblez les entrées de l'hôte sur les ports d'entrée dérivés (ses variables d'interface `input`), et consommez ses ports de sortie dérivés en aval — le tout dans le même run.

## Voir aussi

- [Vue d'ensemble des nodes](/fr/nodes/overview/)
- [Invoke sub-template](/fr/nodes/template-invoke/) — l'alternative à instance enfant isolée ; n'inline rien.
- [User Input](/fr/nodes/user-input/) — une source typique alimentant les ports d'entrée dérivés.
