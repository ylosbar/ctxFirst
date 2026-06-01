// Renderer half of the reference plugin — exercises the full plugin://
// pipeline end-to-end: dynamic ESM import via the custom protocol, page
// registration through `UiPluginApi.addPage`, and a round-trip to the main
// process via `ui.invoke("echo", ...)`.
//
// Plain ESM, no bundler, no JSX — we use `ui.react.h(...)` (the host's
// `React.createElement`) so plugin authors don't need to bring their own
// React copy until the `@ctxfirst/plugin-sdk` ships in Phase 3.

const HelloPage = (ui) => {
  const { h, icons } = ui.react;
  const Sparkles = icons.Sparkles;

  // Tiny component so we can hold local state for the echo round-trip.
  // Declared with `useState` accessed via `ui.react`-less means: we keep it
  // simple and rely on the host React copy by reading it from the API. Since
  // the API only exposes `h` + icons, we model "send and wait" with a plain
  // promise and re-render via a refresher callback held in module scope.
  // The example doesn't need useState — the button is fire-and-forget.

  const onEchoClick = async () => {
    try {
      const res = await ui.invoke("echo", { text: "hello from the renderer" });
      ui.log.info("echo →", res);
      window.alert(
        `Echo response from main process:\n\n${JSON.stringify(res, null, 2)}`,
      );
    } catch (err) {
      ui.log.error("echo failed:", err);
      window.alert(`Echo failed: ${err && err.message ? err.message : err}`);
    }
  };

  return h(
    "div",
    { className: "flex h-full min-w-0 flex-col gap-3 p-4" },
    h(
      "div",
      { className: "flex items-center gap-2 text-sm font-medium" },
      h(Sparkles, { className: "size-4" }),
      "Hello, World",
    ),
    h(
      "p",
      { className: "text-xs text-muted-foreground" },
      "Smoke test for the renderer plugin loader. The button below calls back into the plugin's main-side ",
      h("code", { className: "font-mono" }, "echo"),
      " IPC method and shows the response.",
    ),
    h(
      "button",
      {
        type: "button",
        onClick: onEchoClick,
        className:
          "self-start rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-accent",
      },
      "Invoke echo()",
    ),
  );
};

export const onload = (ui) => {
  ui.addPage({
    id: "hello",
    title: "Hello plugin",
    icon: ui.react.icons.Sparkles,
    order: 950,
    sidebar: HelloPage(ui),
  });
  ui.log.info("renderer onload registered Hello page");
};

export const onunload = (ui) => {
  ui.log.info("renderer onunload");
};
