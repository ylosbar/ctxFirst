import type { Meta, StoryObj } from "@storybook/react-vite"
import { Check, CircleAlert, Sparkles, X } from "lucide-react"

import { Badge } from "./badge"

const meta = {
  title: "UI/Badge",
  component: Badge,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "inline-radio",
      options: [
        "default",
        "secondary",
        "destructive",
        "outline",
        "ghost",
        "link",
      ],
    },
    tone: {
      control: "inline-radio",
      options: [
        undefined,
        "neutral",
        "info",
        "warning",
        "success",
        "accent",
        "danger",
      ],
    },
    size: {
      control: "inline-radio",
      options: ["default", "sm"],
    },
    font: {
      control: "inline-radio",
      options: ["default", "mono"],
    },
    children: { control: "text" },
  },
  args: {
    children: "Badge",
  },
} satisfies Meta<typeof Badge>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Variants: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge {...args} variant="default">
        Default
      </Badge>
      <Badge {...args} variant="secondary">
        Secondary
      </Badge>
      <Badge {...args} variant="destructive">
        Destructive
      </Badge>
      <Badge {...args} variant="outline">
        Outline
      </Badge>
      <Badge {...args} variant="ghost">
        Ghost
      </Badge>
      <Badge {...args} variant="link">
        Link
      </Badge>
    </div>
  ),
}

export const Tones: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge {...args} tone="neutral">
        Neutral
      </Badge>
      <Badge {...args} tone="info">
        Info
      </Badge>
      <Badge {...args} tone="warning">
        Warning
      </Badge>
      <Badge {...args} tone="success">
        Success
      </Badge>
      <Badge {...args} tone="accent">
        Accent
      </Badge>
      <Badge {...args} tone="danger">
        Danger
      </Badge>
    </div>
  ),
}

export const Sizes: Story = {
  render: (args) => (
    <div className="flex items-center gap-2">
      <Badge {...args} size="default">
        Default
      </Badge>
      <Badge {...args} size="sm">
        Small
      </Badge>
    </div>
  ),
}

export const Mono: Story = {
  args: {
    font: "mono",
    children: "v1.2.0",
  },
}

export const WithIconStart: Story = {
  name: "With icon (start)",
  render: (args) => (
    <Badge {...args} tone="success">
      <Check data-icon="inline-start" />
      Approved
    </Badge>
  ),
}

export const WithIconEnd: Story = {
  name: "With icon (end)",
  render: (args) => (
    <Badge {...args} tone="warning">
      Pending
      <CircleAlert data-icon="inline-end" />
    </Badge>
  ),
}

export const AsLink: Story = {
  name: "As link (render prop)",
  render: (args) => (
    <Badge
      {...args}
      variant="link"
      render={<a href="#" />}
    >
      <Sparkles data-icon="inline-start" />
      Voir le détail
    </Badge>
  ),
}

export const Dismissible: Story = {
  render: (args) => (
    <Badge {...args} tone="info">
      Filter: status=open
      <button
        type="button"
        aria-label="Retirer le filtre"
        className="ml-0.5 inline-flex items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10"
      >
        <X data-icon="inline-end" />
      </button>
    </Badge>
  ),
}
