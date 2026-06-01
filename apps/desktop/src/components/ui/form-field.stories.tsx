import type { Meta, StoryObj } from "@storybook/react-vite"

import { Checkbox } from "./checkbox"
import { FormField } from "./form-field"
import { Input } from "./input"
import { Textarea } from "./textarea"

const meta = {
  title: "UI/FormField",
  component: FormField,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    orientation: {
      control: "inline-radio",
      options: ["vertical", "inline"],
    },
    label: { control: "text" },
    description: { control: "text" },
    error: { control: "text" },
    required: { control: "boolean" },
    htmlFor: { control: "text" },
  },
  args: {
    orientation: "vertical",
    label: "Adresse email",
    htmlFor: "email",
    children: <Input id="email" type="email" placeholder="nom@exemple.com" />,
  },
} satisfies Meta<typeof FormField>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div className="w-80">
      <FormField {...args} />
    </div>
  ),
}

export const Orientations: Story = {
  render: (args) => (
    <div className="flex w-80 flex-col gap-6">
      <FormField
        {...args}
        orientation="vertical"
        label="Adresse email"
        htmlFor="email-vertical"
        description="Utilisée pour les notifications produit."
      >
        <Input
          id="email-vertical"
          type="email"
          placeholder="nom@exemple.com"
        />
      </FormField>
      <FormField
        {...args}
        orientation="inline"
        label="J'accepte les conditions d'utilisation"
        htmlFor="terms"
        description="Vous pourrez vous désinscrire à tout moment."
      >
        <Checkbox id="terms" aria-label={undefined} />
      </FormField>
    </div>
  ),
}

export const WithDescription: Story = {
  name: "With description",
  args: {
    description: "Une adresse personnelle est préférable à une adresse pro.",
  },
  render: (args) => (
    <div className="w-80">
      <FormField {...args} />
    </div>
  ),
}

export const WithError: Story = {
  name: "With error",
  args: {
    error: "Cette adresse email est invalide.",
    children: (
      <Input
        id="email"
        type="email"
        defaultValue="pas-un-email"
        aria-invalid
      />
    ),
  },
  render: (args) => (
    <div className="w-80">
      <FormField {...args} />
    </div>
  ),
}

export const Required: Story = {
  args: {
    required: true,
  },
  render: (args) => (
    <div className="w-80">
      <FormField {...args} />
    </div>
  ),
}

export const Inline: Story = {
  name: "Inline (checkbox)",
  args: {
    orientation: "inline",
    label: "Recevoir la newsletter hebdomadaire",
    htmlFor: "newsletter",
    description: "Un email tous les lundis matin.",
    children: <Checkbox id="newsletter" aria-label={undefined} />,
  },
  render: (args) => (
    <div className="w-80">
      <FormField {...args} />
    </div>
  ),
}

export const Complete: Story = {
  name: "Label + description + error",
  args: {
    required: true,
    description: "Au moins 10 caractères, sans informations personnelles.",
    error: "Ce champ est obligatoire.",
    label: "Mot de passe",
    htmlFor: "password",
    children: (
      <Input
        id="password"
        type="password"
        defaultValue=""
        aria-invalid
        placeholder="••••••••"
      />
    ),
  },
  render: (args) => (
    <div className="w-80">
      <FormField {...args} />
    </div>
  ),
}

export const WithTextarea: Story = {
  name: "With textarea",
  args: {
    label: "Notes internes",
    htmlFor: "notes",
    description: "Visible uniquement par votre équipe.",
    children: (
      <Textarea
        id="notes"
        placeholder="Ajouter un contexte sur ce contact…"
        rows={4}
      />
    ),
  },
  render: (args) => (
    <div className="w-80">
      <FormField {...args} />
    </div>
  ),
}

export const LongError: Story = {
  name: "Long error (wrap)",
  args: {
    error:
      "Cette valeur ne respecte pas le format attendu : elle doit commencer par 'usr_' et comporter exactement 24 caractères hexadécimaux après le préfixe.",
    children: <Input id="email" aria-invalid />,
  },
  render: (args) => (
    <div className="w-80">
      <FormField {...args} />
    </div>
  ),
}
