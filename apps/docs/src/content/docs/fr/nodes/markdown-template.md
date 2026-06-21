---
title: Markdown Template
description: Le node Markdown Template — un gabarit Markdown inline dont les {{variables}} deviennent des ports d'entrée hydratés depuis l'amont.
---

`markdown.template`

**Markdown Template** traite une chaîne inline (`config.template`) comme un gabarit Markdown : chaque `{{variable}}` devient un port d'entrée optionnel `Markdown | Json` dont la valeur câblée est substituée, et le Markdown résultant est exposé sur le port `out`. C'est le successeur autonome du mode `template` de `concat.markdown`.

Contrairement à [Skill Loader](/fr/nodes/skill-loader/) — qui lit son gabarit depuis une skill sauvegardée — le gabarit vit ici dans la config : le node n'a donc aucune dépendance injectée. Le nom de port **est** le nom du placeholder (aucun `readsFrom` à appliquer).

![Le node Markdown Template dans le studio de workflow (capture à ajouter)](../../../../assets/nodes/placeholder.png)

## Ports

| Sens | Port | Kind | Notes |
| --- | --- | --- | --- |
| Entrée | `in` | `*` | **Optionnel**, non consommé. Port de chaînage (ex. derrière un passthrough [Workspace Set](/fr/nodes/workspace-set/)). Masqué si un placeholder littéral `{{in}}` l'occulte. |
| Entrée | `{{variable}}` | `Markdown`, `Json` | Un port **optionnel** par placeholder distinct du `template`, dans l'ordre de première apparition. La valeur câblée (`body` du payload, repli sur le contenu brut) remplace le placeholder. |
| Sortie | `out` | `Markdown` | Port primaire : le Markdown substitué. |

Avec un `template` vide (y compris l'appel catalogue avec `config = {}`), le node retombe sur la signature permissive limitée à `in`, ce qui le garde sélectionnable dans l'éditeur.

## Configuration

| Clé | Type | Défaut | Description |
| --- | --- | --- | --- |
| `template` | `string` | `""` | Le gabarit Markdown inline. Chaque `{{variable}}` (grammaire `^[a-zA-Z_][a-zA-Z0-9_]*$`, espaces autour tolérés) déclare un port d'entrée. |
| `onMissing` | `"keep"` \| `"empty"` \| `"error"` | `"empty"` | Politique pour un placeholder sans valeur câblée : `keep` le laisse littéral, `empty` le retire de la sortie, `error` fait échouer le run. |

## Comportement à l'exécution

1. Le runner lit `config.template` (défaut `""`) et `config.onMissing` (défaut `empty`).
2. Il construit une table de valeurs indexée par **nom de port** (= nom de placeholder) ; le port de chaînage `in` est ignoré (il porte du control-flow, pas une valeur).
3. Chaque `{{name}}` est substitué par sa valeur câblée selon `onMissing`.
4. Le Markdown résultant est stocké sur `out` avec les métadonnées `source: "markdown.template"` et `missing` (les noms de placeholders non résolus).

## Exemple

Construire un prompt paramétré à partir de fragments amont :

- `template` : `Relis la spec {{spec}} au regard de {{rules}}.`
- Câbler `spec` ← un [Load File](/fr/nodes/file-load/) produisant du `Markdown`, et `rules` ← une autre source `Markdown` amont.
- `onMissing` : `error` pour échouer rapidement si une variable reste non câblée.
- Sortie `out` (`Markdown`) → entrée d'un node [Claude Code Invoke](/fr/nodes/claude-code-invoke/) en aval.

## Voir aussi

- [Vue d'ensemble des nodes](/fr/nodes/overview/)
- [Variables de template](/fr/features/variables/) — la grammaire commune des placeholders `{{variable}}` et la politique `onMissing`.
- [Concat Markdown](/fr/nodes/concat-markdown/) — son frère ; concatène des fragments plutôt que de substituer des placeholders nommés.
- [Render Markdown](/fr/nodes/render-markdown/) — projette un artifact typé en Markdown injectable dans un port.
- [Skill Loader](/fr/nodes/skill-loader/) — la même forme de templating, mais en lisant le body depuis une skill sauvegardée.
