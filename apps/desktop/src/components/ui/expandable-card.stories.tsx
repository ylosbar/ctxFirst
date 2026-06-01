import * as React from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { Badge } from "./badge"
import { Button } from "./button"
import { ExpandableCard } from "./expandable-card"

const meta = {
  title: "UI/ExpandableCard",
  component: ExpandableCard,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    accent: {
      control: "inline-radio",
      options: [
        "default",
        "primary",
        "destructive",
        "success",
        "warning",
        "accent",
      ],
    },
    defaultExpanded: { control: "boolean" },
    scrollable: { control: "boolean" },
    maxBodyHeight: { control: "number" },
  },
  args: {
    accent: "default",
    defaultExpanded: false,
    scrollable: true,
    maxBodyHeight: 320,
    header: (
      <span className="truncate font-medium">
        Détails de l'étape
      </span>
    ),
    children: (
      <div className="p-3 text-xs text-muted-foreground">
        Contenu détaillé de la carte, visible une fois la carte dépliée.
      </div>
    ),
  },
} satisfies Meta<typeof ExpandableCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div className="w-[28rem]">
      <ExpandableCard {...args} />
    </div>
  ),
}

export const DefaultExpanded: Story = {
  name: "Default expanded",
  args: {
    defaultExpanded: true,
  },
  render: (args) => (
    <div className="w-[28rem]">
      <ExpandableCard {...args} />
    </div>
  ),
}

export const Accents: Story = {
  render: (args) => (
    <div className="flex w-[28rem] flex-col">
      <ExpandableCard
        {...args}
        accent="default"
        defaultExpanded
        header={<span className="font-medium">Default</span>}
      >
        <div className="p-3 text-xs text-muted-foreground">
          Bordure latérale neutre.
        </div>
      </ExpandableCard>
      <ExpandableCard
        {...args}
        accent="primary"
        defaultExpanded
        header={<span className="font-medium">Primary</span>}
      >
        <div className="p-3 text-xs text-muted-foreground">
          Bordure latérale primary.
        </div>
      </ExpandableCard>
      <ExpandableCard
        {...args}
        accent="destructive"
        defaultExpanded
        header={<span className="font-medium">Destructive</span>}
      >
        <div className="p-3 text-xs text-muted-foreground">
          Bordure latérale destructive.
        </div>
      </ExpandableCard>
      <ExpandableCard
        {...args}
        accent="success"
        defaultExpanded
        header={<span className="font-medium">Success</span>}
      >
        <div className="p-3 text-xs text-muted-foreground">
          Bordure latérale success.
        </div>
      </ExpandableCard>
      <ExpandableCard
        {...args}
        accent="warning"
        defaultExpanded
        header={<span className="font-medium">Warning</span>}
      >
        <div className="p-3 text-xs text-muted-foreground">
          Bordure latérale warning.
        </div>
      </ExpandableCard>
      <ExpandableCard
        {...args}
        accent="accent"
        defaultExpanded
        header={<span className="font-medium">Accent</span>}
      >
        <div className="p-3 text-xs text-muted-foreground">
          Bordure latérale accent.
        </div>
      </ExpandableCard>
    </div>
  ),
}

export const RichHeader: Story = {
  name: "Rich header",
  args: {
    defaultExpanded: true,
    header: (
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate font-medium">step.fetch_contacts</span>
        <Badge tone="success" size="sm">
          ok
        </Badge>
        <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
          124 ms
        </span>
      </div>
    ),
  },
  render: (args) => (
    <div className="w-[28rem]">
      <ExpandableCard {...args} />
    </div>
  ),
}

export const Controlled: Story = {
  render: (args) => {
    const [expanded, setExpanded] = React.useState(false)
    return (
      <div className="flex w-[28rem] flex-col gap-2">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Replier" : "Déplier"}
          </Button>
          <span className="text-xs text-muted-foreground">
            État externe : {expanded ? "ouvert" : "fermé"}
          </span>
        </div>
        <ExpandableCard
          {...args}
          expanded={expanded}
          onExpandedChange={setExpanded}
        />
      </div>
    )
  },
}

export const LongContent: Story = {
  name: "Long content (scrollable)",
  args: {
    defaultExpanded: true,
    scrollable: true,
    maxBodyHeight: 200,
    children: (
      <div className="flex flex-col gap-2 p-3 text-xs text-muted-foreground">
        {Array.from({ length: 30 }).map((_, i) => (
          <div key={i}>
            Ligne {i + 1} — Lorem ipsum dolor sit amet, consectetur
            adipiscing elit.
          </div>
        ))}
      </div>
    ),
  },
  render: (args) => (
    <div className="w-[28rem]">
      <ExpandableCard {...args} />
    </div>
  ),
}

export const NotScrollable: Story = {
  name: "Not scrollable",
  args: {
    defaultExpanded: true,
    scrollable: false,
    children: (
      <div className="flex flex-col gap-2 p-3 text-xs text-muted-foreground">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i}>Ligne {i + 1} — contenu non scrollable.</div>
        ))}
      </div>
    ),
  },
  render: (args) => (
    <div className="w-[28rem]">
      <ExpandableCard {...args} />
    </div>
  ),
}
