---
title: Créer mon plugin
description: Construire pas à pas un plugin qui transforme une entrée utilisateur en tweets dans trois langues (FR/EN/ES).
sidebar:
  order: 2
---

Ce tutoriel construit un plugin complet de bout en bout. L'objectif : un node
**Tweet composer** qui prend un texte libre (l'idée d'un post) en entrée et
produit **trois tweets** — un en français, un en anglais, un en espagnol — prêts
à être validés ou publiés en aval du workflow.

On s'appuie sur ce que le moteur sait déjà faire : un step runner de plugin,
sous la permission `engine:steps`, reçoit le `RunContext` complet, donc l'accès
au modèle via `ctx.deps.llm` — exactement comme le node natif
[Claude Code Invoke](/fr/nodes/claude-code-invoke/). Si les notions de node, de
ports et de `RunContext` ne sont pas claires, lisez d'abord le
[Système de plugins](/fr/plugins/overview/).

Le résultat tient en trois fichiers :

```
tweet-composer/
├── manifest.json
├── main.js          # le step runner : 1 entrée → 3 sorties
└── renderer.js      # une petite page d'aide (optionnelle)
```

## 1. Le manifest

Le manifest déclare l'identité du plugin, la permission `engine:steps` (pour
enregistrer un runner et appeler le modèle), et le node contribué.

```jsonc
// manifest.json
{
  "id": "tweet-composer",
  "name": "Tweet composer",
  "version": "0.1.0",
  "description": "Transforme une idée en trois tweets : FR, EN, ES.",
  "author": "Vous",
  "main": "main.js",
  "renderer": "renderer.js",
  "permissions": ["engine:steps"],
  "contributions": {
    "stepKinds": [
      { "id": "tweet.compose", "label": "Tweet composer (FR/EN/ES)" }
    ]
  }
}
```

Aucune permission `network` ni `secrets` ici : la génération passe par le LLM de
l'hôte, pas par un service externe. `engine:steps` suffit.

## 2. Le step runner — `main.js`

C'est le cœur du plugin. Un runner expose deux méthodes :

- `resolveSpec()` — décrit les **ports** : une entrée texte, trois sorties
  Markdown (`fr`, `en`, `es`). C'est ce qui permet de câbler le node dans
  l'éditeur.
- `run(ctx)` — lit l'entrée, demande au modèle les trois traductions sous forme
  de JSON, puis écrit trois artifacts Markdown.

```js
// main.js — CommonJS, pas de build step.
const PAYLOAD_FORMAT_JSON_V1 = "json-v1";

// Petit helper : un artifact Markdown enveloppe son corps dans un payload typé.
const putMarkdown = (ctx, body, meta) =>
  ctx.deps.artifactStore.put(
    "Markdown",
    JSON.stringify({ format: "markdown", body: String(body) }),
    { ...meta, payloadFormat: PAYLOAD_FORMAT_JSON_V1, source: "tweet.compose" },
  );

const SYSTEM_PROMPT = [
  "Tu es un community manager. À partir de l'idée fournie, rédige UN tweet",
  "percutant (≤ 280 caractères, ton naturel, 1-2 emojis max) dans chacune des",
  "trois langues : français, anglais, espagnol.",
  "Réponds UNIQUEMENT par un objet JSON, sans texte autour, de la forme :",
  '{ "fr": "...", "en": "...", "es": "..." }',
].join(" ");

const tweetComposeRunner = {
  kind: "tweet.compose",

  resolveSpec() {
    return {
      title: "Tweet composer",
      description: "Transforme une idée en trois tweets : FR, EN, ES.",
      inputs: [{ name: "idea", kinds: ["Markdown"], primary: true }],
      outputs: [
        { name: "fr", kind: "Markdown", description: "Tweet en français", primary: true },
        { name: "en", kind: "Markdown", description: "Tweet en anglais" },
        { name: "es", kind: "Markdown", description: "Tweet en espagnol" },
      ],
    };
  },

  async run(ctx) {
    const input = ctx.inputs[0];
    if (!input) throw new Error("tweet.compose attend une entrée 'idea'");
    const idea =
      input.payload && typeof input.payload.body === "string"
        ? input.payload.body
        : input.content;

    // Appel du modèle via le RunContext — débloqué par `engine:steps`.
    const res = await ctx.deps.llm.invokeStreaming({
      model: "claude-opus-4-7",
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: idea,
      maxTokens: 1024,
    });

    let tweets;
    try {
      tweets = JSON.parse(res.output);
    } catch {
      throw new Error(
        `tweet.compose : sortie du modèle non-JSON :\n${res.output.slice(0, 200)}`,
      );
    }

    const meta = { provider: res.provider, model: "claude-opus-4-7" };
    const [fr, en, es] = await Promise.all([
      putMarkdown(ctx, tweets.fr, { ...meta, lang: "fr" }),
      putMarkdown(ctx, tweets.en, { ...meta, lang: "en" }),
      putMarkdown(ctx, tweets.es, { ...meta, lang: "es" }),
    ]);

    return {
      kind: "produced-many",
      artifacts: [
        { port: "fr", artifact: fr },
        { port: "en", artifact: en },
        { port: "es", artifact: es },
      ],
    };
  },
};

exports.onload = (api) => {
  api.registerStepRunner(tweetComposeRunner);
  api.log.info("tweet.compose enregistré");
};

exports.onunload = (api) => {
  api.log.info("tweet-composer déchargé");
};
```

