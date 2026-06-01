import type { Meta, StoryObj } from "@storybook/react-vite"

import { Input } from "./input"

const meta = {
  title: "UI/Input",
  component: Input,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    type: {
      control: "inline-radio",
      options: [
        "text",
        "email",
        "password",
        "number",
        "search",
        "url",
        "tel",
        "date",
      ],
    },
    placeholder: { control: "text" },
    disabled: { control: "boolean" },
    readOnly: { control: "boolean" },
    required: { control: "boolean" },
    "aria-invalid": { control: "boolean" },
    defaultValue: { control: "text" },
  },
  args: {
    type: "text",
    placeholder: "Votre adresse email",
  },
} satisfies Meta<typeof Input>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithValue: Story = {
  args: {
    type: "email",
    defaultValue: "yoann@example.com",
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
    defaultValue: "Valeur figée",
  },
}

export const Invalid: Story = {
  args: {
    type: "email",
    defaultValue: "pas-un-email",
    "aria-invalid": true,
  },
}

export const States: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2">
      <Input {...args} placeholder="Default" />
      <Input {...args} defaultValue="Filled" />
      <Input {...args} placeholder="Disabled" disabled />
      <Input {...args} defaultValue="Read-only" readOnly />
      <Input {...args} defaultValue="Invalid" aria-invalid />
    </div>
  ),
}

export const Types: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2">
      <Input {...args} type="text" placeholder="Texte libre" />
      <Input {...args} type="email" placeholder="nom@exemple.com" />
      <Input {...args} type="password" placeholder="••••••••" />
      <Input {...args} type="number" placeholder="0" />
      <Input {...args} type="search" placeholder="Rechercher…" />
      <Input {...args} type="url" placeholder="https://" />
      <Input {...args} type="tel" placeholder="+33 6 12 34 56 78" />
      <Input {...args} type="date" />
    </div>
  ),
}

export const LongValue: Story = {
  name: "Long value (overflow)",
  args: {
    defaultValue:
      "Une valeur très longue pour vérifier le comportement de l'overflow horizontal lorsque le champ est contraint en largeur par son parent",
  },
}
