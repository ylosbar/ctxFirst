import type { Meta, StoryObj } from "@storybook/react-vite"
import { FileText, Plus, Settings } from "lucide-react"

import { Badge } from "./badge"
import { Button } from "./button"
import { PageHeader } from "./page-header"

const meta = {
  title: "UI/PageHeader",
  component: PageHeader,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    title: { control: "text" },
  },
  args: {
    title: "Contacts",
  },
} satisfies Meta<typeof PageHeader>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithIcon: Story = {
  name: "With icon",
  args: {
    icon: <FileText className="size-4" />,
  },
}

export const WithTrailing: Story = {
  name: "With trailing",
  args: {
    trailing: (
      <Badge tone="info" size="sm">
        12
      </Badge>
    ),
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
          Nouveau
        </Button>
      </>
    ),
  },
}

export const Full: Story = {
  name: "Icon + trailing + actions",
  args: {
    icon: <FileText className="size-4" />,
    trailing: (
      <Badge tone="info" size="sm">
        12
      </Badge>
    ),
    actions: (
      <>
        <Button variant="ghost" size="icon-sm" aria-label="Réglages">
          <Settings />
        </Button>
        <Button size="sm">
          <Plus data-icon="inline-start" />
          Nouveau
        </Button>
      </>
    ),
  },
}

export const LongTitle: Story = {
  name: "Long title (truncate)",
  render: (args) => (
    <div className="w-96 border-x">
      <PageHeader {...args} />
    </div>
  ),
  args: {
    title:
      "Un titre de page volontairement très long pour vérifier la troncature horizontale dans un conteneur étroit",
    icon: <FileText className="size-4" />,
    actions: (
      <Button size="sm">
        <Plus data-icon="inline-start" />
        Nouveau
      </Button>
    ),
  },
}
