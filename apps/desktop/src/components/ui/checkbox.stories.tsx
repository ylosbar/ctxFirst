import * as React from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { Checkbox } from "./checkbox"

const meta = {
  title: "UI/Checkbox",
  component: Checkbox,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    checked: {
      control: "inline-radio",
      options: [undefined, true, false, "indeterminate"],
    },
    defaultChecked: { control: "boolean" },
    disabled: { control: "boolean" },
    required: { control: "boolean" },
    "aria-label": { control: "text" },
  },
  args: {
    "aria-label": "Accepter les conditions",
  },
} satisfies Meta<typeof Checkbox>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Checked: Story = {
  args: {
    defaultChecked: true,
  },
}

export const Indeterminate: Story = {
  args: {
    checked: "indeterminate",
  },
}

export const Disabled: Story = {
  args: {
    disabled: true,
  },
}

export const States: Story = {
  render: (args) => (
    <div className="grid grid-cols-3 items-center gap-3">
      <Checkbox {...args} aria-label="Unchecked" />
      <Checkbox {...args} aria-label="Checked" defaultChecked />
      <Checkbox {...args} aria-label="Indeterminate" checked="indeterminate" />
      <Checkbox {...args} aria-label="Disabled unchecked" disabled />
      <Checkbox
        {...args}
        aria-label="Disabled checked"
        disabled
        defaultChecked
      />
      <Checkbox
        {...args}
        aria-label="Disabled indeterminate"
        disabled
        checked="indeterminate"
      />
    </div>
  ),
}

export const WithLabel: Story = {
  name: "With label",
  render: (args) => (
    <label className="inline-flex items-center gap-2 text-sm">
      <Checkbox {...args} id="terms" aria-label={undefined} />
      <span>J'accepte les conditions d'utilisation</span>
    </label>
  ),
}

export const Controlled: Story = {
  render: function ControlledCheckbox(args) {
    const [checked, setChecked] = React.useState<boolean | "indeterminate">(
      "indeterminate",
    )
    return (
      <div className="flex flex-col items-start gap-3 text-sm">
        <label className="inline-flex items-center gap-2">
          <Checkbox
            {...args}
            checked={checked}
            onCheckedChange={(next) => setChecked(next)}
            aria-label={undefined}
            id="controlled"
          />
          <span>
            État : <code className="font-mono">{String(checked)}</code>
          </span>
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded border border-input px-2 py-1 text-xs hover:bg-muted"
            onClick={() => setChecked(true)}
          >
            Cocher
          </button>
          <button
            type="button"
            className="rounded border border-input px-2 py-1 text-xs hover:bg-muted"
            onClick={() => setChecked(false)}
          >
            Décocher
          </button>
          <button
            type="button"
            className="rounded border border-input px-2 py-1 text-xs hover:bg-muted"
            onClick={() => setChecked("indeterminate")}
          >
            Indéterminé
          </button>
        </div>
      </div>
    )
  },
}

export const ParentChild: Story = {
  name: "Parent / child (tri-state)",
  render: function ParentChildCheckbox(args) {
    const [items, setItems] = React.useState([false, true, false])
    const allChecked = items.every(Boolean)
    const noneChecked = items.every((v) => !v)
    const parentState: boolean | "indeterminate" = allChecked
      ? true
      : noneChecked
        ? false
        : "indeterminate"

    return (
      <div className="flex flex-col gap-2 text-sm">
        <label className="inline-flex items-center gap-2 font-medium">
          <Checkbox
            {...args}
            checked={parentState}
            onCheckedChange={(next) => setItems(items.map(() => next))}
            aria-label={undefined}
          />
          <span>Tous les éléments</span>
        </label>
        <div className="ml-6 flex flex-col gap-1.5">
          {items.map((value, index) => (
            <label
              key={index}
              className="inline-flex items-center gap-2"
            >
              <Checkbox
                {...args}
                checked={value}
                onCheckedChange={(next) =>
                  setItems(items.map((v, i) => (i === index ? next : v)))
                }
                aria-label={undefined}
              />
              <span>Élément {index + 1}</span>
            </label>
          ))}
        </div>
      </div>
    )
  },
}
