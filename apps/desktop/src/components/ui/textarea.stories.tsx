import type { Meta, StoryObj } from "@storybook/react-vite"

import { Textarea } from "./textarea"

const meta = {
  title: "UI/Textarea",
  component: Textarea,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: "inline-radio",
      options: ["default", "sm"],
    },
    placeholder: { control: "text" },
    rows: { control: "number" },
    disabled: { control: "boolean" },
    readOnly: { control: "boolean" },
    required: { control: "boolean" },
    "aria-invalid": { control: "boolean" },
    defaultValue: { control: "text" },
  },
  args: {
    size: "default",
    placeholder: "Décrivez votre demande…",
  },
} satisfies Meta<typeof Textarea>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithValue: Story = {
  args: {
    defaultValue:
      "Une description de plusieurs lignes pour illustrer le rendu lorsque le champ contient déjà du contenu saisi par l'utilisateur.",
  },
}

export const Disabled: Story = {
  args: {
    disabled: true,
    defaultValue: "Champ désactivé",
  },
}

export const ReadOnly: Story = {
  name: "Read-only",
  args: {
    readOnly: true,
    defaultValue: "Valeur figée non modifiable",
  },
}

export const Invalid: Story = {
  args: {
    "aria-invalid": true,
    defaultValue: "Contenu invalide",
  },
}

export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-col gap-3">
      <Textarea {...args} size="default" placeholder="Default" />
      <Textarea {...args} size="sm" placeholder="Small" />
    </div>
  ),
}

export const States: Story = {
  render: (args) => (
    <div className="flex flex-col gap-3">
      <Textarea {...args} placeholder="Default" />
      <Textarea {...args} defaultValue="Filled" />
      <Textarea {...args} placeholder="Disabled" disabled />
      <Textarea {...args} defaultValue="Read-only" readOnly />
      <Textarea {...args} defaultValue="Invalid" aria-invalid />
    </div>
  ),
}

export const Autosize: Story = {
  name: "Autosize (field-sizing)",
  args: {
    defaultValue:
      "Le composant utilise field-sizing-content : il s'agrandit automatiquement\nau fil des lignes ajoutées.\n\nAjoutez ou supprimez des lignes pour vérifier le redimensionnement.",
  },
}

export const LongValue: Story = {
  name: "Long value (overflow)",
  args: {
    defaultValue:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(40),
  },
}
