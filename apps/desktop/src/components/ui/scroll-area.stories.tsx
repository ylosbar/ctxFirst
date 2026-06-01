import type { Meta, StoryObj } from "@storybook/react-vite"

import { ScrollArea } from "./scroll-area"

const lines = Array.from({ length: 50 }, (_, i) => `Ligne ${i + 1}`)

const meta = {
  title: "UI/ScrollArea",
  component: ScrollArea,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  args: {},
} satisfies Meta<typeof ScrollArea>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <ScrollArea
      {...args}
      className="h-64 w-72 rounded-md border"
    >
      <div className="flex flex-col gap-1 p-3 text-sm">
        {lines.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
    </ScrollArea>
  ),
}

export const VerticalOverflow: Story = {
  name: "Vertical overflow",
  render: (args) => (
    <ScrollArea
      {...args}
      className="h-48 w-72 rounded-md border"
    >
      <div className="flex flex-col gap-1 p-3 text-sm">
        {lines.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
    </ScrollArea>
  ),
}

export const HorizontalOverflow: Story = {
  name: "Horizontal overflow",
  render: (args) => (
    <ScrollArea
      {...args}
      className="h-24 w-80 rounded-md border"
    >
      <div className="flex w-max gap-3 p-3 text-sm whitespace-nowrap">
        {Array.from({ length: 20 }, (_, i) => (
          <div
            key={i}
            className="flex h-16 w-32 shrink-0 items-center justify-center rounded border bg-muted/40 text-muted-foreground"
          >
            Carte {i + 1}
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
}

export const BothAxes: Story = {
  name: "Both axes",
  render: (args) => (
    <ScrollArea
      {...args}
      className="h-64 w-80 rounded-md border"
    >
      <div className="w-max p-3 font-mono text-xs whitespace-pre">
        {Array.from({ length: 60 }, (_, row) =>
          Array.from({ length: 40 }, (_, col) =>
            `${row.toString().padStart(2, "0")}:${col
              .toString()
              .padStart(2, "0")}`,
          ).join("  "),
        ).join("\n")}
      </div>
    </ScrollArea>
  ),
}

export const ShortContent: Story = {
  name: "Short content (no scroll)",
  render: (args) => (
    <ScrollArea
      {...args}
      className="h-64 w-72 rounded-md border"
    >
      <div className="p-3 text-sm text-muted-foreground">
        Un contenu suffisamment court pour ne pas déclencher de scrollbar.
      </div>
    </ScrollArea>
  ),
}

export const WithOptions: Story = {
  name: "With options (autoHide: never)",
  render: (args) => (
    <ScrollArea
      {...args}
      className="h-48 w-72 rounded-md border"
      options={{ scrollbars: { autoHide: "never" } }}
    >
      <div className="flex flex-col gap-1 p-3 text-sm">
        {lines.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
    </ScrollArea>
  ),
}
