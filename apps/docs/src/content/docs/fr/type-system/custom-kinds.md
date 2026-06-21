---
title: Kinds personnalisés
description: Définir tes propres kinds d'artifact — le descripteur, les payloads en JSON Schema, le raffinement, la projection Markdown, le versioning et l'identité structurelle.
sidebar:
  order: 5
---

Au-delà des [kinds built-in](/fr/type-system/kinds/), le système de types est ouvert : tu peux enregistrer les tiens. Les **kinds user** sont déclarés depuis l'app (encodés `user:<id>@<version>`) ; les **kinds plugin** sont livrés dans le manifeste d'un plugin (`plugin:<pluginId>:<id>@<version>`). Les deux se résolvent via le même registre que les built-in, donc un kind personnalisé est un type de première classe — sélectionnable sur les ports, validé à l'écriture, et routable via la [compatibilité](/fr/type-system/compatibility/).

## Le descripteur

Chaque kind — built-in, user ou plugin — se résout en un **descripteur**. Les champs que tu contrôles en définissant un kind personnalisé :

| Champ | Rôle |
| --- | --- |
| `id` / `version` | Identité logique. Le couple `(id, version)` est **immuable** une fois publié. |
| `name` / `description` | Affichés dans le sélecteur de kind et les badges. |
| `simplifiedSchema` | Le **JSON Schema** du payload que les runners produisent et consomment. Compilé en validateur à la première utilisation. |
| `rawSchema` | JSON Schema optionnel d'un payload brut, avant parsing — utilisé par le bac à sable de parser. |
| `sample` | Exemple de payload concret optionnel, affiché en lecture seule dans le sélecteur. Omis ⇒ dérivé automatiquement du schéma. |
| `extends` | Super-type optionnel pour le [raffinement](#raffinement-avec-extends). |
| `markdownTemplate` | Gabarit `{{field}}` optionnel pour la [projection Markdown](#projection-markdown). |
| `coerceFrom` | Montée de version optionnelle à la lecture depuis une version antérieure — voir [Versioning](#versioning--compatibilité). |

Les schémas sont stockés en **JSON Schema** (portable, facile à générer depuis un échantillon) et compilés en validateur Zod à la première résolution du kind. Quand un node écrit un artifact d'un kind personnalisé, le store valide le payload contre ce schéma avant toute E/S — un payload non conforme est rejeté à la source.

Par exemple, un kind `user:Brief@v1` porte ce `simplifiedSchema` et un `sample` optionnel :

```json
// simplifiedSchema — JSON Schema du payload que les runners produisent
{
  "type": "object",
  "properties": {
    "title": { "type": "string" },
    "summary": { "type": "string" },
    "tags": { "type": "array", "items": { "type": "string" } }
  },
  "required": ["title", "summary"]
}
```

```json
// sample — un payload concret, affiché en lecture seule dans le sélecteur de kind
{ "title": "Auth rework", "summary": "Move sessions to JWT.", "tags": ["auth", "backend"] }
```

## Raffinement avec `extends`

Mets `extends` pour faire de ton kind un raffinement d'un autre. Un port acceptant le parent accepte alors aussi ton kind (covariance — chemin 5 de la [compatibilité](/fr/type-system/compatibility/#chemins-dacceptation)) ; l'inverse n'est pas automatique. C'est ainsi que `Url` raffine `String` parmi les built-in, et tu peux faire pareil avec tes propres kinds (ex. `user:TicketId@v1` qui étend `String`).

## Projection Markdown

Un kind peut déclarer comment il se rend en Markdown lisible, utilisé par [Render Markdown](/fr/nodes/render-markdown/) :

- Les **kinds built-in / plugin** peuvent porter une **fonction** de rendu pure (`{ kind: "fn" }`), résolue côté main et jamais sérialisée.
- Les **kinds user** déclarent un **gabarit** `{{field}}` (`{ kind: "template" }`) via `markdownTemplate` — chaque placeholder est rempli depuis le payload.

Pour le `user:Brief@v1` ci-dessus, un `markdownTemplate` de :

```markdown
# {{title}}

{{summary}}
```

rend le sample en `# Auth rework` suivi de `Move sessions to JWT.`

Sans projection, `render.markdown` retombe de façon déterministe : un champ `renderedMarkdown` embarqué, puis un `body` d'enveloppe texte, puis un bloc JSON formaté. Il ne lève jamais.

## Produire un kind personnalisé

Le chemin général est le node [Transform](/fr/nodes/transform-run/) : il applique un parser sauvegardé à un artifact amont et persiste le résultat sous un `outputKind` cible — y compris n'importe quel kind `user:` ou `plugin:`. Le store valide la sortie du parser contre le schéma du kind, donc un transform qui produit la mauvaise forme échoue avec une erreur de schéma plutôt que de produire un artifact malformé. Projette le résultat en Markdown avec [Render Markdown](/fr/nodes/render-markdown/) quand tu dois l'injecter dans un prompt.

## Versioning & compatibilité

Les enregistrements `(id, version)` sont immuables. Faire évoluer un kind, c'est **publier une nouvelle version** avec le même `id` :

- **Changement rétrocompatible** — incrémente la version ; les anciens artifacts restent valides.
- **Écrasement en place** au même `(id, version)` est protégé : si le nouveau schéma rejetait des payloads valides sous celui stocké, la sauvegarde est refusée sauf si tu autorises explicitement le changement cassant. Incrémenter la version est le chemin préféré.
- **`coerceFrom`** — sur une nouvelle version, déclare un patch à la lecture, en une étape et au même `id`, qui remet en forme les payloads d'une version antérieure avant validation (ex. renommer un champ). C'est une métadonnée côté lecture uniquement, jamais repliée dans l'identité du kind.

Par exemple, un `user:Brief@v2` qui a renommé `summary` en `abstract` lit les anciens payloads `v1` avec :

```json
{
  "fromVersion": "v1",
  "patch": [{ "op": "rename", "from": "summary", "at": "abstract" }]
}
```

Le vocabulaire de patch est minuscule et idempotent : `set`, `setIfMissing`, `unset`, `rename`.

## Identité : le hash structurel

Chaque descripteur porte un **hash structurel** — un SHA-256 de son schéma normalisé replié avec le hash de son parent de raffinement. Deux descripteurs qui hashent vers la même valeur sont traités comme le **même type** par la [compatibilité](/fr/type-system/compatibility/#chemins-dacceptation) (chemin 6), quels que soient leur nom, leur version ou leur source. Ainsi un kind `user:` et un kind `plugin:` de même forme sont interchangeables sur un port. Les kinds paramétriques composent leur hash depuis les hashs des kinds internes (avec les variants d'un `OneOf<…>` triés, donc l'ordre n'importe pas). Un kind peut aussi être référencé directement par son hash via l'encodage `record:<hash>`.

Comme le hash inclut la chaîne de raffinement, `Url` et `String` hashent différemment même si tous deux encapsulent `{ value: string }` — l'identité suit le sens, pas seulement la forme.

## Authoring depuis MCP

Les kinds personnalisés peuvent aussi être gérés par programme via le serveur d'authoring MCP de l'app, qui expose des outils pour `list`, `get` et `save` des kinds d'artifact (seuls les kinds `user:` sont éditables — les kinds built-in et plugin sont en lecture seule). Pratique pour scripter des définitions de kind ou les générer depuis un échantillon de payload.

## Voir aussi

- [Kinds](/fr/type-system/kinds/) — le catalogue built-in et la grammaire des kind-strings.
- [Compatibilité & câblage](/fr/type-system/compatibility/) — comment le raffinement (`extends`) et l'identité structurelle pilotent l'acceptation.
- [Transform](/fr/nodes/transform-run/) — produit un artifact d'un kind choisi via un parser sauvegardé.
- [Render Markdown](/fr/nodes/render-markdown/) — projette un artifact typé en Markdown via sa projection.
- [Plugins](/fr/plugins/overview/) — comment un plugin contribue des kinds via son manifeste.
