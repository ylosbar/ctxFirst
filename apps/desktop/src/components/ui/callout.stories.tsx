import type { Meta, StoryObj } from "@storybook/react-vite"
import { Rocket, Sparkles } from "lucide-react"

import { Button } from "./button"
import { Callout } from "./callout"

const meta = {
  title: "UI/Callout",
  component: Callout,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    tone: {
      control: "inline-radio",
      options: ["info", "warning", "success", "danger"],
    },
    title: { control: "text" },
    children: { control: "text" },
  },
  args: {
    tone: "info",
    title: "Synchronisation terminée",
    children:
      "Les contacts ont été importés depuis le dernier fichier CSV.",
  },
} satisfies Meta<typeof Callout>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div className="w-[28rem]">
      <Callout {...args} />
    </div>
  ),
}

export const Tones: Story = {
  render: (args) => (
    <div className="flex w-[28rem] flex-col gap-3">
      <Callout {...args} tone="info" title="Info">
        Une information à porter à la connaissance de l'utilisateur.
      </Callout>
      <Callout {...args} tone="warning" title="Warning">
        Une action mérite l'attention de l'utilisateur avant de continuer.
      </Callout>
      <Callout {...args} tone="success" title="Success">
        L'opération s'est déroulée comme prévu.
      </Callout>
      <Callout {...args} tone="danger" title="Danger">
        Quelque chose a échoué et requiert une intervention.
      </Callout>
    </div>
  ),
}

export const TitleOnly: Story = {
  name: "Title only",
  args: {
    children: undefined,
  },
  render: (args) => (
    <div className="w-[28rem]">
      <Callout {...args} />
    </div>
  ),
}

export const ContentOnly: Story = {
  name: "Content only",
  args: {
    title: undefined,
  },
  render: (args) => (
    <div className="w-[28rem]">
      <Callout {...args} />
    </div>
  ),
}

export const WithActions: Story = {
  name: "With actions",
  args: {
    tone: "warning",
    title: "Une mise à jour est disponible",
    children: "Redémarrez l'application pour appliquer la nouvelle version.",
    actions: (
      <>
        <Button variant="ghost" size="sm">
          Plus tard
        </Button>
        <Button size="sm">Redémarrer</Button>
      </>
    ),
  },
  render: (args) => (
    <div className="w-[28rem]">
      <Callout {...args} />
    </div>
  ),
}

export const CustomIcon: Story = {
  name: "Custom icon",
  args: {
    tone: "success",
    title: "Workspace prêt",
    icon: <Sparkles className="size-4" />,
    children: "Vos données ont été chargées et indexées.",
  },
  render: (args) => (
    <div className="w-[28rem]">
      <Callout {...args} />
    </div>
  ),
}

export const IconHidden: Story = {
  name: "Icon hidden",
  args: {
    tone: "info",
    title: "Sans icône",
    icon: null,
    children:
      "Passer `icon={null}` masque complètement l'icône (aria-hidden).",
  },
  render: (args) => (
    <div className="w-[28rem]">
      <Callout {...args} />
    </div>
  ),
}

export const LongContent: Story = {
  name: "Long content",
  args: {
    tone: "info",
    icon: <Rocket className="size-4" />,
    title:
      "Un titre de callout volontairement long pour vérifier le wrapping interne",
    children:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(8),
  },
  render: (args) => (
    <div className="w-[28rem]">
      <Callout {...args} />
    </div>
  ),
}
