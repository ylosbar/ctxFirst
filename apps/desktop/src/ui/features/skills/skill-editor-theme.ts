import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

// CodeMirror theme wired to the shadcn token variables, so it follows the
// light/dark/custom variants already handled by the design system without any
// hard-coded colors.
const baseTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
    fontFamily: "var(--font-mono, 'Source Code Pro Variable', monospace)",
    fontSize: "17px",
    height: "100%",
  },
  // Scrollbar cosmetics aligned on the `os-theme-dark` look used elsewhere via
  // OverlayScrollbars. CodeMirror owns its own scroller, so (like xterm) we
  // style the native scrollbar through webkit pseudo-elements + Firefox props.
  ".cm-scroller": {
    overflow: "auto",
    lineHeight: "1.6",
    scrollbarWidth: "thin",
    scrollbarColor:
      "color-mix(in srgb, var(--foreground) 18%, transparent) transparent",
  },
  ".cm-scroller::-webkit-scrollbar": {
    width: "10px",
    height: "10px",
    background: "transparent",
  },
  ".cm-scroller::-webkit-scrollbar-track": { background: "transparent" },
  ".cm-scroller::-webkit-scrollbar-thumb": {
    backgroundColor: "color-mix(in srgb, var(--foreground) 18%, transparent)",
    border: "2px solid transparent",
    backgroundClip: "content-box",
    borderRadius: "999px",
    transition: "background-color 120ms ease",
  },
  ".cm-scroller:hover::-webkit-scrollbar-thumb": {
    backgroundColor: "color-mix(in srgb, var(--foreground) 32%, transparent)",
  },
  ".cm-scroller::-webkit-scrollbar-thumb:hover, .cm-scroller::-webkit-scrollbar-thumb:active":
    {
      backgroundColor: "color-mix(in srgb, var(--foreground) 48%, transparent)",
    },
  ".cm-scroller::-webkit-scrollbar-corner": { background: "transparent" },
  ".cm-content": { padding: "1rem 3rem", caretColor: "var(--foreground)" },
  // Active line — subtle tint on the line the caret sits on.
  ".cm-activeLine": {
    backgroundColor: "color-mix(in srgb, var(--foreground) 6%, transparent)",
  },
  // Line-number gutter — flat, no border, muted numbers that brighten on the
  // active line, all following the design-system tokens.
  ".cm-gutters": {
    backgroundColor: "var(--background)",
    color: "var(--muted-foreground)",
    border: "none",
    paddingLeft: "0.75rem",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 0.5rem 0 1rem" },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "var(--foreground)",
  },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
  // CodeMirror's drawSelection baseTheme paints the selection with a
  // high-specificity `&light.cm-focused > … .cm-selectionBackground` rule
  // (#d7d4f0). With theme="none" CM stays in its `light` default, so that rule
  // outranks a plain override and the selection shows up near-white in dark
  // mode. `!important` on the selection layer beats it whatever the specificity,
  // and the primary-based color stays correct in both light and dark.
  ".cm-selectionLayer .cm-selectionBackground, &.cm-focused .cm-selectionLayer .cm-selectionBackground":
    {
      background:
        "color-mix(in srgb, var(--primary) 30%, transparent) !important",
    },
  ".cm-content ::selection": {
    backgroundColor: "color-mix(in srgb, var(--primary) 30%, transparent)",
  },
  ".cm-placeholder": { color: "var(--muted-foreground)" },
  "&.cm-focused": { outline: "none" },
  ".cm-panels": {
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    border: "1px solid var(--border)",
  },
  ".cm-searchMatch": {
    backgroundColor: "color-mix(in srgb, var(--primary) 30%, transparent)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "color-mix(in srgb, var(--primary) 50%, transparent)",
  },
});

const markdownHighlight = HighlightStyle.define([
  { tag: t.heading1, fontWeight: "700", color: "var(--foreground)" },
  { tag: t.heading2, fontWeight: "600", color: "var(--foreground)" },
  { tag: t.heading3, fontWeight: "600", color: "var(--muted-foreground)" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.link, color: "var(--primary)", textDecoration: "underline" },
  { tag: t.url, color: "var(--primary)" },
  { tag: t.monospace, color: "var(--chart-2)" }, // inline `code`
  { tag: t.contentSeparator, color: "var(--muted-foreground)" }, // ---
  { tag: t.processingInstruction, color: "var(--muted-foreground)" }, // markers # - >
  { tag: t.meta, color: "var(--muted-foreground)" }, // frontmatter delimiters
  // Nested code fences (TS/JS/JSON/YAML) — keep it readable without a heavy palette.
  { tag: t.keyword, color: "var(--chart-3)" },
  { tag: [t.string, t.special(t.string)], color: "var(--chart-2)" },
  { tag: [t.number, t.bool, t.null], color: "var(--chart-4)" },
  { tag: t.comment, color: "var(--muted-foreground)", fontStyle: "italic" },
  { tag: [t.propertyName, t.attributeName], color: "var(--chart-1)" },
  { tag: [t.typeName, t.className], color: "var(--chart-5)" },
  { tag: t.function(t.variableName), color: "var(--chart-1)" },
]);

export const skillEditorTheme = [baseTheme, syntaxHighlighting(markdownHighlight)];
