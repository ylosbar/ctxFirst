import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  type Edge,
  type Node,
  type ReactFlowInstance,
  Position,
  getBezierPath,
  getSmoothStepPath,
} from "@xyflow/react";
import { resolveNodeSpec } from "@shared/wf/resolve-node-spec";
import type {
  ArtifactKind,
  NodeSpecView,
  PortKindMatcher,
  TemplateStepDraft,
  TemplateVariableDraft,
} from "../../../domain/workflow/types";
import {
  getKindMeta,
  iconForKind,
} from "../../components/templates/step-kinds";

type ByKind = ReadonlyMap<string, NodeSpecView>;

// Layout constants — mirror the values used by StepNode.tsx so the SVG export
// reproduces the on-screen geometry exactly. Anything tweaked here must be
// kept in sync there (or vice versa) or the SVG will drift visually.
const PADDING = 40;
const FONT_FAMILY =
  "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";
const MONO_FAMILY =
  "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";
const HEADER_HEIGHT = 38;
const PORT_ROW_HEIGHT = 16;
const HANDLE_SIZE = 8;
const CARD_RADIUS = 6;
// Note section — mirrors StepNode's `<div className="border-t border-dashed
// ... bg-amber-50/60 px-2 py-1 text-[10px] leading-tight text-amber-900">`.
// Values are picked to match its visual density (10px font, ~13px line box,
// 8px horizontal / 4px vertical padding). The amber pair stays light-theme
// regardless of the user's app theme — the note block is a "sticky note", and
// keeping it bright on every export reads consistently.
const NOTE_FONT_SIZE = 10;
const NOTE_LINE_HEIGHT = 13;
const NOTE_PADDING_X = 8;
const NOTE_PADDING_Y = 4;
const NOTE_BG = "#fef3c7";
const NOTE_FG = "#78350f";
const NOTE_CHAR_WIDTH = 5.5;
const WILDCARD_COLOR = "hsl(0 0% 75%)";
// Partial — entries here drive the SVG export's port colors for the kinds
// that ship with the app. Anything else (plugin/user kinds) falls through to
// `WILDCARD_COLOR` in the lookup below.
const ARTIFACT_PALETTE: Partial<Record<ArtifactKind, string>> = {
  LinearRef: "hsl(20 80% 55%)",
  "plugin:linear:Ticket@v1": "hsl(0 70% 55%)",
  Markdown: "hsl(0 0% 50%)",
  Path: "hsl(195 60% 45%)",
  PathList: "hsl(195 60% 30%)",
  MarkdownList: "hsl(0 0% 35%)",
};

const portColorSvg = (kinds: ReadonlyArray<PortKindMatcher>): string => {
  if (kinds.length === 0 || kinds.includes("*")) return WILDCARD_COLOR;
  // SVG inline fills can't express the CSS linear-gradient the UI uses for
  // multi-kind ports — fall back to the first concrete kind so a polymorphic
  // handle still gets a stable, readable color.
  return ARTIFACT_PALETTE[kinds[0] as ArtifactKind] ?? WILDCARD_COLOR;
};

type Theme = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  border: string;
  primary: string;
  primaryForeground: string;
  muted: string;
  mutedForeground: string;
  secondary: string;
  secondaryForeground: string;
};

const FALLBACK_THEME: Theme = {
  background: "#ffffff",
  foreground: "#0f172a",
  card: "#ffffff",
  cardForeground: "#0f172a",
  border: "#e5e7eb",
  primary: "#6366f1",
  primaryForeground: "#ffffff",
  muted: "#f1f5f9",
  mutedForeground: "#64748b",
  secondary: "#f1f5f9",
  secondaryForeground: "#0f172a",
};

const readTheme = (): Theme => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return FALLBACK_THEME;
  }
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fb: string) =>
    cs.getPropertyValue(name).trim() || fb;
  return {
    background: v("--background", FALLBACK_THEME.background),
    foreground: v("--foreground", FALLBACK_THEME.foreground),
    card: v("--card", FALLBACK_THEME.card),
    cardForeground: v("--card-foreground", FALLBACK_THEME.cardForeground),
    border: v("--border", FALLBACK_THEME.border),
    primary: v("--primary", FALLBACK_THEME.primary),
    primaryForeground: v(
      "--primary-foreground",
      FALLBACK_THEME.primaryForeground,
    ),
    muted: v("--muted", FALLBACK_THEME.muted),
    mutedForeground: v("--muted-foreground", FALLBACK_THEME.mutedForeground),
    secondary: v("--secondary", FALLBACK_THEME.secondary),
    secondaryForeground: v(
      "--secondary-foreground",
      FALLBACK_THEME.secondaryForeground,
    ),
  };
};

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

