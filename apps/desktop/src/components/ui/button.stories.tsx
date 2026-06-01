import type { Meta, StoryObj } from "@storybook/react-vite"
import { ArrowRight, Check, Plus, Settings, Trash2 } from "lucide-react"

import { Button } from "./button"

const meta = {
  title: "UI/Button",
  component: Button,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "inline-radio",
      options: [
        "default",
        "outline",
        "secondary",
        "ghost",
        "destructive",
        "link",
      ],
    },
    size: {
      control: "inline-radio",
      options: [
        "default",
        "xs",
        "sm",
        "lg",
        "icon",
        "icon-xs",
        "icon-sm",
        "icon-lg",
      ],
    },
    disabled: { control: "boolean" },
    "aria-invalid": { control: "boolean" },
    children: { control: "text" },
  },
  args: {
    children: "Button",
  },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Variants: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-2">
      <Button {...args} variant="default">
        Default
      </Button>
      <Button {...args} variant="outline">
        Outline
      </Button>
      <Button {...args} variant="secondary">
        Secondary
      </Button>
      <Button {...args} variant="ghost">
        Ghost
      </Button>
      <Button {...args} variant="destructive">
        Destructive
      </Button>
      <Button {...args} variant="link">
        Link
      </Button>
    </div>
  ),
}

export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-2">
      <Button {...args} size="xs">
        Extra small
      </Button>
      <Button {...args} size="sm">
        Small
      </Button>
      <Button {...args} size="default">
        Default
      </Button>
      <Button {...args} size="lg">
        Large
      </Button>
    </div>
  ),
}

export const IconSizes: Story = {
  name: "Sizes (icon-only)",
  render: (args) => (
    <div className="flex flex-wrap items-center gap-2">
      <Button {...args} size="icon-xs" aria-label="Réglages extra small">
        <Settings />
      </Button>
      <Button {...args} size="icon-sm" aria-label="Réglages small">
        <Settings />
      </Button>
      <Button {...args} size="icon" aria-label="Réglages default">
        <Settings />
      </Button>
      <Button {...args} size="icon-lg" aria-label="Réglages large">
        <Settings />
      </Button>
    </div>
  ),
}

export const WithIconStart: Story = {
  name: "With icon (start)",
  render: (args) => (
    <Button {...args}>
      <Plus data-icon="inline-start" />
      Ajouter un élément
    </Button>
  ),
}

export const WithIconEnd: Story = {
  name: "With icon (end)",
  render: (args) => (
    <Button {...args} variant="outline">
      Continuer
      <ArrowRight data-icon="inline-end" />
    </Button>
  ),
}

export const Destructive: Story = {
  render: (args) => (
    <Button {...args} variant="destructive">
      <Trash2 data-icon="inline-start" />
      Supprimer
    </Button>
  ),
}

export const Disabled: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-2">
      <Button {...args} disabled variant="default">
        Default
      </Button>
      <Button {...args} disabled variant="outline">
        Outline
      </Button>
      <Button {...args} disabled variant="ghost">
        Ghost
      </Button>
    </div>
  ),
}

export const Invalid: Story = {
  name: "aria-invalid",
  args: {
    "aria-invalid": true,
    children: "Champ invalide",
  },
}

export const AsLink: Story = {
  name: "As link (render prop)",
  render: (args) => (
    <Button
      {...args}
      variant="link"
      render={<a href="https://example.com" target="_blank" rel="noreferrer" />}
    >
      <Check data-icon="inline-start" />
      Voir la documentation
    </Button>
  ),
}

export const LongLabel: Story = {
  name: "Long label (whitespace-nowrap)",
  args: {
    children:
      "Une étiquette très longue qui ne doit pas wrapper même quand le conteneur est étroit",
  },
}