Points clés :

- **Lire l'entrée** — un artifact Markdown porte son texte dans
  `payload.body` ; on retombe sur `content` (le brut) si le payload n'est pas
  parsé. C'est le même motif que le runner `hello.echo` livré.
- **Appeler le modèle** — `ctx.deps.llm.invokeStreaming` renvoie `{ output,
  provider, tokensIn, tokensOut, latencyMs, … }`. On force une sortie JSON dans
  le system prompt pour la parser sans ambiguïté. (On peut aussi passer un
  callback `onEvent` pour streamer la progression, comme le fait le node natif.)
- **Écrire plusieurs sorties** — chaque sortie est un artifact distinct, rendu
  via `artifactStore.put`, puis associé à son **port** (`fr`/`en`/`es`) dans le
  retour `produced-many`. Les noms de ports doivent correspondre à ceux de
  `resolveSpec`.

## 3. Une page d'aide — `renderer.js` (optionnel)

Le node fonctionne déjà sans renderer. Mais on peut ajouter une petite page qui
explique l'usage, en restant dans les contraintes du renderer (pas d'import
React, on passe par `ui.react.h`) :

```js
// renderer.js — ESM, pas de JSX.
const HelpPage = (ui) => {
  const { h, icons } = ui.react;
  return h(
    "div",
    { className: "flex h-full flex-col gap-3 p-4 text-sm" },
    h(
      "div",
      { className: "flex items-center gap-2 font-medium" },
      h(icons.Twitter ?? icons.MessageCircle, { className: "size-4" }),
      "Tweet composer",
    ),
    h(
      "p",
      { className: "text-xs text-muted-foreground" },
      "Branchez un node « User Input » sur l'entrée idea du node Tweet composer ",
      "pour obtenir trois tweets (FR/EN/ES) sur ses sorties.",
    ),
  );
};

export const onload = (ui) => {
  ui.addPage({
    id: "tweet-help",
    title: "Tweet composer",
    icon: ui.react.icons.Twitter ?? ui.react.icons.MessageCircle,
    sidebar: HelpPage(ui),
  });
};

export const onunload = () => {};
```

## 4. Installer et tester

1. Placez le dossier `tweet-composer/` sous `<userData>/plugins/` (ou, en
   développement, dans `apps/desktop/plugins-builtin/`) et redémarrez l'app.
2. Dans `Réglages → Plugins`, le plugin apparaît en `pending` : acceptez la
   permission `engine:steps`. Il passe en `active`.
3. Dans un workflow, posez un node **User Input** et un node **Tweet composer**,
   reliez la sortie du premier à l'entrée `idea` du second.
4. Lancez : saisissez une idée (« on lance la beta publique de CtxFirst »), et
   récupérez trois tweets sur les sorties `fr`, `en`, `es`. Branchez par exemple
   un [Human Gate](/fr/nodes/human-gate/) en aval pour relire avant publication.

## Pour aller plus loin

- **Rendre les langues configurables** — `resolveSpec({ config })` reçoit la
  config du node ; lisez-y une liste de langues et générez les ports de sortie
  dynamiquement plutôt qu'en dur.
- **Publier réellement** — ajoutez la permission `network` (+ `networkHosts`) et
  un second step kind qui poste via `ctx.deps`/`api.net.fetch` vers l'API d'un
  réseau social, en stockant le jeton avec la permission `secrets`.
- **Typer la sortie** — au lieu de trois Markdown, contribuez un type d'artifact
  `plugin:tweet-composer:TweetSet@v1` (via `contributions.artifactSchemas`) qui
  regroupe les trois langues dans un payload structuré.

Voir aussi le [Système de plugins](/fr/plugins/overview/) pour la référence
complète de l'API et des permissions.
