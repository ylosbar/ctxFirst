---
title: Webhook / appel HTTP
description: Le node Webhook / appel HTTP — appelle un endpoint REST et stocke la réponse JSON comme artifact typé.
---

`webhook.call`

**Webhook / appel HTTP** émet une unique requête HTTP vers un endpoint REST quelconque et stocke la réponse JSON comme artifact du kind que vous choisissez (`config.outputKind`, polymorphe). L'URL est résolue dynamiquement depuis le port d'entrée `url`, avec repli sur `config.url` — l'input l'emporte quand les deux sont présents (même motif que `file.load` pour le chemin).

Il s'exécute dans le process main d'Electron et utilise le `fetch` global : il contourne donc la CSP du renderer — aucune modification de CSP n'est requise pour de nouvelles origines.

![Le node Webhook / appel HTTP dans le studio de workflow (capture à ajouter)](../../../../assets/nodes/placeholder.png)

## Ports

| Sens | Port | Kind | Notes |
| --- | --- | --- | --- |
| Entrée | `url` | `Markdown`, `*` | **Optionnel**, primaire. Câblé, il prime sur `config.url`. L'URL est lue depuis le `body` d'une enveloppe texte, sinon depuis le contenu brut. |
| Entrée | `body` | `*` | **Optionnel**. Corps de requête, pris dans le `content` de l'input (repli sur `config.bodyTemplate`). Envoyé seulement pour les méthodes autres que `GET`/`HEAD`. |
| Sortie | `out` | `config.outputKind` | Primaire. La réponse JSON parsée, sérialisée dans le kind choisi. Aucun port de sortie n'apparaît tant que `outputKind` n'est pas défini. |

## Configuration

| Clé | Type | Défaut | Description |
| --- | --- | --- | --- |
| `outputKind` | `string` | — | Kind de l'artifact produit (le type de la réponse). **Obligatoire** — le runner échoue s'il manque. |
| `url` | `string` | — | URL cible. Utilisée seulement si l'input `url` n'est pas câblé. Une URL est requise depuis l'une des deux sources. |
| `method` | `string` | `GET` | Méthode HTTP (mise en majuscules). |
| `headers` | `Record<string, string>` | — | En-têtes additionnels (fusionnés sur `Accept: application/json`). |
| `bodyTemplate` | `string` | — | Corps de requête par défaut, utilisé si l'input `body` n'est pas câblé. |
| `failOnError` | `boolean` | `true` | À `true`, une réponse non-2xx échoue. À `false`, tout statut est accepté. |
| `allowedHosts` | `string[]` | — | Liste blanche d'hôtes optionnelle, vérifiée avant tout fetch — un hôte hors liste échoue. |

## Comportement à l'exécution

1. Le runner lit `config.outputKind` (erreur s'il manque).
2. Il résout l'URL : input `url` si câblé (`body` de l'enveloppe texte, sinon contenu brut), sinon `config.url` (erreur si aucun n'est défini).
3. Si `allowedHosts` est non vide, il vérifie l'hôte de l'URL contre la liste (erreur si non autorisé) **avant** tout accès réseau.
4. Il construit la requête (méthode, en-têtes, et un corps pour les méthodes autres que `GET`/`HEAD`, avec `Content-Type: application/json` par défaut) et la `fetch` une fois (pas de streaming).
5. Il lit le corps entier ; si `failOnError !== false` et la réponse est non-2xx, il échoue avec le statut et un extrait du corps.
6. Il `JSON.parse` le corps (erreur si JSON invalide) et le stocke via l'artifact store, qui **re-valide** le payload contre le schéma d'`outputKind` (un écart remonte comme step en échec, jamais comme artifact corrompu). Métadonnées : `url`, `method`, `statusCode`, `latencyMs`.

## Exemple

Récupérer un enregistrement depuis une API et l'envoyer en aval :

- `outputKind` : ex. `Json`, `url` : l'endpoint (ou câbler l'input `url` depuis un node amont).
- Pour un `POST`, mettre `method` : `POST` et câbler l'input `body` (ou définir `bodyTemplate`).
- Sortie `out` → entrée d'un [JSON Transform](/fr/nodes/json-transform/) ou d'un [Format Validate](/fr/nodes/format-validate/) pour vérifier la forme.

## Voir aussi

- [Vue d'ensemble des nodes](/fr/nodes/overview/)
- [Load File](/fr/nodes/file-load/) — même motif `outputKind` polymorphe + input qui prime sur la config, mais lit depuis le disque.
- [Format Validate](/fr/nodes/format-validate/) — valider la forme de la réponse avant de la consommer.
- [JSON Transform](/fr/nodes/json-transform/) — remodeler la réponse JSON.
