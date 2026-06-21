---
title: Skill Loader
description: Le node Skill Loader — charge une skill (prompt) sauvegardée et l'expose comme artifact Markdown.
---

`skill.loader`

**Skill Loader** résout une **skill** (un _prompt_ persisté dans la bibliothèque) référencée par sa config, traite son `body` comme un gabarit Markdown, et expose le résultat hydraté sous forme d'artifact `Markdown` sur le port `out`. Chaque placeholder `{{variable}}` du body devient un port d'entrée optionnel substitué depuis l'amont — voir [Variables de template](/fr/features/variables/) pour le mécanisme commun des placeholders.

Il sert typiquement à brancher un prompt réutilisable en amont d'un node `claude_code.invoke` (ou autre agent) qui consomme ce Markdown comme entrée. Le node est **découplé** de l'agent : aucune dépendance au niveau config, la connexion se fait via les transitions du workflow.

![Le node Skill Loader dans le studio de workflow](../../../../assets/nodes/skill-loader.png)

## Ports

| Sens | Port | Kind | Notes |
| --- | --- | --- | --- |
| Entrée | `in` | `*` | **Optionnel**, non consommé. Disponible pour le chaînage (ex. derrière un `workspace.set` passthrough). Occulté si le body de la skill contient un placeholder littéral `{{in}}`. |
| Entrée | `{{variable}}` | `Markdown`, `Json` | Un port **optionnel** par placeholder distinct du `body` de la skill, dans l'ordre de première apparition. La valeur câblée (`body` du payload, repli sur le contenu brut) remplace le placeholder. Modifier la skill change les ports. |
| Sortie | `out` | `Markdown` | Port primaire : le `body` de la skill résolue, placeholders substitués. |

## Configuration

| Clé | Type | Défaut | Description |
| --- | --- | --- | --- |
| `skillRef` | `string` | `""` | Référence de la skill à charger depuis la bibliothèque. **Obligatoire** — le runner échoue si vide. |
| `onMissing` | `"keep"` \| `"empty"` \| `"error"` | `"empty"` | Politique pour un placeholder sans valeur câblée : `keep` le laisse littéral, `empty` le retire de la sortie, `error` fait échouer le run. Voir [Variables de template](/fr/features/variables/). |

## Comportement à l'exécution

1. Le runner lit `config.skillRef` (erreur si vide ou absent) et `config.onMissing` (défaut `empty`).
2. Il résout la skill via la `SkillRegistry` (`ctx.deps.skills`) — erreur si le registre n'est pas câblé.
3. Il construit une table de valeurs indexée par **nom de port** (= nom de placeholder) ; le port de chaînage `in` est ignoré.
4. Il hydrate le `body` de la skill en substituant chaque `{{name}}` selon `onMissing`, et construit un payload `Markdown`.
5. Il stocke le payload et produit l'artifact sur `out`, avec les métadonnées `source: "skill.loader"`, `skillRef`, `missing` (les noms de placeholders non résolus) et `byteLength`.

## Exemple

Charger un prompt « code review » et l'envoyer à un agent :

- `skillRef`: la référence de la skill voulue.
- Sortie `out` (`Markdown`) → câblée sur l'entrée d'un node `claude_code.invoke` en aval.

## Voir aussi

- [Vue d'ensemble des nodes](/fr/nodes/overview/)
- [Variables de template](/fr/features/variables/) — le mécanisme commun des placeholders `{{variable}}`.
- [Markdown Template](/fr/nodes/markdown-template/) — le même templating, mais le gabarit vit inline dans la config.
- [User Input](/fr/nodes/user-input/) — l'autre node source (saisie utilisateur plutôt que prompt de bibliothèque).
