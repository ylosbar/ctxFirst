import type { Meta, StoryObj } from "@storybook/react-vite"
import { Inbox, Plus, RefreshCw, Users } from "lucide-react"

import { Button } from "./button"
import { EmptyState, ErrorState, LoadingState } from "./empty-state"

const meta = {
  title: "UI/EmptyState",
  component: EmptyState,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    title: { control: "text" },
    description: { control: "text" },
  },
  args: {
    icon: <Inbox className="size-6" />,
    title: "Aucun contact",
    description:
      "Importez vos contacts depuis un fichier CSV pour les voir apparaître ici.",
  },
} satisfies Meta<typeof EmptyState>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div className="flex h-64 w-full items-stretch rounded-md border">
      <EmptyState {...args} />
    </div>
  ),
}

export const TitleOnly: Story = {
  name: "Title only",
  args: {
    icon: undefined,
    description: undefined,
  },
  render: (args) => (
    <div className="flex h-64 w-full items-stretch rounded-md border">
      <EmptyState {...args} />
    </div>
  ),
}

export const WithoutIcon: Story = {
  name: "Without icon",
  args: {
    icon: undefined,
  },
  render: (args) => (
    <div className="flex h-64 w-full items-stretch rounded-md border">
      <EmptyState {...args} />
    </div>
  ),
}

export const WithActions: Story = {
  name: "With actions",
  args: {
    icon: <Users className="size-6" />,
    title: "Aucun membre dans l'équipe",
    description:
      "Invitez vos collaborateurs pour partager l'accès au workspace.",
    actions: (
      <>
        <Button variant="ghost" size="sm">
          Importer
        </Button>
        <Button size="sm">
          <Plus data-icon="inline-start" />
          Inviter
        </Button>
      </>
    ),
  },
  render: (args) => (
    <div className="flex h-64 w-full items-stretch rounded-md border">
      <EmptyState {...args} />
    </div>
  ),
}

export const Loading: Story = {
  name: "LoadingState",
  render: () => (
    <div className="flex h-64 w-full items-stretch rounded-md border">
      <LoadingState />
    </div>
  ),
}

export const LoadingCustomLabel: Story = {
  name: "LoadingState — custom label",
  render: () => (
    <div className="flex h-64 w-full items-stretch rounded-md border">
      <LoadingState label="Indexation des contacts en cours…" />
    </div>
  ),
}

export const ErrorBlock: Story = {
  name: "ErrorState — block",
  render: () => (
    <div className="flex h-64 w-full items-stretch rounded-md border">
      <ErrorState
        message="Impossible de charger les contacts depuis le serveur."
        actions={
          <Button variant="outline" size="sm">
            <RefreshCw data-icon="inline-start" />
            Réessayer
          </Button>
        }
      />
    </div>
  ),
}

export const ErrorInline: Story = {
  name: "ErrorState — inline",
  render: () => (
    <div className="w-full rounded-md border">
      <ErrorState
        variant="inline"
        message="La connexion au serveur a été perdue."
        actions={
          <Button variant="ghost" size="sm">
            Réessayer
          </Button>
        }
      />
      <div className="p-6 text-sm text-muted-foreground">
        Le bandeau d'erreur s'insère en haut d'un panneau pour signaler une
        anomalie sans masquer le contenu.
      </div>
    </div>
  ),
}

export const ErrorInlineLongMessage: Story = {
  name: "ErrorState — inline (truncate)",
  render: () => (
    <div className="w-96 rounded-md border">
      <ErrorState
        variant="inline"
        message="Un message d'erreur volontairement très long pour vérifier la troncature horizontale dans un conteneur étroit."
        actions={
          <Button variant="ghost" size="sm">
            Détails
          </Button>
        }
      />
    </div>
  ),
}
