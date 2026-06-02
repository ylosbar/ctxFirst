---
title: Create a plugin
description: Build, step by step, a plugin that turns a user input into tweets in three languages (FR/EN/ES).
sidebar:
  order: 2
---

This tutorial builds a complete plugin end to end. The goal: a **Tweet composer**
node that takes free text (a post idea) as input and produces **three tweets** —
one in French, one in English, one in Spanish — ready to be reviewed or published
downstream in the workflow.

We lean on what the engine already does: a plugin step runner, under the
`engine:steps` permission, receives the full `RunContext`, hence access to the
model via `ctx.deps.llm` — exactly like the native
[Claude Code Invoke](/en/nodes/claude-code-invoke/) node. If nodes, ports and the
`RunContext` aren't familiar yet, read the
[Plugin system](/en/plugins/overview/) page first.

The result fits in three files:

```
tweet-composer/
├── manifest.json
├── main.js          # the step runner: 1 input → 3 outputs
└── renderer.js      # a small help page (optional)
```

## 1. The manifest

The manifest declares the plugin's identity, the `engine:steps` permission (to
register a runner and call the model), and the contributed node.

```jsonc
// manifest.json
{
  "id": "tweet-composer",
  "name": "Tweet composer",
  "version": "0.1.0",
  "description": "Turns an idea into three tweets: FR, EN, ES.",
  "author": "You",
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

No `network` or `secrets` permission here: generation goes through the host's
LLM, not an external service. `engine:steps` is enough.

## 2. The step runner — `main.js`

This is the heart of the plugin. A runner exposes two methods:

- `resolveSpec()` — describes the **ports**: one text input, three Markdown
  outputs (`fr`, `en`, `es`). This is what lets the node be wired in the editor.
- `run(ctx)` — reads the input, asks the model for the three translations as
  JSON, then writes three Markdown artifacts.

```js
// main.js — CommonJS, no build step.
const PAYLOAD_FORMAT_JSON_V1 = "json-v1";

// Small helper: a Markdown artifact wraps its body in a typed payload.
const putMarkdown = (ctx, body, meta) =>
  ctx.deps.artifactStore.put(
    "Markdown",
    JSON.stringify({ format: "markdown", body: String(body) }),
    { ...meta, payloadFormat: PAYLOAD_FORMAT_JSON_V1, source: "tweet.compose" },
  );

const SYSTEM_PROMPT = [
  "You are a community manager. From the given idea, write ONE punchy tweet",
  "(≤ 280 characters, natural tone, 1-2 emojis max) in each of the three",
  "languages: French, English, Spanish.",
  "Reply ONLY with a JSON object, no surrounding text, of the form:",
  '{ "fr": "...", "en": "...", "es": "..." }',
].join(" ");

const tweetComposeRunner = {
  kind: "tweet.compose",

  resolveSpec() {
    return {
      title: "Tweet composer",
      description: "Turns an idea into three tweets: FR, EN, ES.",
      inputs: [{ name: "idea", kinds: ["Markdown"], primary: true }],
      outputs: [
        { name: "fr", kind: "Markdown", description: "French tweet", primary: true },
        { name: "en", kind: "Markdown", description: "English tweet" },
        { name: "es", kind: "Markdown", description: "Spanish tweet" },
      ],
    };
  },

  async run(ctx) {
    const input = ctx.inputs[0];
    if (!input) throw new Error("tweet.compose expects an 'idea' input");
    const idea =
      input.payload && typeof input.payload.body === "string"
        ? input.payload.body
        : input.content;

    // Call the model via the RunContext — unlocked by `engine:steps`.
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
        `tweet.compose: non-JSON model output:\n${res.output.slice(0, 200)}`,
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
  api.log.info("tweet.compose registered");
};

exports.onunload = (api) => {
  api.log.info("tweet-composer unloaded");
};
```

Key points:

- **Reading the input** — a Markdown artifact carries its text in
  `payload.body`; we fall back to `content` (the raw value) if the payload isn't
  parsed. This is the same pattern as the bundled `hello.echo` runner.
- **Calling the model** — `ctx.deps.llm.invokeStreaming` returns `{ output,
  provider, tokensIn, tokensOut, latencyMs, … }`. We force JSON output in the
  system prompt so it parses unambiguously. (You can also pass an `onEvent`
  callback to stream progress, like the native node does.)
- **Writing several outputs** — each output is a separate artifact, created via
  `artifactStore.put`, then bound to its **port** (`fr`/`en`/`es`) in the
  `produced-many` return. Port names must match those in `resolveSpec`.

## 3. A help page — `renderer.js` (optional)

The node already works without a renderer. But you can add a small page that
explains how to use it, staying within the renderer's constraints (no React
import — go through `ui.react.h`):

```js
// renderer.js — ESM, no JSX.
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
      "Wire a User Input node into the idea input of the Tweet composer node ",
      "to get three tweets (FR/EN/ES) on its outputs.",
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

## 4. Install and test

1. Drop the `tweet-composer/` folder under `<userData>/plugins/` (or, in
   development, into `apps/desktop/plugins-builtin/`) and restart the app.
2. In `Settings → Plugins`, the plugin shows as `pending`: accept the
   `engine:steps` permission. It turns `active`.
3. In a workflow, drop a **User Input** node and a **Tweet composer** node, and
   connect the first's output to the second's `idea` input.
4. Run it: type an idea ("we're launching the CtxFirst public beta"), and get
   three tweets on the `fr`, `en`, `es` outputs. Wire a
   [Human Gate](/en/nodes/human-gate/) downstream, for instance, to review before
   publishing.

## Going further

- **Make the languages configurable** — `resolveSpec({ config })` receives the
  node's config; read a list of languages from it and generate the output ports
  dynamically instead of hard-coding them.
- **Actually publish** — add the `network` permission (+ `networkHosts`) and a
  second step kind that posts via `ctx.deps`/`api.net.fetch` to a social
  network's API, storing the token with the `secrets` permission.
- **Type the output** — instead of three Markdown artifacts, contribute a
  `plugin:tweet-composer:TweetSet@v1` artifact type (via
  `contributions.artifactSchemas`) that bundles the three languages in a
  structured payload.

See also the [Plugin system](/en/plugins/overview/) page for the full API and
permission reference.
