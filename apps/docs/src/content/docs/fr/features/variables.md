---
title: Variables de template
description: Comment les placeholders {{variable}} des gabarits Markdown et des bodies de skill deviennent des ports d'entrée hydratés depuis l'amont.
---

Plusieurs nodes traitent une chaîne Markdown comme un **gabarit** : chaque placeholder `{{variable}}` qu'elle contient devient un port d'entrée optionnel, et la valeur câblée sur ce port est substituée dans le texte à l'exécution. C'est ainsi qu'un workflow assemble un prompt paramétré à partir de fragments amont.

Le même mécanisme alimente deux nodes :

- [Markdown Template](/fr/nodes/markdown-template/) — le gabarit vit inline dans `config.template`.
- [Skill Loader](/fr/nodes/skill-loader/) — le gabarit est le **body de la skill** résolue (un prompt sauvegardé dans la bibliothèque).

Cette page décrit la grammaire des placeholders, la dérivation des ports et la politique `onMissing`, communes aux deux.

## Syntaxe des placeholders

Un placeholder s'écrit `{{name}}`. Le nom doit respecter la grammaire `^[a-zA-Z_][a-zA-Z0-9_]*$` — une lettre ou un underscore d'abord, puis des lettres, chiffres ou underscores. Les espaces **à l'intérieur** des accolades sont tolérés : `{{ spec }}` et `{{spec}}` désignent la même variable. Tout ce qui ne correspond pas (ex. `{{1abc}}`, `{{a-b}}`) est laissé tel quel, comme texte littéral.

Les placeholders distincts sont collectés dans l'**ordre de première apparition** et **dédupliqués**. Le gabarit `{{a}} x {{ b }} {{a}}` déclare deux variables — `a` et `b` — et `a` est substituée aux deux endroits.

## Du placeholder au port

Chaque placeholder distinct déclare un port d'entrée **optionnel**, nommé exactement comme le placeholder (le nom de port **est** le nom de variable), acceptant `Markdown` ou `Json`.

La valeur substituée est le `body` du payload câblé, avec repli sur son contenu brut. Une valeur `Json` insère donc son champ `body` — pratique pour glisser un exemple JSON dans un prompt.

Chaque node de templating expose aussi un port `in` optionnel (kind `*`) réservé au **chaînage de control-flow** (ex. derrière un passthrough [Workspace Set](/fr/nodes/workspace-set/)). Il n'est jamais substitué dans le gabarit. Un placeholder littéral `{{in}}` **occulte** ce port de chaînage : `in` devient alors un port de valeur.

Avec un gabarit vide (aucun placeholder), le node retombe sur la signature permissive limitée à `in`, ce qui le garde sélectionnable dans l'éditeur.

## Valeurs manquantes — `onMissing`

Quand un placeholder n'a pas de valeur câblée à l'exécution, la config `onMissing` décide du comportement :

| Valeur | Comportement |
| --- | --- |
| `empty` _(défaut)_ | Le placeholder est retiré de la sortie (remplacé par une chaîne vide). |
| `keep` | Le placeholder est laissé littéral `{{name}}` dans la sortie. |
| `error` | Le run échoue, en listant les placeholders non résolus. |

Quelle que soit la politique, les noms des placeholders non résolus sont enregistrés dans la métadonnée `missing` de l'artifact de sortie (séparés par des virgules), pour qu'un consommateur aval ou l'inspecteur de run sache quelles variables sont restées non câblées.

## Où s'appliquent les variables

| | [Markdown Template](/fr/nodes/markdown-template/) | [Skill Loader](/fr/nodes/skill-loader/) |
| --- | --- | --- |
| Source du gabarit | `config.template` (inline) | le `body` de la skill résolue |
| Éditer le gabarit | modifier `config.template` | modifier la skill dans la bibliothèque |
| Dépendance | aucune (autonome) | le registre de skills |

Dans les deux cas, les ports d'entrée sont dérivés des placeholders trouvés dans le gabarit : ajouter ou retirer un `{{variable}}` ajoute ou retire le port correspondant.

## Exemple

Construire un prompt de relecture paramétré :

- Gabarit : `Relis la spec {{spec}} au regard de {{rules}}.`
- Câbler `spec` ← un [Load File](/fr/nodes/file-load/) produisant du `Markdown`, et `rules` ← une autre source `Markdown` amont.
- Mettre `onMissing` à `error` pour échouer rapidement si une variable reste non câblée.
- Sortie `out` (`Markdown`) → entrée d'un node [Claude Code Invoke](/fr/nodes/claude-code-invoke/) en aval.

## Voir aussi

- [Markdown Template](/fr/nodes/markdown-template/) — des `{{variables}}` dans un gabarit inline stocké en config.
- [Skill Loader](/fr/nodes/skill-loader/) — le même templating, mais le body vient d'une skill sauvegardée.
- [Concat Markdown](/fr/nodes/concat-markdown/) — concatène des fragments plutôt que de substituer des placeholders nommés.
- [Render Markdown](/fr/nodes/render-markdown/) — projette un artifact typé en Markdown câblable dans un port de variable.
- [Kinds](/fr/type-system/kinds/) — les kinds `Markdown` / `Json` qu'un port de variable accepte, et le système de types plus large.
