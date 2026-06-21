---
title: Load Files (manifest)
description: Le node Load Files (manifest) — lit les fichiers nommés dans un tableau JSONPath et émet leur concaténation wrappée en un seul Markdown.
---

`files.load-manifest`

**Load Files (manifest)** lit N fichiers dont les noms sont calculés **à l'exécution** depuis l'input `source` : un document JSON sur lequel un `selector` JSONPath sélectionne un tableau de noms de fichiers (chaînes). Chaque nom est résolu sous le répertoire de base (input `path`) plus un `subdir` optionnel, lu, encadré d'un header/footer par fichier, et les résultats sont concaténés en un seul artifact `Markdown` sur `out`.

Un selector sans match produit un Markdown vide (mais valide) — jamais une erreur. Le node **produit toujours** `out` (pas de port mort), donc il se câble proprement dans un [Loop Foreach](/fr/nodes/loop-foreach/) ou un [Concat Markdown](/fr/nodes/concat-markdown/) en aval. Chaque nom résolu est vérifié en containment contre la base (pas d'évasion). Déterministe — sans LLM.

![Le node Load Files (manifest) dans le studio de workflow (capture à ajouter)](../../../../assets/nodes/placeholder.png)

## Ports

| Sens | Port | Kind | Notes |
| --- | --- | --- | --- |
| Entrée | `source` | `*` | **Obligatoire**, primaire. Document JSON parsé à l'exécution (une code fence en tête est tolérée) et interrogé par `selector` pour obtenir les noms de fichiers. |
| Entrée | `path` | `Path`, `String`, `Markdown`, `*` | **Optionnel**. Le répertoire de base (`Path` → `path`, scalaire `String` → `value`, envelope texte → `body`, repli sur le contenu brut). **Obligatoire à l'exécution** — le runner échoue si aucune base n'est fournie. |
| Sortie | `out` | `Markdown` | Port primaire. La concaténation wrappée de tous les fichiers lus (chaîne vide si rien ne matche). |

## Configuration

| Clé | Type | Défaut | Description |
| --- | --- | --- | --- |
| `selector` | `string` | `"$.files[*]"` | JSONPath évalué sur `source` ; doit renvoyer un tableau de chaînes (un match non-chaîne fait échouer le step). 0 match est valide. |
| `subdir` | `string` | `""` | Sous-répertoire relatif sous la base, préfixé à chaque nom de fichier. |
| `outputKind` | `string` (`Markdown` \| `Json`) | `Json` | Kind utilisé pour valider chaque fichier lu (`Json` est parsé pour échouer tôt). La sortie concaténée est toujours `Markdown`. |
| `wrap.header` | `string` | `'<file name="{name}">'` | Inséré avant le body de chaque fichier. `{name}` est substitué par le nom du fichier. |
| `wrap.footer` | `string` | `"</file>"` | Inséré après le body de chaque fichier. `{name}` est substitué par le nom du fichier. |
| `separator` | `string` | `"\n\n"` | Joint les segments wrappés. |
| `dedupe` | `boolean` | `true` | Si vrai, les noms en double sont lus une seule fois. |
| `onMissing` | `"fail"` \| `"skip"` | `"fail"` | `skip` tolère un seul fichier illisible ; tout autre échec (p. ex. JSON malformé) reste une erreur dure. |
| `maxFiles` | `number` | — | Si renseigné (> 0), le step échoue quand le selector matche plus de noms que cette valeur. |

## Comportement à l'exécution

1. Le runner lit `selector`, `subdir`, `outputKind`, `wrap`, `separator`, `dedupe`, `onMissing` et `maxFiles` depuis la config (défauts ci-dessus).
2. Il parse `source` en JSON (fence retirée) et évalue `selector` en un tableau de noms de fichiers — un match non-chaîne échoue.
3. Il déduplique les noms (sauf `dedupe: false`) et échoue si `maxFiles` est dépassé.
4. Il résout la base depuis l'input `path` (erreur si absent) et vérifie qu'elle est **absolue**.
5. Pour chaque nom il calcule `path.resolve(base, subdir, name)`, vérifie qu'il reste dans la base, lit le fichier (`onMissing: "skip"` tolère un échec de lecture), ignore les bodies vides, valide + stocke un artifact par fichier (métadonnées `byteLength`, `path`), et ajoute `wrap.header + body + wrap.footer` (avec `{name}` substitué).
6. Il joint les segments par `separator`, stocke le résultat en `Markdown` sur `out` (métadonnées `source`, `selector`, `count`), et émet `produced`.

## Exemple

Lire tous les fichiers listés par un agent en amont dans un seul document :

- `source` (`Json`) ← p. ex. `{ "files": ["a.md", "b.md"] }` issu d'un [Claude Code Invoke](/fr/nodes/claude-code-invoke/).
- `path` ← un `Path` issu de [Git Clone](/fr/nodes/git-clone/) ; `subdir` : `"docs"`.
- Garder le `wrap` par défaut pour taguer chaque fichier en `<file name="a.md">…</file>`.
- Sortie `out` (`Markdown`) → entrée d'un [Concat Markdown](/fr/nodes/concat-markdown/) en aval.

## Voir aussi

- [Vue d'ensemble des nodes](/fr/nodes/overview/)
- [Load File](/fr/nodes/file-load/) — lit un seul fichier à un chemin absolu.
- [Load Files](/fr/nodes/files-load/) — lit des fichiers depuis des slots déclarés statiquement (un port chacun), pas depuis un manifeste runtime.
- [Select Markdown](/fr/nodes/select-markdown/) — comme le selector de ce node, mais extrait exactement un match au lieu d'un tableau.
