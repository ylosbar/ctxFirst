import type { Meta, StoryObj } from "@storybook/react-vite"

import { Select } from "./select"

const meta = {
  title: "UI/Select",
  component: Select,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    disabled: { control: "boolean" },
    required: { control: "boolean" },
    multiple: { control: "boolean" },
    "aria-invalid": { control: "boolean" },
    defaultValue: { control: "text" },
  },
  args: {
    children: (
      <>
        <option value="">Sélectionner une option…</option>
        <option value="draft">Brouillon</option>
        <option value="review">En revue</option>
        <option value="published">Publié</option>
        <option value="archived">Archivé</option>
      </>
    ),
  },
} satisfies Meta<typeof Select>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithValue: Story = {
  args: {
    defaultValue: "review",
  },
}

export const Disabled: Story = {
  args: {
    disabled: true,
    defaultValue: "draft",
  },
}

export const Invalid: Story = {
  args: {
    "aria-invalid": true,
    defaultValue: "",
  },
}

export const States: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2">
      <Select {...args} />
      <Select {...args} defaultValue="published" />
      <Select {...args} disabled defaultValue="draft" />
      <Select {...args} aria-invalid defaultValue="" />
    </div>
  ),
}

export const WithOptGroups: Story = {
  name: "With optgroups",
  render: (args) => (
    <Select {...args}>
      <option value="">Choisir un workflow…</option>
      <optgroup label="Contenu">
        <option value="article">Article</option>
        <option value="newsletter">Newsletter</option>
      </optgroup>
      <optgroup label="Campagnes">
        <option value="seeding">Seeding</option>
        <option value="boost">Boost payant</option>
      </optgroup>
    </Select>
  ),
}

export const Multiple: Story = {
  render: (args) => (
    <Select {...args} multiple defaultValue={["draft", "review"]}>
      <option value="draft">Brouillon</option>
      <option value="review">En revue</option>
      <option value="published">Publié</option>
      <option value="archived">Archivé</option>
    </Select>
  ),
}

export const LongOption: Story = {
  name: "Long option (overflow)",
  render: (args) => (
    <Select {...args} defaultValue="long">
      <option value="short">Option courte</option>
      <option value="long">
        Une option avec un libellé très long pour vérifier le comportement de
        troncature lorsque le composant est contraint en largeur par son parent
      </option>
    </Select>
  ),
}
