import type { Meta, StoryObj } from "@storybook/react-vite"

import { PasswordInput } from "./password-input"

const meta = {
  title: "UI/PasswordInput",
  component: PasswordInput,
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
    revealLabel: { control: "text" },
    hideLabel: { control: "text" },
  },
  args: {
    placeholder: "Votre mot de passe",
  },
} satisfies Meta<typeof PasswordInput>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithValue: Story = {
  args: {
    defaultValue: "correct horse battery staple",
  },
}

export const Disabled: Story = {
  args: {
    disabled: true,
    defaultValue: "mot-de-passe",
  },
}

export const ReadOnly: Story = {
  name: "Read-only",
  args: {
    readOnly: true,
    defaultValue: "mot-de-passe",
  },
}

export const Invalid: Story = {
  args: {
    "aria-invalid": true,
    defaultValue: "trop-court",
  },
}

export const States: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2">
      <PasswordInput {...args} placeholder="Default" />
      <PasswordInput {...args} defaultValue="Filled" />
      <PasswordInput {...args} placeholder="Disabled" disabled />
      <PasswordInput {...args} defaultValue="Read-only" readOnly />
      <PasswordInput {...args} defaultValue="Invalid" aria-invalid />
    </div>
  ),
}

export const CustomLabels: Story = {
  name: "Custom reveal/hide labels",
  args: {
    revealLabel: "Show password",
    hideLabel: "Hide password",
    defaultValue: "hunter2",
  },
}

export const ConstrainedWidth: Story = {
  name: "Constrained width",
  render: (args) => (
    <div className="flex flex-col gap-3">
      <div className="w-40">
        <PasswordInput {...args} placeholder="Étroit" />
      </div>
      <div className="w-72">
        <PasswordInput {...args} placeholder="Moyen" />
      </div>
      <div className="w-full">
        <PasswordInput {...args} placeholder="Pleine largeur" />
      </div>
    </div>
  ),
}

export const LongValue: Story = {
  name: "Long value (overflow)",
  render: (args) => (
    <div className="w-64">
      <PasswordInput
        {...args}
        defaultValue="un-mot-de-passe-volontairement-tres-long-pour-verifier-l-overflow-horizontal"
      />
    </div>
  ),
}
