import type { Meta, StoryObj } from "@storybook/react-vite"

import { SearchInput } from "./search-input"

const meta = {
  title: "UI/SearchInput",
  component: SearchInput,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    placeholder: { control: "text" },
    disabled: { control: "boolean" },
    readOnly: { control: "boolean" },
    required: { control: "boolean" },
    "aria-invalid": { control: "boolean" },
    defaultValue: { control: "text" },
  },
  args: {
    placeholder: "Rechercher…",
  },
} satisfies Meta<typeof SearchInput>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithValue: Story = {
  args: {
    defaultValue: "facture",
  },
}

export const Disabled: Story = {
  args: {
    disabled: true,
    defaultValue: "Recherche désactivée",
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
    "aria-invalid": true,
    defaultValue: "??",
  },
}

export const States: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2">
      <SearchInput {...args} placeholder="Default" />
      <SearchInput {...args} defaultValue="Filled" />
      <SearchInput {...args} placeholder="Disabled" disabled />
      <SearchInput {...args} defaultValue="Read-only" readOnly />
      <SearchInput {...args} defaultValue="Invalid" aria-invalid />
    </div>
  ),
}

export const ConstrainedWidth: Story = {
  name: "Constrained width",
  render: (args) => (
    <div className="flex flex-col gap-3">
      <div className="w-40">
        <SearchInput {...args} placeholder="Étroit" />
      </div>
      <div className="w-72">
        <SearchInput {...args} placeholder="Moyen" />
      </div>
      <div className="w-full">
        <SearchInput {...args} placeholder="Pleine largeur" />
      </div>
    </div>
  ),
}

export const LongValue: Story = {
  name: "Long value (overflow)",
  render: (args) => (
    <div className="w-64">
      <SearchInput
        {...args}
        defaultValue="Une requête de recherche très longue pour vérifier le comportement de l'overflow horizontal lorsque le champ est contraint"
      />
    </div>
  ),
}
