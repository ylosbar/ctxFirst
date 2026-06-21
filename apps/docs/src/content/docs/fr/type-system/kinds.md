---
title: Kinds
description: Le catalogue des kinds d'artifact built-in, leurs formes de payload, le port wildcard, et la grammaire des kind-strings.
sidebar:
  order: 2
---

Un **kind** est le type d'un [artifact](/fr/type-system/artifacts/). Chaque port de sortie déclare un kind unique ; chaque port d'entrée déclare l'ensemble des kinds qu'il accepte. Le kind est une simple chaîne — elle transite par les événements, l'IPC et le store d'artifacts — et appartient à l'une des familles décrites ci-dessous.

## Kinds built-in

Un ensemble fermé de kinds est livré dans le binaire. Chacun a un schéma compilé ; son **payload** est la forme parsée qu'un runner produit et consomme. Ils se répartissent en trois régimes.

### Scalaires primitifs — `{ value: T }`

Les scalaires racines hors enveloppe.

| Kind | Exemple de payload | Notes |
| --- | --- | --- |
| `String` | `{ "value": "" }` | La racine de tout raffinement à forme textuelle. |
| `Number` | `{ "value": 0 }` | |
| `Boolean` | `{ "value": false }` | |

### Raffinements de `String` — `{ value: T }`, `extends: String`

Les raffinements restreignent `String` avec une validation supplémentaire. Un port qui accepte `String` accepte aussi n'importe lequel d'entre eux (covariance — voir [Compatibilité & câblage](/fr/type-system/compatibility/)) ; l'inverse n'est pas automatique.

| Kind | Exemple de payload | Raffine |
| --- | --- | --- |
| `Url` | `{ "value": "https://example.com" }` | une URL valide |
| `Email` | `{ "value": "user@example.com" }` | un email valide |
| `DateTime` | `{ "value": "2026-01-01T00:00:00Z" }` | une date-heure ISO |
| `LinearRef` | `{ "value": "ABC-123" }` | une référence d'issue Linear |

### Enveloppes & kinds structurés

Les enveloppes sont du texte opaque avec un `format` déclaré ; les autres sont des formes typées non textuelles.

| Kind | Exemple de payload | Notes |
| --- | --- | --- |
| `Markdown` | `{ "format": "markdown", "body": "# Hello\n" }` | Enveloppe texte. Le `body` est ce que les [variables de template](/fr/features/variables/) substituent. |
| `Json` | `{ "format": "json", "body": "{}" }` | Enveloppe texte contenant une chaîne JSON. |
| `Path` | `{ "path": "/tmp/foo.txt" }` | Un chemin de fichier unique. |
| `PathList` | `{ "format": "path-list", "paths": ["/tmp/foo.txt"] }` | Une liste de chemins. Alias canonique de `List<Path>`. |
| `MarkdownList` | `{ "format": "markdown-list", "bodies": ["# A", "# B"] }` | Une liste de bodies Markdown. Alias canonique de `List<Markdown>`. |
| `RunExport` | `{ "format": "json", "schemaVersion": 1, "body": "{}" }` | Le bundle autonome produit par [Export Run](/fr/nodes/export-run/). |

:::note[Alias de liste legacy]
`PathList` et `MarkdownList` précèdent la grammaire paramétrique `List<…>` et sont conservés comme **alias** de `List<Path>` et `List<Markdown>`. Un producteur de l'une ou l'autre orthographe correspond à un consommateur de l'autre — la compatibilité canonicalise les deux côtés avant de comparer.
:::

## Le port wildcard — `*`

`*` n'est pas un kind ; c'est un **matcher de port** qui accepte n'importe quel kind. Les nodes polymorphes l'utilisent sur leur entrée — [Render Markdown](/fr/nodes/render-markdown/) et [Transform](/fr/nodes/transform-run/) prennent tous deux `*` pour opérer sur n'importe quel artifact amont. Un node de templating à `{{variable}}` expose aussi un port `in` optionnel typé `*`, réservé au chaînage de control-flow (voir [Variables de template](/fr/features/variables/)).

Un port de **sortie** ne porte jamais `*` — il produit toujours un kind concret.

## La grammaire des kind-strings

Au-delà des built-in, une chaîne de kind peut encoder des types dynamiques et paramétriques. Le caractère `<` n'apparaît dans aucun autre encodage, donc la grammaire est non ambiguë.

| Forme | Exemple | Sens |
| --- | --- | --- |
| Built-in | `Markdown` | Un kind livré dans le binaire. |
| `user:<id>@<version>` | `user:Brief@v1` | Un [kind défini par l'utilisateur](/fr/type-system/custom-kinds/). |
| `plugin:<pluginId>:<id>@<version>` | `plugin:linear:Ticket@v1` | Un [kind contribué par un plugin](/fr/type-system/custom-kinds/). |
| `List<T>` | `List<Markdown>` | Une liste d'un kind interne. Imbrication permise (`List<List<Path>>`). |
| `OneOf<A,B,…>` | `OneOf<Url,Markdown>` | Un [sum type](/fr/type-system/sum-types/) de 2 à 6 variants. |
| `Success<T>` / `Error<E>` | `Success<Json>` | Wrappers de [résultat](/fr/type-system/sum-types/). |
| `record:<hash>` | `record:1a2b3c…` | Une référence adressée par contenu vers un descripteur, par son hash structurel. |

Les kinds paramétriques et dynamiques sont bornés pour garder la validation peu coûteuse : l'imbrication est plafonnée à **profondeur 4**, et un `OneOf<…>` contient **au plus 6** variants (sans doublons). Leurs descripteurs sont synthétisés à la demande par le registre à partir des descripteurs des kinds internes.

Les kinds composés se lisent de l'intérieur vers l'extérieur. Par exemple, le type résultat idiomatique se décode ainsi :

```text
OneOf< Success<Brief>, Error<String> >
  │       │      │        │     │
  │       │      │        │     └─ payload du variant : un String built-in
  │       │      │        └─ la moitié « erreur » d'un résultat
  │       │      └─ payload du variant : le kind user Brief
  │       └─ la moitié « succès » d'un résultat
  └─ une somme d'exactement ces deux variants
```

## Voir aussi

- [Artifacts](/fr/type-system/artifacts/) — les valeurs que ces kinds typent.
- [Compatibilité & câblage](/fr/type-system/compatibility/) — comment un port décide quels kinds il accepte.
- [Sum types & résultats](/fr/type-system/sum-types/) — `OneOf<…>`, `Success<T>` et `Error<E>` en détail.
- [Kinds personnalisés](/fr/type-system/custom-kinds/) — définir tes propres kinds `user:`.
