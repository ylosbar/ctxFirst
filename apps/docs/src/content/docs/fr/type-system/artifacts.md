---
title: Artifacts
description: Ce qu'est un artifact — la charge typée qui circule entre les étapes d'un workflow, sa forme, et comment son contenu est stocké puis chargé.
sidebar:
  order: 1
---

Un **artifact** est la charge typée qui circule entre les étapes d'un workflow. Chaque valeur qu'un [node](/fr/nodes/overview/) consomme ou produit est un artifact : une graine saisie par l'utilisateur, un fragment Markdown, une projection JSON, une liste de chemins de fichiers, un objet métier parsé par un transform. Chaque artifact porte un **kind** — son type — et le moteur vérifie la compatibilité des kinds chaque fois que tu câbles deux ports.

Cette section décrit ce système de types :

- **Artifacts** _(cette page)_ — le modèle de données et comment le contenu est stocké puis chargé.
- **[Kinds](/fr/type-system/kinds/)** — le catalogue des kinds built-in et la grammaire des kind-strings.
- **[Compatibilité & câblage](/fr/type-system/compatibility/)** — quand un port de sortie peut se connecter à un port d'entrée.
- **[Sum types & résultats](/fr/type-system/sum-types/)** — `OneOf<…>`, `Success<T>` / `Error<E>` et `branch.match`.
- **[Kinds personnalisés](/fr/type-system/custom-kinds/)** — les types définis par l'utilisateur ou par un plugin.

## La forme d'un artifact

Le domaine ne manipule que les **métadonnées** d'un artifact — le contenu est stocké hors-bande et chargé à la demande. Les métadonnées d'un artifact sont :

| Champ | Sens |
| --- | --- |
| `id` | Identifiant unique de l'artifact. |
| `kind` | Le [kind](/fr/type-system/kinds/) — le type de l'artifact (ex. `Markdown`, `Json`, `user:Brief@v1`). |
| `hash` | SHA-256 du contenu. Un contenu identique produit le même hash, ce qui permet la déduplication du stockage. |
| `storageRef` | Référence opaque que le store utilise pour localiser les octets (ex. un chemin de fichier). |
| `metadata` | Une map de chaînes en lecture seule (`source`, `srcKind`, `missing`, …) attachée par le node producteur. |
| `createdAt` | Horodatage de création au format ISO 8601. |

Le **contenu n'est pas embarqué** dans cet enregistrement. Il vit dans le store d'artifacts, indexé par `storageRef` ; le moteur ne le charge que lorsqu'une étape en a réellement besoin. Les métadonnées concrètes d'un artifact `Markdown` ressemblent à :

```json
{
  "id": "art_7f3a9c",
  "kind": "Markdown",
  "hash": "sha256:9c1f0b…",
  "storageRef": "artifacts/9c/1f/9c1f0b.md",
  "metadata": { "source": "markdown.template", "missing": "rules" },
  "createdAt": "2026-06-18T09:24:00Z"
}
```

## Contenu vs payload

Quand une étape lit une entrée, le moteur charge l'artifact et fournit au runner à la fois le texte brut et le **payload parsé** :

- **content** — la chaîne brute stockée (le body Markdown, le texte JSON, …).
- **payload** — le contenu parsé et validé contre le schéma du kind. Un payload `Markdown` est `{ format: "markdown", body: "…" }` ; un payload `String` est `{ value: "…" }`. Voir [Kinds](/fr/type-system/kinds/) pour toutes les formes.

Pour ce même artifact `Markdown`, le runner voit les deux :

```jsonc
// content — la chaîne brute stockée
"# Review\nCheck the spec against the rules."

// payload — parsé & validé contre le schéma Markdown
{ "format": "markdown", "body": "# Review\nCheck the spec against the rules." }
```

Si le contenu ne peut pas être parsé contre le kind (payload malformé, kind inconnu), le runner tourne en **mode dégradé** : le payload vaut `null` et seul le contenu brut est disponible. Les nodes tolérants comme [Render Markdown](/fr/nodes/render-markdown/) retombent sur un rendu best-effort plutôt que d'échouer.

## Comment un artifact circule

1. Un node s'exécute et **produit** un artifact sur l'un de ses ports de sortie — le moteur écrit le contenu dans le store (en le validant contre le `kind` déclaré au moment de l'écriture) et enregistre les métadonnées ci-dessus.
2. Une **transition** (une arête sur le canvas) ou une **variable de workflow** transporte cet artifact vers un port d'entrée en aval. Voir [Câblage & variables](/fr/template-editor/wiring-variables/).
3. Avant même que le câble soit autorisé, l'éditeur et le moteur vérifient tous deux que le port du consommateur **accepte** le kind du producteur — voir [Compatibilité & câblage](/fr/type-system/compatibility/).
4. Le node en aval **charge** l'artifact (content + payload) et s'exécute.

Comme l'artifact est adressé par contenu via son `hash`, reproduire les mêmes octets est dédupliqué, et chaque artifact qu'un run touche reste inspectable dans l'historique du run.

## Voir aussi

- [Kinds](/fr/type-system/kinds/) — le catalogue des kinds built-in et leurs formes de payload.
- [Compatibilité & câblage](/fr/type-system/compatibility/) — les règles qui décident si deux ports peuvent se connecter.
- [Vue d'ensemble des nodes](/fr/nodes/overview/) — les briques qui consomment et produisent des artifacts.
- [Câblage & variables](/fr/template-editor/wiring-variables/) — transitions et variables de workflow qui transportent les artifacts entre nodes.
