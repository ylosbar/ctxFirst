---
title: Load Files
description: Le node Load Files — lit plusieurs fichiers sous un répertoire de base et expose chacun sur son propre port de sortie dynamique.
---

`files.load`

**Load Files** est la variante multi-fichiers de [Load File](/fr/nodes/file-load/). Il prend **un répertoire de base** (l'input `path` ou `config.path`, l'input l'emporte) et une liste de **slots** déclarés `{ port, subpath, outputKind }`. Chaque slot lit le fichier situé à `path.resolve(base, subpath)` et l'expose sur **son propre port de sortie nommé**. Le node produit tous les ports déclarés en un seul outcome.

Il réutilise tel quel le cœur lecture/validation/stockage de `file.load` : mêmes kinds text-envelope (`Markdown` | `Json`), même garde de chemin absolu sur la base, même validation JSON early-fail. Chaque `subpath` est aussi vérifié en containment — un slot ne peut pas s'évader hors du répertoire de base.

![Le node Load Files dans le studio de workflow (capture à ajouter)](../../../../assets/nodes/placeholder.png)

## Ports

| Sens | Port | Kind | Notes |
| --- | --- | --- | --- |
| Entrée | `path` | `Path`, `String`, `Markdown`, `*` | **Optionnel**, primaire. Le répertoire de base. Quand câblé, l'emporte sur `config.path` (lu comme `Path` → `path`, scalaire `String` → `value`, envelope texte → `body`, avec repli sur le contenu brut). |
| Sortie | *(par slot)* | `slot.outputKind` | **Dynamique.** Un port de sortie par entrée de `config.slots`, nommé d'après `slot.port`. Le premier slot est le port primaire. Aucun port de sortie n'apparaît tant que `slots` n'est pas valide. |

## Configuration

| Clé | Type | Défaut | Description |
| --- | --- | --- | --- |
| `path` | `string` | `""` | Répertoire de base absolu. Utilisé uniquement quand l'input `path` n'est pas câblé. |
| `slots` | `Array<{ port, subpath, outputKind }>` | `[{ port: "out", subpath: "", outputKind: "Markdown" }]` | **Obligatoire** — au moins un slot, validé à l'exécution (voir ci-dessous). |
| `slots[].port` | `string` | — | Nom du port de sortie. Doit respecter `^[a-zA-Z_][a-zA-Z0-9_-]*$` et être unique parmi les slots. |
| `slots[].subpath` | `string` | `""` | Chemin relatif sous la base ; **doit être non vide** et rester à l'intérieur de la base. |
| `slots[].outputKind` | `string` (`Markdown` \| `Json`) | `Markdown` | Kind de l'artifact produit pour ce slot. |

## Comportement à l'exécution

1. Le runner parse et valide `config.slots` — il échoue si le tableau est vide, si un slot n'est pas un objet, si un nom de port est vide / invalide / dupliqué, si un `subpath` est vide, ou si un `outputKind` n'est pas supporté.
2. Il résout le répertoire de base : input `path` si câblé, sinon `config.path` (erreur si aucun), et vérifie que la base est **absolue**.
3. Pour chaque slot il calcule `path.resolve(base, subpath)` et vérifie que le résultat reste dans la base (erreur si le subpath s'en évade).
4. Il lit chaque fichier, le valide (`Json` parsé pour échouer tôt), stocke un artifact (`{ format, body }`) par fichier, et le route vers le port du slot.
5. Il émet un unique outcome `produced-many` couvrant tous les ports déclarés.

## Exemple

Charger un prompt et un exemple de sortie attendue depuis le même répertoire :

- Câbler `path` (un `Path` issu de [Git Clone](/fr/nodes/git-clone/)) comme répertoire de base, ou renseigner `config.path`.
- `slots` : `[ { port: "prompt", subpath: "docs/prompt.md", outputKind: "Markdown" }, { port: "schema", subpath: "schema.json", outputKind: "Json" } ]`.
- Sortie `prompt` (`Markdown`) → un [Claude Code Invoke](/fr/nodes/claude-code-invoke/) ; sortie `schema` (`Json`) → un [Format Validate](/fr/nodes/format-validate/).

## Voir aussi

- [Vue d'ensemble des nodes](/fr/nodes/overview/)
- [Load File](/fr/nodes/file-load/) — la variante mono-fichier que ce node généralise.
- [Load Files (manifest)](/fr/nodes/files-load-manifest/) — lit des fichiers dont les noms sont calculés à l'exécution depuis un tableau JSONPath, concaténés en un seul Markdown.
- [Git Clone](/fr/nodes/git-clone/) — produit un `Path` câblable dans l'input `path`.
