import type { Meta, StoryObj } from "@storybook/react-vite"

import { Separator } from "./separator"

const meta = {
  title: "UI/Separator",
  component: Separator,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    orientation: {
      control: "inline-radio",
      options: ["horizontal", "vertical"],
    },
  },
  args: {
    orientation: "horizontal",
  },
} satisfies Meta<typeof Separator>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div className="w-64">
      <Separator {...args} />
    </div>
  ),
}

export const Horizontal: Story = {
  render: (args) => (
    <div className="flex w-72 flex-col gap-3 text-sm">
      <span>Section précédente</span>
      <Separator {...args} orientation="horizontal" />
      <span>Section suivante</span>
    </div>
  ),
}

export const Vertical: Story = {
  render: (args) => (
    <div className="flex h-8 items-center gap-3 text-sm">
      <span>Brouillon</span>
      <Separator {...args} orientation="vertical" />
      <span>Modifié il y a 2 min</span>
      <Separator {...args} orientation="vertical" />
      <span>3 contributeurs</span>
    </div>
  ),
}

export const InList: Story = {
  name: "In list",
  render: (args) => (
    <ul className="w-72 text-sm">
      <li className="py-2">Premier élément</li>
      <Separator {...args} orientation="horizontal" />
      <li className="py-2">Deuxième élément</li>
      <Separator {...args} orientation="horizontal" />
      <li className="py-2">Troisième élément</li>
    </ul>
  ),
}
