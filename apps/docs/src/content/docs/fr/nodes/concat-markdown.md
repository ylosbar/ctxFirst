---
title: Concat Markdown
description: Le node Concat Markdown — concatène un Markdown principal avec jusqu'à trois fragments optionnels en un seul artifact Markdown.
---

`concat.markdown`

**Concat Markdown** assemble un Markdown principal (`main`) avec jusqu'à 3 fragments additionnels optionnels (`markdown1` / `markdown2` / `markdown3`, Markdown ou JSON) pour produire un unique artifact `Markdown` sur le port `out`. Sa responsabilité unique est la **concaténation** — la substitution de placeholders (`{{name}}`) vit dans le node dédié [Markdown Template](/fr/nodes/markdown-template/).

![Le node Concat Markdown dans le studio de workflow (capture à ajouter)](../../../../assets/nodes/placeholder.png)

## Ports

| Sens | Port | Kind | Notes |
| --- | --- | --- | --- |
| Entrée | `main` | `Markdown`, `Json` | **Port primaire.** Le premier fragment. |
| Entrée | `markdown1` | `Markdown`, `Json` | **Optionnel.** Fragment additionnel. |
| Entrée | `markdown2` | `Markdown`, `Json` | **Optionnel.** Fragment additionnel. |
| Entrée | `markdown3` | `Markdown`, `Json` | **Optionnel.** Fragment additionnel. |
| Sortie | `out` | `Markdown` | Port primaire : le Markdown assemblé. |

Pour les ports recevant du `Json`, c'est le champ `body` du payload qui est utilisé (repli sur le contenu brut sinon) — pratique pour insérer un exemple JSON dans un prompt. Un port câblé dont le body est **vide** est entièrement ignoré (ni fragment, ni header/footer) — ainsi un amont conditionnellement vide (ex. un [Select (Markdown)](/fr/nodes/select-markdown/) au flag faux) ne laisse aucune balise vide derrière lui.

## Configuration

| Clé | Type | Défaut | Description |
| --- | --- | --- | --- |
| `separator` | `string` | `"\n\n"` | Séparateur inséré entre les segments. |
| `header` | `string` | `""` | Texte global ajouté en tête de la sortie (si non vide). |
| `footer` | `string` | `""` | Texte global ajouté en pied de la sortie (si non vide). |
| `order` | `"top-to-bottom"` \| `"bottom-to-top"` | `"top-to-bottom"` | Ordre de concaténation des fragments. |
| `entries.<port>.header` | `string` | `""` | En-tête inséré avant le fragment du port (`main`, `markdown1`…). |
| `entries.<port>.footer` | `string` | `""` | Pied inséré après le fragment du port. |

## Comportement à l'exécution

1. Le runner lit `separator`, `header`, `footer` et `order`.
2. Pour chaque port câblé, dans l'ordre déclaré (`main`, `markdown1`, `markdown2`, `markdown3`), il extrait le body, en ignorant tout port non câblé ou au body vide.
3. Chaque fragment conservé est enrobé de son `entries.<port>.header` / `footer` éventuel (joints par `separator`).
4. Si `order` vaut `bottom-to-top`, l'ordre des fragments est inversé.
5. Les fragments sont joints par `separator`, encadrés par le `header` / `footer` global, et stockés en `Markdown` sur `out` (métadonnées `source: "concat.markdown"`, `partCount`).

## Exemple

Concaténer une consigne et un exemple :

- `main` (`Markdown`) ← une consigne.
- `markdown1` (`Json`) ← un exemple de payload attendu.
- `entries.markdown1.header` : `` "## Exemple\n" `` pour titrer le fragment inséré.
- Sortie `out` → entrée d'un node [Claude Code Invoke](/fr/nodes/claude-code-invoke/).

## Voir aussi

- [Vue d'ensemble des nodes](/fr/nodes/overview/)
- [Markdown Template](/fr/nodes/markdown-template/) — substitue des `{{variables}}` dans un gabarit inline (le foyer de l'ancien mode `template`).
- [Select (Markdown)](/fr/nodes/select-markdown/) — produit conditionnellement un fragment à brancher sur l'une des entrées ci-dessus.
