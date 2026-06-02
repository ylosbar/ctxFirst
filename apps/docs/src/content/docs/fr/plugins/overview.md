---
title: Système de plugins
description: Architecture du système de plugins de CtxFirst — les deux moitiés, le manifest, les permissions et l'intégration au moteur.
sidebar:
  order: 1
---

CtxFirst est extensible via des **plugins**. Un plugin peut ajouter de nouveaux
**nodes** (step kinds) aux workflows, publier ses propres **types d'artifacts**,
et contribuer des **pages** à l'interface. Les types destinés aux auteurs sont
publiés dans le package `@ctxfirst/plugin-sdk` (`packages/plugin-sdk/`) — un
package **de types uniquement** : à l'exécution, c'est l'hôte qui injecte les
objets d'API, le plugin ne fait que les consommer.

Pour construire un plugin de bout en bout, voir [Créer mon plugin](/fr/plugins/create-a-plugin/).

## Anatomie d'un plugin

Un plugin est un dossier identifié par son `id`, contenant jusqu'à trois fichiers :

```
<plugin-id>/
├── manifest.json   # obligatoire — validé par l'hôte contre PluginManifest
├── main.js         # optionnel — CommonJS, tourne dans le process main d'Electron
└── renderer.js     # optionnel — ESM, tourne dans le renderer, aux côtés de l'UI
```

Seul le `manifest.json` est obligatoire. Un plugin qui ne fait qu'ajouter des
types d'artifacts et des parsers n'a besoin ni de `main.js` ni de `renderer.js`.

Les plugins livrés avec l'app vivent dans `apps/desktop/plugins-builtin/` ;
les plugins installés par l'utilisateur sous `<userData>/plugins/<plugin-id>/`.

## Les deux moitiés

Comme l'app elle-même, un plugin est découpé selon la frontière de sécurité
d'Electron — voir l'[architecture du desktop](/fr/architecture/overview/). Chaque
moitié a son point d'entrée et son rôle :

```
┌─────────────────────────────┐         ┌─────────────────────────────┐
│  renderer.js  (renderer)    │         │   main.js  (process main)   │
│                             │         │                             │
│  onload(ui)                 │  IPC    │  onload(api)                │
│   • ui.addPage(...)         │ ──────► │   • api.registerStepRunner  │
│   • ui.registerSettingsTab  │ invoke  │   • api.registerIpcHandler  │
│   • ui.invoke("method")     │ ◄────── │   • api.fs / net / secrets  │
│   • ui.react.h(...)         │ résultat│   • api.engine / log        │
└─────────────────────────────┘         └─────────────────────────────┘
        UI, sans accès Node            accès natif, exécute les nodes
```

- **La moitié main** (`main.js`, CommonJS) tourne dans le process Node.js
  privilégié d'Electron. C'est là qu'on enregistre les **step runners** (la
  logique des nodes), les **handlers IPC**, et qu'on accède au système de
  fichiers, au réseau ou aux secrets — toujours filtré par les permissions
  accordées. Point d'entrée : `onload(api)` / `onunload(api)`.
