import type { Meta, StoryObj } from "@storybook/react-vite"
import { Plus, Settings } from "lucide-react"

import { Button } from "./button"
import { Section } from "./section"

const meta = {
  title: "UI/Section",
  component: Section,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    density: {
      control: "inline-radio",
      options: ["default", "compact"],
    },
    title: { control: "text" },
    description: { control: "text" },
  },
  args: {
    title: "Membres de l'équipe",
    description: "Liste des personnes ayant accès au workspace.",
    children: (
      <div className="text-sm text-muted-foreground">
        3 membres actifs, 1 invitation en attente.
      </div>
    ),
  },
} satisfies Meta<typeof Section>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Densities: Story = {
  render: (args) => (
    <div className="flex flex-col gap-8">
      <Section {...args} density="default" title="Density « default »" />
      <Section {...args} density="compact" title="Density « compact »" />
    </div>
  ),
}

export const TitleOnly: Story = {
  name: "Title only",
  args: {
    description: undefined,
  },
}

export const DescriptionOnly: Story = {
  name: "Description only",
  args: {
    title: undefined,
  },
}

export const WithActions: Story = {
  name: "With actions",
  args: {
    actions: (
      <>
        <Button variant="ghost" size="icon-sm" aria-label="Réglages">
          <Settings />
        </Button>
        <Button size="sm">
          <Plus data-icon="inline-start" />
          Inviter
        </Button>
      </>
    ),
  },
}

export const ActionsOnly: Story = {
  name: "Actions only (no title)",
  args: {
    title: undefined,
    description: undefined,
    actions: (
      <Button size="sm">
        <Plus data-icon="inline-start" />
        Inviter
      </Button>
    ),
  },
}

export const ChildrenOnly: Story = {
  name: "Children only (no header)",
  args: {
    title: undefined,
    description: undefined,
  },
}

export const LongContent: Story = {
  name: "Long content",
  args: {
    title:
      "Un titre de section volontairement long pour observer le rendu côté en-tête",
    description:
      "Une description suffisamment longue pour s'étaler sur plusieurs lignes et vérifier le rendu typographique dans une section contrainte en largeur par son parent.",
    actions: (
      <Button size="sm">
        <Plus data-icon="inline-start" />
        Action
      </Button>
    ),
  },
  render: (args) => (
    <div className="w-96">
      <Section {...args} />
    </div>
  ),
}
