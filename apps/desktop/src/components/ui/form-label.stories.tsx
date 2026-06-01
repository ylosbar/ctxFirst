import type { Meta, StoryObj } from "@storybook/react-vite"

import { FormLabel } from "./form-label"
import { Input } from "./input"

const meta = {
  title: "UI/FormLabel",
  component: FormLabel,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    required: { control: "boolean" },
    htmlFor: { control: "text" },
    children: { control: "text" },
  },
  args: {
    children: "Adresse email",
  },
} satisfies Meta<typeof FormLabel>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Required: Story = {
  args: {
    required: true,
  },
}

export const States: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2">
      <FormLabel {...args}>Champ optionnel</FormLabel>
      <FormLabel {...args} required>
        Champ obligatoire
      </FormLabel>
    </div>
  ),
}

export const LinkedToInput: Story = {
  name: "Linked to input (htmlFor)",
  render: (args) => (
    <div className="flex w-72 flex-col gap-1">
      <FormLabel {...args} htmlFor="full-name" required>
        Nom complet
      </FormLabel>
      <Input id="full-name" placeholder="Prénom Nom" />
    </div>
  ),
}

export const LongLabel: Story = {
  name: "Long label (wrap)",
  args: {
    required: true,
    children:
      "Un libellé volontairement long pour vérifier que l'étoile required reste accolée à la dernière ligne du texte",
  },
  render: (args) => (
    <div className="w-64">
      <FormLabel {...args} />
    </div>
  ),
}
