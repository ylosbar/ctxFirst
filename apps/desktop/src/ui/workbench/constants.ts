// Layout tokens for the Workbench outer Gridview. Centralized so that resize
// bounds and initial sizes can be tuned in one place rather than chased across
// the Workbench layout and its sidebars.

export const WORKBENCH_LAYOUT = {
  primarySidebar: {
    minPx: 180,
    maxPx: 600,
    defaultPct: 20,
    collapsedRailPx: 14,
  },
  secondarySidebar: {
    minPx: 180,
    // Cap is a share of the grid width (not a fixed pixel ceiling) so the panel
    // can grow on large displays — up to 80 % of the available width.
    maxPct: 80,
    defaultPct: 24,
    collapsedRailPx: 14,
  },
  editor: {
    minPx: 320,
  },
  bottomDock: {
    minPx: 120,
    maxPx: 800,
    defaultPct: 25,
  },
} as const;

// Sidebar tab bar (header) — kept here so primary and secondary share the
// same paddings and icon size without duplicating Tailwind classes.
// Height (h-8 = 32px) matches `--dv-tabs-and-actions-container-height` in
// App.css so every chrome strip (dockview tabs, sidebar tabs, bottom-panel
// header) aligns at the same vertical metric.
export const SIDEBAR_TABS = {
  containerClass:
    "flex h-8 shrink-0 items-center gap-1 border-b bg-muted/30 px-2",
  iconSize: "size-3.5",
} as const;