// Soft wrap a note's text into lines that fit `maxChars`. Preserves explicit
// `\n` paragraph breaks; long words are not split (they overflow), matching
// `whitespace-pre-wrap` semantics.
const wrapNoteText = (text: string, maxChars: number): string[] => {
  const lines: string[] = [];
  for (const para of text.split(/\n/)) {
    if (para.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of para.split(/\s+/)) {
      if (word.length === 0) continue;
      const next = current.length === 0 ? word : `${current} ${word}`;
      if (next.length <= maxChars || current.length === 0) {
        current = next;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current.length > 0) lines.push(current);
  }
  return lines;
};

const noteSectionHeight = (note: string, cardWidth: number): number => {
  const maxChars = Math.max(
    8,
    Math.floor((cardWidth - NOTE_PADDING_X * 2) / NOTE_CHAR_WIDTH),
  );
  const lines = wrapNoteText(note, maxChars);
  return NOTE_PADDING_Y * 2 + lines.length * NOTE_LINE_HEIGHT;
};

// Build the path for a rect whose top corners are square (it abuts the body
// of the card above it) and whose bottom corners are rounded to match the
// card's own `rx`. This lets the amber note "fit" the bottom of the card
// without overflowing its rounded corners.
const buildNoteBgPath = (
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): string => {
  const r = Math.min(radius, w / 2, h);
  return [
    `M ${x} ${y}`,
    `L ${x + w} ${y}`,
    `L ${x + w} ${y + h - r}`,
    `Q ${x + w} ${y + h} ${x + w - r} ${y + h}`,
    `L ${x + r} ${y + h}`,
    `Q ${x} ${y + h} ${x} ${y + h - r}`,
    "Z",
  ].join(" ");
};

const renderNoteSection = (
  cardX: number,
  cardWidth: number,
  noteY: number,
  noteHeight: number,
  note: string,
  theme: Theme,
): string => {
  const maxChars = Math.max(
    8,
    Math.floor((cardWidth - NOTE_PADDING_X * 2) / NOTE_CHAR_WIDTH),
  );
  const lines = wrapNoteText(note, maxChars);
  const bg = buildNoteBgPath(cardX, noteY, cardWidth, noteHeight, CARD_RADIUS);
  const separator = `<line x1="${cardX}" y1="${noteY}" x2="${cardX + cardWidth}" y2="${noteY}" stroke="${theme.border}" stroke-width="1" stroke-dasharray="3 2" opacity="0.7"/>`;
  const texts = lines
    .map((line, idx) => {
      const ty =
        noteY +
        NOTE_PADDING_Y +
        idx * NOTE_LINE_HEIGHT +
        NOTE_FONT_SIZE -
        1;
      return `<text x="${cardX + NOTE_PADDING_X}" y="${ty}" font-family="${FONT_FAMILY}" font-size="${NOTE_FONT_SIZE}" fill="${NOTE_FG}">${escapeXml(line)}</text>`;
    })
    .join("");
  return `<path d="${bg}" fill="${NOTE_BG}"/>${separator}${texts}`;
};

type Rect = { x: number; y: number; width: number; height: number };
type HandlePoint = { x: number; y: number; position: Position };

// Synthetic node types (start, variable pills) are recreated on every render
// of the editor. Their object reference changes each time, so xyflow's
// `adoptUserNodes` rebuilds their internal entry and resets `measured` and
// `handleBounds` to undefined until the next ResizeObserver tick. If the user
// hits "export" inside that window — which is the steady state for these
// nodes — the export would drop them. Fall back to the known DOM size for
// each type so they always make it into the SVG.
const SYNTHETIC_DEFAULT_DIMS: Record<string, { width: number; height: number }> = {
  start: { width: 40, height: 40 },
  variable: { width: 110, height: 22 },
};

const nodeDims = (
  internal: ReturnType<ReactFlowInstance["getInternalNode"]> | undefined,
  node: Node,
): { width: number; height: number } | null => {
  const w =
    internal?.measured?.width ??
    node.measured?.width ??
    (typeof node.width === "number" ? node.width : undefined);
  const h =
    internal?.measured?.height ??
    node.measured?.height ??
    (typeof node.height === "number" ? node.height : undefined);
  if (w !== undefined && h !== undefined) return { width: w, height: h };
  const fb = node.type ? SYNTHETIC_DEFAULT_DIMS[node.type] : undefined;
  if (!fb) return null;
  return { width: w ?? fb.width, height: h ?? fb.height };
};

const positionAbsolute = (
  instance: ReactFlowInstance,
  node: Node,
): Rect | null => {
  const internal = instance.getInternalNode(node.id);
  const pos = internal?.internals.positionAbsolute ?? node.position;
  if (!pos) return null;
  const dims = nodeDims(internal, node);
  if (!dims) return null;
  return { x: pos.x, y: pos.y, width: dims.width, height: dims.height };
};

// Look up a handle's center in absolute flow coordinates. xyflow stores
// handle positions relative to the node — we add the node's absolute position
// to land in the same coord space we use to lay out the SVG. Falls back to
// the middle of the appropriate side when the node has no registered handle
// (e.g. the synthetic start node renders a 0×0 invisible handle, or its
// handleBounds have been reset by a re-adoption — see SYNTHETIC_DEFAULT_DIMS).
const handlePoint = (
  instance: ReactFlowInstance,
  node: Node,
  type: "source" | "target",
  handleId: string | null,
): HandlePoint | null => {
  const internal = instance.getInternalNode(node.id);
  const abs = internal?.internals.positionAbsolute ?? node.position;
  if (!abs) return null;
  const bounds = internal?.internals.handleBounds;
  const list = type === "source" ? bounds?.source : bounds?.target;
  if (list && list.length > 0) {
    const handle = handleId
      ? (list.find((h) => h.id === handleId) ?? list[0])
      : list[0];
    return {
      x: abs.x + handle.x + handle.width / 2,
      y: abs.y + handle.y + handle.height / 2,
      position: handle.position,
    };
  }
  const dims = nodeDims(internal, node);
  const width = dims?.width ?? 0;
  const height = dims?.height ?? 0;
  return {
    x: abs.x + (type === "source" ? width : 0),
    y: abs.y + height / 2,
    position: type === "source" ? Position.Right : Position.Left,
  };
};

// Render a Lucide icon component to SVG markup. Lucide already emits
// width/height matching `size`, so we leave its outer <svg> alone — adding
// our own width/height would emit a duplicate attribute and crash the XML
// parser. We just pass `color` so the inner shapes (which use
// `stroke="currentColor"`) inherit the requested colour.
const renderLucideIcon = (
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>,
  size: number,
  color: string,
): string =>
  renderToStaticMarkup(
    createElement(Icon, { size, color, strokeWidth: 2 }),
  );

const stepData = (node: Node): TemplateStepDraft & { isEntry?: boolean } => {
  return (node.data ?? {}) as TemplateStepDraft & { isEntry?: boolean };
};

const renderBadge = (
  x: number,
  y: number,
  label: string,
  fill: string,
  color: string,
  borderColor?: string,
): string => {
  const padX = 4;
  const charWidth = 5.2;
  const width = Math.max(14, label.length * charWidth + padX * 2);
  const height = 11;
  const stroke = borderColor
    ? ` stroke="${borderColor}" stroke-width="1"`
    : "";
  return `<g>
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="3" ry="3" fill="${fill}"${stroke}/>
    <text x="${x + width / 2}" y="${y + height / 2 + 3}" font-family="${FONT_FAMILY}" font-size="8" font-weight="600" fill="${color}" text-anchor="middle">${escapeXml(label)}</text>
  </g>`;
};

const renderStepNode = (
  instance: ReactFlowInstance,
  node: Node,
  rect: Rect,
  byKind: ByKind | null,
  variables: ReadonlyArray<TemplateVariableDraft>,
  theme: Theme,
): string => {
  const step = stepData(node);
  // `rect.height` has already been extended (in renderWorkflowSvg) to include
  // the note section when present, so we treat it as the full card height and
  // carve the note out of its bottom.
  const noteText =
    typeof step.note === "string" && step.note.length > 0 ? step.note : null;
  const noteH = noteText ? noteSectionHeight(noteText, rect.width) : 0;
  const noteY = rect.y + rect.height - noteH;
  const meta = getKindMeta(step.kind);
  const IconCmp = iconForKind(step.kind);
  const spec =
    byKind && byKind.has(step.kind)
      ? resolveNodeSpec(step.kind, step.config ?? {}, byKind.get(step.kind)!, {
          variables,
        })
      : null;

  const headerY = rect.y;
  const headerHeight = HEADER_HEIGHT;
  const bodyY = headerY + headerHeight;

  const iconBoxSize = 24;
  const iconBoxX = rect.x + 8;
  const iconBoxY = headerY + (headerHeight - iconBoxSize) / 2;
  const iconSize = 12;
  const iconSvg = renderLucideIcon(
    IconCmp as unknown as React.ComponentType<{
      size?: number;
      color?: string;
      strokeWidth?: number;
    }>,
    iconSize,
    theme.mutedForeground,
  );

  const titleX = iconBoxX + iconBoxSize + 6;
  const titleY = headerY + 14;
  const kindLabelY = headerY + 26;
  const titleMaxWidth = rect.x + rect.width - titleX - 8;
  const trimToWidth = (text: string, maxWidth: number, fontSize: number) => {
    const approxCharWidth = fontSize * 0.55;
    const maxChars = Math.max(4, Math.floor(maxWidth / approxCharWidth));
    if (text.length <= maxChars) return text;
    return `${text.slice(0, maxChars - 1)}…`;
  };
  const trimmedName = trimToWidth(
    step.name || "(sans nom)",
    titleMaxWidth - 40,
    11,
  );
  const kindLabel = meta?.label ?? step.kind;
  const trimmedKind = trimToWidth(kindLabel, titleMaxWidth, 10);

  const badges: string[] = [];
  let badgeX = rect.x + rect.width - 8;
  if (step.humanGateRequired) {
    const width = "gate".length * 5.2 + 8;
    badgeX -= width;
    badges.push(
      renderBadge(
        badgeX,
        headerY + 6,
        "gate",
        theme.secondary,
        theme.secondaryForeground,
      ),
    );
    badgeX -= 3;
  }
  if (step.isEntry) {
    const width = "entry".length * 5.2 + 8;
    badgeX -= width;
    badges.push(
      renderBadge(
        badgeX,
        headerY + 6,
        "entry",
        theme.primary,
        theme.primaryForeground,
      ),
    );
  }

  // Body — render input/output rows using the actual handle positions from
  // handleBounds so labels line up exactly with where xyflow drew the dots.
  const inputs = spec?.inputs ?? [];
  const outputs = spec?.outputs ?? [];
  const hasPassthroughHandle =
    outputs.length === 0 && Boolean(spec?.passthrough);

  const internal = instance.getInternalNode(node.id);
  const targets = internal?.internals.handleBounds?.target ?? [];
  const sources = internal?.internals.handleBounds?.source ?? [];

  const portRows: string[] = [];

  const drawInputRow = (
    name: string,
    kinds: ReadonlyArray<PortKindMatcher>,
    portIdx: number,
    optional: boolean,
    isList: boolean,
    primary: boolean,
    readsFromVar: string | undefined,
  ) => {
    const handle = targets.find((h) => (h.id ?? null) === (name || null));
    const y = handle
      ? rect.y + handle.y + handle.height / 2
      : bodyY + 4 + portIdx * PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2;
    const cx = rect.x;
    const labelX = rect.x + 10;
    const labelMaxWidth = rect.width / 2 - 14;
    let label = name + (optional ? "?" : "") + (isList ? "[…]" : "");
    label = trimToWidth(label, labelMaxWidth, 10);
    const dot = `<rect x="${cx - HANDLE_SIZE / 2}" y="${y - HANDLE_SIZE / 2}" width="${HANDLE_SIZE}" height="${HANDLE_SIZE}" rx="${HANDLE_SIZE / 2}" ry="${HANDLE_SIZE / 2}" fill="${portColorSvg(kinds)}" stroke="${theme.background}" stroke-width="${isList ? 1.5 : 1}"${isList ? ' stroke-dasharray="2 1"' : ""}/>`;
    const labelText = `<text x="${labelX}" y="${y + 3.5}" font-family="${FONT_FAMILY}" font-size="10" fill="${theme.foreground}"${primary ? ' font-weight="600"' : ""}>${escapeXml(label)}</text>`;
    let varText = "";
    if (readsFromVar) {
      const vt = trimToWidth(`$${readsFromVar}`, labelMaxWidth, 9);
      varText = `<text x="${labelX + label.length * 5.5 + 4}" y="${y + 3.5}" font-family="${MONO_FAMILY}" font-size="9" fill="${theme.mutedForeground}" opacity="0.7">${escapeXml(vt)}</text>`;
    }
    portRows.push(`<g>${dot}${labelText}${varText}</g>`);
  };

  const drawOutputRow = (
    name: string,
    kind: string,
    portIdx: number,
    primary: boolean,
    writesToVar: string | undefined,
  ) => {
    const handle = sources.find((h) => (h.id ?? null) === (name || null));
    const y = handle
      ? rect.y + handle.y + handle.height / 2
      : bodyY + 4 + portIdx * PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2;
    const cx = rect.x + rect.width;
    const labelX = rect.x + rect.width - 10;
    const labelMaxWidth = rect.width / 2 - 14;
    const label = trimToWidth(name, labelMaxWidth, 10);
    const dot = `<rect x="${cx - HANDLE_SIZE / 2}" y="${y - HANDLE_SIZE / 2}" width="${HANDLE_SIZE}" height="${HANDLE_SIZE}" rx="${HANDLE_SIZE / 2}" ry="${HANDLE_SIZE / 2}" fill="${portColorSvg([kind])}" stroke="${theme.background}" stroke-width="1"/>`;
    const labelText = `<text x="${labelX}" y="${y + 3.5}" font-family="${FONT_FAMILY}" font-size="10" fill="${theme.foreground}" text-anchor="end"${primary ? ' font-weight="600"' : ""}>${escapeXml(label)}</text>`;
    let varText = "";
    if (writesToVar) {
      const vt = trimToWidth(`$${writesToVar}`, labelMaxWidth, 9);
      varText = `<text x="${labelX - label.length * 5.5 - 4}" y="${y + 3.5}" font-family="${MONO_FAMILY}" font-size="9" fill="${theme.mutedForeground}" opacity="0.7" text-anchor="end">${escapeXml(vt)}</text>`;
    }
    portRows.push(`<g>${dot}${varText}${labelText}</g>`);
  };

  if (spec) {
    if (inputs.length === 0) {
      drawInputRow("", ["*"], 0, false, false, false, undefined);
      // Italic "passthrough" placeholder text — drawn separately because the
      // input row helper expects a real port name.
      const y = bodyY + 4 + PORT_ROW_HEIGHT / 2;
      portRows.push(
        `<text x="${rect.x + 10}" y="${y + 3.5}" font-family="${FONT_FAMILY}" font-size="9" font-style="italic" fill="${theme.mutedForeground}" opacity="0.6">passthrough</text>`,
      );
    } else {
      inputs.forEach((port, idx) => {
        drawInputRow(
          port.name,
          port.kinds,
          idx,
          Boolean(port.optional),
          Boolean(port.isList),
          Boolean(port.primary),
          step.readsFrom?.[port.name],
        );
      });
    }
    if (hasPassthroughHandle) {
      drawOutputRow("", "*", 0, false, undefined);
      const y = bodyY + 4 + PORT_ROW_HEIGHT / 2;
      portRows.push(
        `<text x="${rect.x + rect.width - 10}" y="${y + 3.5}" font-family="${FONT_FAMILY}" font-size="9" font-style="italic" fill="${theme.mutedForeground}" opacity="0.6" text-anchor="end">passthrough</text>`,
      );
    } else {
      outputs.forEach((port, idx) => {
        drawOutputRow(
          port.name,
          port.kind,
          idx,
          Boolean(port.primary),
          step.writesTo?.[port.name],
        );
      });
    }
  } else {
    // Spec catalog wasn't loaded — fall back to a minimal port-less card so
    // the export never throws on partial state. Edges still draw from node
    // sides via the handle-bounds fallback.
  }

  const dropShadow = `<filter id="step-shadow" x="-10%" y="-10%" width="120%" height="120%">
    <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="${theme.foreground}" flood-opacity="0.08"/>
  </filter>`;

  const noteSvg = noteText
    ? renderNoteSection(rect.x, rect.width, noteY, noteH, noteText, theme)
    : "";

  return `<g>
    ${dropShadow}
    <rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="${CARD_RADIUS}" ry="${CARD_RADIUS}" fill="${theme.card}" stroke="${theme.border}" stroke-width="1" filter="url(#step-shadow)"/>
    <line x1="${rect.x}" y1="${bodyY}" x2="${rect.x + rect.width}" y2="${bodyY}" stroke="${theme.border}" stroke-width="1" opacity="0.5"/>
    <rect x="${iconBoxX}" y="${iconBoxY}" width="${iconBoxSize}" height="${iconBoxSize}" rx="5" ry="5" fill="${theme.muted}" fill-opacity="0.6" stroke="${theme.border}" stroke-width="1" stroke-opacity="0.5"/>
    <g transform="translate(${iconBoxX + (iconBoxSize - iconSize) / 2}, ${iconBoxY + (iconBoxSize - iconSize) / 2})">${iconSvg}</g>
    <text x="${titleX}" y="${titleY}" font-family="${FONT_FAMILY}" font-size="11" font-weight="500" fill="${theme.foreground}">${escapeXml(trimmedName)}</text>
    <text x="${titleX}" y="${kindLabelY}" font-family="${FONT_FAMILY}" font-size="10" fill="${theme.mutedForeground}" opacity="0.8">${escapeXml(trimmedKind)}</text>
    ${badges.join("\n    ")}
    ${portRows.join("\n    ")}
    ${noteSvg}
  </g>`;
};

const renderStartNode = (rect: Rect, theme: Theme): string => {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const r = Math.min(rect.width, rect.height) / 2 - 1;
  return `<g>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${theme.primary}" fill-opacity="0.1" stroke="${theme.primary}" stroke-width="2"/>
    <text x="${cx}" y="${cy + 3.5}" font-family="${FONT_FAMILY}" font-size="10" font-weight="600" fill="${theme.primary}" text-anchor="middle" letter-spacing="0.5">START</text>
  </g>`;
};

const renderVariableNode = (rect: Rect, node: Node, theme: Theme): string => {
  const data = (node.data ?? {}) as {
    variableName?: string;
    kind?: string;
    mode?: "produced" | "consumed";
  };
  const name = data.variableName ?? "var";
  const kinds: ReadonlyArray<PortKindMatcher> = data.kind ? [data.kind] : ["*"];
  const swatch = portColorSvg(kinds);
  const r = rect.height / 2;
  const cx = rect.x + 10;
  const cy = rect.y + rect.height / 2;
  return `<g>
    <rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="${r}" ry="${r}" fill="${theme.muted}" fill-opacity="0.4" stroke="${theme.border}" stroke-width="1" stroke-dasharray="3 2"/>
    <circle cx="${cx}" cy="${cy}" r="3" fill="${swatch}"/>
    <text x="${cx + 6}" y="${cy + 3.5}" font-family="${MONO_FAMILY}" font-size="10" fill="${theme.foreground}" opacity="0.8">$${escapeXml(name)}</text>
  </g>`;
};

const renderGroupNode = (rect: Rect, node: Node, theme: Theme): string => {
  const data = (node.data ?? {}) as { label?: string };
  const label = data.label ?? "";
  return `<g>
    <rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="8" ry="8" fill="${theme.primary}" fill-opacity="0.05" stroke="${theme.primary}" stroke-opacity="0.4" stroke-width="2" stroke-dasharray="6 4"/>
    ${
      label
        ? `<text x="${rect.x + 4}" y="${rect.y - 8}" font-family="${FONT_FAMILY}" font-size="11" font-weight="500" fill="${theme.primary}">${escapeXml(label)}</text>`
        : ""
    }
  </g>`;
};

const buildSelfLoopPath = (
  src: HandlePoint,
  tgt: HandlePoint,
): string => {
  const LOOP_RADIUS = 40;
  const LOOP_HEIGHT = 70;
  const LOOP_OFFSET_VERTICAL = 180;
  const isVertical =
    src.position === Position.Top ||
    src.position === Position.Bottom ||
    tgt.position === Position.Top ||
    tgt.position === Position.Bottom;
  if (isVertical) {
    return [
      `M ${src.x} ${src.y}`,
      `C ${src.x + LOOP_OFFSET_VERTICAL} ${src.y}`,
      `${tgt.x + LOOP_OFFSET_VERTICAL} ${tgt.y}`,
      `${tgt.x} ${tgt.y}`,
    ].join(" ");
  }
  const topY = Math.min(src.y, tgt.y) - LOOP_HEIGHT;
  return [
    `M ${src.x} ${src.y}`,
    `C ${src.x + LOOP_RADIUS} ${src.y} ${src.x + LOOP_RADIUS} ${topY} ${src.x} ${topY}`,
    `L ${tgt.x} ${topY}`,
    `C ${tgt.x - LOOP_RADIUS} ${topY} ${tgt.x - LOOP_RADIUS} ${tgt.y} ${tgt.x} ${tgt.y}`,
  ].join(" ");
};

type EdgeDraw = {
  d: string;
  stroke: string;
  strokeWidth: number;
  strokeDasharray: string | null;
  opacity: number;
  markerEndId: string;
};

const buildEdgeDraw = (
  edge: Edge,
  src: HandlePoint,
  tgt: HandlePoint,
  theme: Theme,
): EdgeDraw | null => {
  const isSelfLoop = edge.source === edge.target;
  const edgeData = (edge.data ?? {}) as { isLoop?: boolean };
  const isLoop = Boolean(edgeData.isLoop);
  const style = (edge.style ?? {}) as {
    stroke?: string;
    strokeDasharray?: string;
    opacity?: number;
  };

  let d: string;
  if (isSelfLoop) {
    d = buildSelfLoopPath(src, tgt);
  } else if (edge.type === "default") {
    // Variable artifact edges are rendered as smooth bezier curves in the
    // canvas — match that here so the connector style on screen matches the
    // SVG output.
    [d] = getBezierPath({
      sourceX: src.x,
      sourceY: src.y,
      sourcePosition: src.position,
      targetX: tgt.x,
      targetY: tgt.y,
      targetPosition: tgt.position,
    });
  } else {
    // Default (transitions, start edge) — xyflow's smooth-step path with the
    // same default border radius the on-canvas edges use.
    [d] = getSmoothStepPath({
      sourceX: src.x,
      sourceY: src.y,
      sourcePosition: src.position,
      targetX: tgt.x,
      targetY: tgt.y,
      targetPosition: tgt.position,
      borderRadius: 5,
    });
  }

  const stroke = style.stroke ?? theme.mutedForeground;
  const dasharray =
    style.strokeDasharray ?? (isLoop ? "6 4" : null);
  const opacity = style.opacity ?? 1;
  return {
    d,
    stroke,
    strokeWidth: 1.5,
    strokeDasharray: dasharray,
    opacity,
    markerEndId: `arrow-${stroke.replace(/[^a-z0-9]/gi, "")}`,
  };
};

export type RenderWorkflowSvgOptions = {
  byKind: ByKind | null;
  variables: ReadonlyArray<TemplateVariableDraft>;
};

export const renderWorkflowSvg = (
  instance: ReactFlowInstance,
  nodes: Node[],
  edges: Edge[],
  options: RenderWorkflowSvgOptions,
): string => {
  if (nodes.length === 0) {
    throw new Error("Aucun node à exporter");
  }

  const theme = readTheme();

  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const rects = new Map<string, Rect>();
  for (const node of nodes) {
    const r = positionAbsolute(instance, node);
    if (!r) continue;
    // Steps with notes always get the amber note block in the export. We
    // grow the card's bounding rect downward by the SVG note height so the
    // bbox and the card chrome both account for it. The editor's
    // `notesVisible` toggle controls only on-canvas visibility — the export
    // ignores it on purpose so the SVG is self-contained.
    const isStep =
      node.type !== "group" &&
      node.type !== "start" &&
      node.type !== "variable";
    if (isStep) {
      const step = stepData(node);
      if (typeof step.note === "string" && step.note.length > 0) {
        const noteH = noteSectionHeight(step.note, r.width);
        rects.set(node.id, { ...r, height: r.height + noteH });
        continue;
      }
    }
    rects.set(node.id, r);
  }
  if (rects.size === 0) {
    throw new Error("Impossible de calculer la position des nodes");
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const r of rects.values()) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }

  // Group labels render above the group's top edge — extend the bbox upward
  // so the label doesn't get clipped.
  const hasGroupLabels = nodes.some(
    (n) => n.type === "group" && typeof (n.data as { label?: string })?.label === "string" && (n.data as { label?: string }).label!.length > 0,
  );
  if (hasGroupLabels) minY -= 18;

  const offsetX = PADDING - minX;
  const offsetY = PADDING - minY;
  const width = Math.ceil(maxX - minX + PADDING * 2);
  const height = Math.ceil(maxY - minY + PADDING * 2);

  const shiftRect = (r: Rect): Rect => ({
    x: r.x + offsetX,
    y: r.y + offsetY,
    width: r.width,
    height: r.height,
  });
  const shiftPoint = (p: HandlePoint): HandlePoint => ({
    x: p.x + offsetX,
    y: p.y + offsetY,
    position: p.position,
  });

  const groupsSvg: string[] = [];
  const nodesSvg: string[] = [];
  for (const node of nodes) {
    const r = rects.get(node.id);
    if (!r) continue;
    const shifted = shiftRect(r);
    if (node.type === "group") {
      groupsSvg.push(renderGroupNode(shifted, node, theme));
    } else if (node.type === "start") {
      nodesSvg.push(renderStartNode(shifted, theme));
    } else if (node.type === "variable") {
      nodesSvg.push(renderVariableNode(shifted, node, theme));
    } else {
      // xyflow may not have measured a node yet — render handlers reading from
      // handleBounds will gracefully fall back to side-centers.
      const stepShifted = shifted;
      const stepNodeWithShiftedRect = stepShifted;
      nodesSvg.push(
        renderStepNode(
          instance,
          node,
          stepNodeWithShiftedRect,
          options.byKind,
          options.variables,
          theme,
        ),
      );
    }
  }

  const arrowMarkers = new Map<string, string>();
  const edgesSvg: string[] = [];
  for (const edge of edges) {
    const srcNode = nodesById.get(edge.source);
    const tgtNode = nodesById.get(edge.target);
    if (!srcNode || !tgtNode) continue;
    const srcRaw = handlePoint(
      instance,
      srcNode,
      "source",
      edge.sourceHandle ?? null,
    );
    const tgtRaw = handlePoint(
      instance,
      tgtNode,
      "target",
      edge.targetHandle ?? null,
    );
    if (!srcRaw || !tgtRaw) continue;
    const src = shiftPoint(srcRaw);
    const tgt = shiftPoint(tgtRaw);
    const draw = buildEdgeDraw(edge, src, tgt, theme);
    if (!draw) continue;
    arrowMarkers.set(draw.markerEndId, draw.stroke);
    const dash = draw.strokeDasharray
      ? ` stroke-dasharray="${escapeXml(draw.strokeDasharray)}"`
      : "";
    edgesSvg.push(
      `<path d="${draw.d}" fill="none" stroke="${draw.stroke}" stroke-width="${draw.strokeWidth}" opacity="${draw.opacity}"${dash} marker-end="url(#${draw.markerEndId})"/>`,
    );

    // Edge label mid-path. Matches the SelfLoopEdge label rendering.
    if (edge.label) {
      const cx = (src.x + tgt.x) / 2;
      const cy =
        edge.source === edge.target
          ? Math.min(src.y, tgt.y) - 70 - 6
          : (src.y + tgt.y) / 2;
      const labelText = String(edge.label);
      const rectWidth = labelText.length * 5.5 + 8;
      edgesSvg.push(
        `<g><rect x="${cx - rectWidth / 2}" y="${cy - 7}" width="${rectWidth}" height="14" rx="3" ry="3" fill="${theme.background}"/><text x="${cx}" y="${cy + 3.5}" font-family="${FONT_FAMILY}" font-size="10" fill="${theme.mutedForeground}" text-anchor="middle">${escapeXml(labelText)}</text></g>`,
      );
    }
  }

  const defs: string[] = [];
  for (const [id, color] of arrowMarkers) {
    defs.push(
      `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${color}"/></marker>`,
    );
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT_FAMILY}">
  <defs>
    ${defs.join("\n    ")}
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="${theme.background}"/>
  ${groupsSvg.join("\n  ")}
  ${edgesSvg.join("\n  ")}
  ${nodesSvg.join("\n  ")}
</svg>`;
};

const slugifyTemplateName = (templateName: string): string =>
  templateName
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

export const buildSvgFileName = (templateName: string): string => {
  const slug = slugifyTemplateName(templateName);
  return `${slug || "workflow"}.svg`;
};

export const buildPngFileName = (templateName: string): string => {
  const slug = slugifyTemplateName(templateName);
  return `${slug || "workflow"}.png`;
};

// Extract width/height from the root `<svg ... width="N" height="N">` tag.
// Reads our own deterministic output (renderWorkflowSvg always emits these as
// integer attributes on the root), so regex is safe — no need for DOMParser.
const readSvgDimensions = (svg: string): { width: number; height: number } => {
  const match = svg.match(/<svg\b[^>]*\swidth="(\d+)"[^>]*\sheight="(\d+)"/);
  if (!match) {
    throw new Error("Impossible de lire les dimensions du SVG exporté");
  }
  return { width: Number(match[1]), height: Number(match[2]) };
};

export type RenderWorkflowPngOptions = RenderWorkflowSvgOptions & {
  /** Facteur d'échelle pixel par unité SVG (défaut 2 pour un rendu net retina). */
  scale?: number;
};

// Rasterise le SVG du workflow en PNG côté renderer. On dessine le SVG dans
// une <canvas> hors écran à une résolution `scale ×` les dimensions natives
// puis on extrait les octets PNG via `canvas.toBlob`. L'`Image` chargée
// depuis un blob URL `image/svg+xml` est autorisée par la CSP (`img-src`
// inclut `blob:`).
export const renderWorkflowPng = async (
  instance: ReactFlowInstance,
  nodes: Node[],
  edges: Edge[],
  options: RenderWorkflowPngOptions,
): Promise<Uint8Array> => {
  const svg = renderWorkflowSvg(instance, nodes, edges, options);
  const { width, height } = readSvgDimensions(svg);
  const scale = options.scale ?? 2;

  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () =>
        reject(new Error("Impossible de charger le SVG dans une image"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(width * scale));
    canvas.height = Math.max(1, Math.ceil(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D indisponible");
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);
    const pngBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/png");
    });
    if (!pngBlob) {
      throw new Error("Impossible de générer le PNG depuis le canvas");
    }
    const buffer = await pngBlob.arrayBuffer();
    return new Uint8Array(buffer);
  } finally {
    URL.revokeObjectURL(url);
  }
};