- **La moitié renderer** (`renderer.js`, ESM) tourne dans le renderer, aux côtés
  de l'UI React. Elle contribue des **pages** et des **onglets de réglages**, et
  appelle la moitié main via `ui.invoke(...)`. Point d'entrée : `onload(ui)` /
  `onunload(ui)`. Elle n'a **aucun accès Node** et n'importe pas React
  directement : on passe par `ui.react.h` (le `createElement` de l'hôte) et par
  les `ui.primitives` (composants partagés au thème de l'app).

Le routage IPC est automatique : `ui.invoke("method", args)` arrive sur le
`api.registerIpcHandler("method", …)` du **même** plugin. Le `pluginId` est lié à
la construction de l'API — un plugin ne peut pas en usurper un autre.

## Manifest et contributions

Le `manifest.json` décrit l'identité du plugin, ses permissions et ce qu'il
apporte à l'app :

```jsonc
{
  "id": "com.acme.tweets",      // slug stable ^[a-z0-9][a-z0-9.-]*$
  "name": "Tweet composer",
  "version": "0.1.0",           // bump → re-demande l'autorisation à l'utilisateur
  "main": "main.js",
  "renderer": "renderer.js",
  "permissions": ["engine:steps"],
  "contributions": {
    "stepKinds": [
      { "id": "tweet.compose", "label": "Tweets multilingues" }
    ],
    "artifactSchemas": [ /* nouveaux kinds d'artifacts (voir plus bas) */ ]
  }
}
```

Les contributions possibles :

| Contribution      | Effet                                                             |
| ----------------- | ----------------------------------------------------------------- |
| `stepKinds`       | de nouveaux **nodes** disponibles dans l'éditeur de workflow      |
| `artifactSchemas` | de nouveaux **types d'artifacts** `plugin:<id>:<Id>@<version>`    |
| `routes`          | réservé                                                           |
| `navItems`        | réservé                                                           |
| `parsers`         | parsers d'artifacts contribués                                    |

Un **type d'artifact** se déclare avec un `id`, une `version` et un
`simplifiedSchema` (JSON Schema décrivant le payload). Il devient référençable
sous le kind complet `plugin:<plugin-id>:<id>@<version>` — par exemple le plugin
Linear livré publie `plugin:linear:Ticket@v1`.

## Permissions

Les permissions sont déclarées dans le manifest. À la première installation,
l'hôte présente la liste à l'utilisateur, qui **accepte ou refuse**. Elles sont
révocables à tout moment depuis `Réglages → Plugins`, et la révocation est
**immédiate** : le prochain appel verrouillé (`api.fs`, `api.net`…) lève une
erreur. Un plugin doit traiter la perte d'une permission défensivement.

| Permission        | Ce qu'elle débloque                                                 |
| ----------------- | ------------------------------------------------------------------- |
| `engine:steps`    | `api.registerStepRunner` — vos runners s'exécutent avec le `RunContext` complet du moteur |
| `engine:read`     | `api.engine.*` — lecture des instances, timelines, templates, skills |
| `fs:read`         | `api.fs.readFile/readdir/stat` dans `pluginDataDir`                  |
| `fs:write`        | `api.fs.writeFile/mkdir/remove` dans `pluginDataDir`                 |
| `secrets`         | `api.secrets.get/set/delete`, chiffrés et isolés par plugin         |
| `network`         | `api.net.fetch` vers les hôtes déclarés dans `networkHosts`         |
| `notifications`   | `api.notifications.notify`                                           |
| `engine:llm`, `protocol`, `http-server`, `db:read`, `db:write` | acceptés par le manifest mais **non encore implémentés** (réservés) |

:::note
`networkHosts` est **obligatoire** dès que `network` est demandé (hostname seul,
sans schéma ni port, pas de wildcard).
:::

## Cycle de vie

1. Au démarrage, l'hôte scanne les dossiers de plugins et valide chaque manifest.
2. Pour un plugin utilisateur, il vérifie l'autorisation (les builtins sont
   auto-approuvés) ; un plugin non encore autorisé apparaît en `pending` dans
   `Réglages → Plugins`.
3. Une fois actif, l'hôte construit une `PluginApi` filtrée par les permissions
   accordées, puis appelle `onload(api)` (main) et `onload(ui)` (renderer).
   C'est là que le plugin enregistre ses runners, handlers et pages.
4. Les contributions (types d'artifacts, parsers) sont poussées dans les
   registres du moteur et deviennent disponibles pour **tous** les steps.
5. À la désactivation ou au déchargement, `onunload` est appelé pour le nettoyage.

## Comment un node de plugin s'exécute

Un `stepKind` contribué se matérialise par un **step runner** enregistré via
`api.registerStepRunner(runner)`. L'orchestrateur du moteur ne sait pas exécuter
un node lui-même : il résout le runner par son `kind` dans le registre, puis :

- appelle `runner.resolveSpec(ctx)` pour connaître les **ports** du node (entrées
  acceptées, sorties produites) — ce qui détermine comment il se câble aux autres
  nodes dans l'éditeur ;
- appelle `runner.run(ctx)` pour l'exécuter.

Le `ctx` passé à `run` est un `RunContext` : il porte les **inputs** déjà
résolus depuis les sorties des nodes amont (`ctx.inputs[]`, chacun avec son
`kind`, son `content` brut et son `payload` parsé), et un objet `ctx.deps`
injecté par le moteur. Sous `engine:steps`, le runner reçoit le **même
`RunContext` privilégié** que les nodes natifs — notamment :

- `ctx.deps.artifactStore.put(kind, content, meta)` — pour produire des artifacts ;
- `ctx.deps.llm.invokeStreaming(...)` — pour appeler le modèle (comme le node natif Claude Code Invoke) ;
- `ctx.deps.linear`, `ctx.deps.shell`, `ctx.deps.clock`, `ctx.deps.ids`, etc.

Le runner termine en retournant une issue : `{ kind: "produced", artifact }` pour
une sortie unique, `{ kind: "produced-many", artifacts: [{ port, artifact }] }`
pour plusieurs sorties, ou `{ kind: "produced-pending-human", … }` pour passer
la main à une validation humaine.

C'est ce contrat — runner + `RunContext` injecté — qui rend un node de plugin
indistinguable d'un node natif aux yeux du moteur. La [page tutoriel](/fr/plugins/create-a-plugin/)
en construit un complet.

## Plugins livrés avec l'app

Trois plugins de référence dans `apps/desktop/plugins-builtin/`, du plus simple
au plus complet :

- **hello-world** — minimal : un step kind `hello.echo` qui met son entrée
  Markdown en majuscules, et une page renderer qui teste l'aller-retour IPC.
- **kanban** — UI-only : un tableau Kanban persisté dans `pluginDataDir`
  (permissions `fs:read`/`fs:write`), sans aucun step kind.
- **linear** — complet : trois step kinds (`linear.fetch`, `linear.split`,
  `linear.set-status`) et un type d'artifact `plugin:linear:Ticket@v1`.

## Distribution

Il n'y a pas encore de marketplace. Pour distribuer un plugin :

1. Zippez le dossier du plugin (`manifest.json`, `main.js`, `renderer.js`, tout
   `schemas/`…).
2. L'utilisateur le décompresse sous `<userData>/plugins/<plugin-id>/` et
   redémarre l'app.
3. Au boot, le plugin apparaît en `pending` dans `Réglages → Plugins` ;
   l'utilisateur accepte les permissions demandées et le plugin s'active.
