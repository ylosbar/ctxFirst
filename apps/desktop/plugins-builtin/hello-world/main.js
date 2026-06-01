// Reference plugin shipped with the app. Registers a single step kind,
// `hello.echo`, which takes one Markdown input and emits the same body in
// upper case. Used as the end-to-end test of the plugin loader infra
// (see PLUGINS.md §14, Phase 1 step 1).
//
// Plain CommonJS — no build step. The PluginApi the loader passes us is the
// only thing this module needs; we do not import from the wf module.

const PAYLOAD_FORMAT_JSON_V1 = "json-v1";

/**
 * @typedef {{
 *   pluginId: string,
 *   pluginDataDir: string,
 *   log: { info: Function, warn: Function, error: Function },
 *   registerStepRunner: (runner: unknown) => void,
 * }} PluginApi
 */

const helloEchoRunner = {
  kind: "hello.echo",

  resolveSpec() {
    return {
      title: "Hello: echo",
      description: "Returns its Markdown input in upper case.",
      inputs: [{ name: "in", kinds: ["Markdown"], primary: true }],
      outputs: [{ name: "out", kind: "Markdown", primary: true }],
    };
  },

  async run(ctx) {
    const input = ctx.inputs[0];
    if (!input) throw new Error("hello.echo requires one Markdown input");
    const body =
      input.payload && typeof input.payload.body === "string"
        ? input.payload.body
        : input.content;
    const payload = { format: "markdown", body: String(body).toUpperCase() };
    const artifact = await ctx.deps.artifactStore.put(
      "Markdown",
      JSON.stringify(payload),
      { payloadFormat: PAYLOAD_FORMAT_JSON_V1, source: "hello.echo" },
    );
    return { kind: "produced", artifact };
  },
};

/** @param {PluginApi} api */
exports.onload = (api) => {
  api.registerStepRunner(helloEchoRunner);
  // Smoke test for the plugin:invoke dispatcher. Reachable from the renderer
  // via `window.api.plugins.invoke("hello-world", "echo", { text: "..." })`.
  api.registerIpcHandler("echo", (args) => {
    const text =
      args && typeof args === "object" && typeof args.text === "string"
        ? args.text
        : "";
    return { echoed: text.toUpperCase(), pluginDataDir: api.pluginDataDir };
  });
  api.log.info("hello.echo runner + 'echo' IPC method registered");
};

/** @param {PluginApi} api */
exports.onunload = (api) => {
  api.log.info("unloading");
};
