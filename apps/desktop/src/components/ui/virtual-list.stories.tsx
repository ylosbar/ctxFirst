import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"

import VirtualList from "./virtual-list"

type Row = { readonly id: string; readonly label: string }

const ROW_HEIGHT = 32
const COUNT = 10_000

const ROWS: ReadonlyArray<Row> = Array.from({ length: COUNT }, (_, i) => ({
  id: `row-${i}`,
  label: `Ligne ${i}`,
}))

const Demo = ({ count = COUNT }: { readonly count?: number }) => {
  const items = ROWS.slice(0, count)
  return (
    <div className="h-96 w-80 rounded-md border">
      <VirtualList
        className="h-full"
        items={items}
        as="ol"
        ariaLabel="Liste synthétique"
        getKey={(item) => item.id}
        estimateSize={() => ROW_HEIGHT}
        renderItem={(item) => (
          <div className="flex h-8 items-center border-b border-border/60 px-3 text-xs tabular-nums">
            {item.label}
          </div>
        )}
        footer={
          <div className="px-3 py-2 text-2xs text-muted-foreground">
            {items.length} lignes (footer non virtualisé)
          </div>
        }
      />
    </div>
  )
}

const meta = {
  title: "UI/VirtualList",
  component: Demo,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Demo>

export default meta
type Story = StoryObj<typeof meta>

/**
 * 10 000 lignes : seule la fenêtre visible (+ overscan) est montée dans le DOM,
 * le sizer porte la hauteur totale, et le footer est rendu hors virtualisation.
 */
export const TenThousandRows: Story = {
  name: "10 000 lignes (fenêtrage)",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Only a bounded window is mounted — nowhere near the 10 000 rows.
    const mounted = canvasElement.querySelectorAll("[data-index]")
    expect(mounted.length).toBeGreaterThan(0)
    expect(mounted.length).toBeLessThan(100)

    // The sizer reserves the full scroll height (≈ count × estimate).
    const sizer = canvas.getByRole("list")
    expect(sizer.style.height).toBe(`${COUNT * ROW_HEIGHT}px`)

    // The footer is rendered in-flow, outside the virtualized window.
    await expect(
      canvas.getByText(/footer non virtualisé/),
    ).toBeInTheDocument()
  },
}

// ── Sticky group headers ─────────────────────────────────────────────────────

type GroupRow =
  | { readonly kind: "header"; readonly id: string; readonly label: string }
  | { readonly kind: "item"; readonly id: string; readonly label: string }

const GROUPS = 8
const PER_GROUP = 50
const HEADER_PX = 26
const ITEM_PX = 28

const GROUPED: ReadonlyArray<GroupRow> = Array.from(
  { length: GROUPS },
  (_, g) => g,
).flatMap((g) => [
  { kind: "header" as const, id: `h-${g}`, label: `Groupe ${g}` },
  ...Array.from({ length: PER_GROUP }, (_, i) => ({
    kind: "item" as const,
    id: `g${g}-i${i}`,
    label: `Groupe ${g} · élément ${i}`,
  })),
])

const GroupedDemo = () => (
  <div className="h-96 w-80 rounded-md border">
    <VirtualList
      className="h-full"
      items={GROUPED}
      as="ol"
      ariaLabel="Liste groupée"
      getKey={(row) => row.id}
      estimateSize={(row) => (row.kind === "header" ? HEADER_PX : ITEM_PX)}
      isSticky={(row) => row.kind === "header"}
      renderItem={(row) =>
        row.kind === "header" ? (
          <div className="flex h-[26px] items-center border-b border-border bg-muted px-3 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            {row.label}
          </div>
        ) : (
          <div className="flex h-7 items-center px-3 text-xs">{row.label}</div>
        )
      }
    />
  </div>
)

export const StickyHeaders: StoryObj<typeof meta> = {
  name: "En-têtes collants",
  render: () => <GroupedDemo />,
  play: async ({ canvasElement }) => {
    // At the top, the first group's header is the one pinned.
    const top = canvasElement.querySelector("[data-sticky]")
    expect(top?.textContent).toContain("Groupe 0")

    // Scroll past the first group → the pinned header advances.
    const scroller = canvasElement.querySelector(
      "[data-overlayscrollbars-initialize]",
    ) as HTMLElement
    scroller.scrollTop = HEADER_PX + PER_GROUP * ITEM_PX + 100
    await waitFor(() => {
      const active = canvasElement.querySelector("[data-sticky]")
      expect(active?.textContent).not.toContain("Groupe 0")
      expect(active?.textContent).toMatch(/Groupe [1-9]/)
    })
  },
}
