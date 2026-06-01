import type { Meta, StoryObj } from "@storybook/react-vite"
import { MoreHorizontal } from "lucide-react"

import { Button } from "./button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card"

const meta = {
  title: "UI/Card",
  component: Card,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: "inline-radio",
      options: ["default", "sm"],
    },
    tone: {
      control: "inline-radio",
      options: ["default", "muted"],
    },
  },
  args: {
    size: "default",
    tone: "default",
  },
} satisfies Meta<typeof Card>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <Card {...args} className="w-80">
      <CardHeader>
        <CardTitle>Statistiques de campagne</CardTitle>
        <CardDescription>
          Vue d'ensemble des performances de la dernière campagne envoyée.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p>Taux d'ouverture moyen : 42 %.</p>
      </CardContent>
    </Card>
  ),
}

export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-start gap-4">
      <Card {...args} size="default" className="w-72">
        <CardHeader>
          <CardTitle>Taille « default »</CardTitle>
          <CardDescription>Padding et gap standards.</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Contenu de la carte.</p>
        </CardContent>
      </Card>
      <Card {...args} size="sm" className="w-72">
        <CardHeader>
          <CardTitle>Taille « sm »</CardTitle>
          <CardDescription>Padding et gap compacts.</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Contenu de la carte.</p>
        </CardContent>
      </Card>
    </div>
  ),
}

export const Tones: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-start gap-4">
      <Card {...args} tone="default" className="w-72">
        <CardHeader>
          <CardTitle>Tone « default »</CardTitle>
          <CardDescription>Surface principale.</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Contenu de la carte.</p>
        </CardContent>
      </Card>
      <Card {...args} tone="muted" className="w-72">
        <CardHeader>
          <CardTitle>Tone « muted »</CardTitle>
          <CardDescription>
            Surface secondaire pour les blocs d'information moins prominents.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>Contenu de la carte.</p>
        </CardContent>
      </Card>
    </div>
  ),
}

export const TitleOnly: Story = {
  name: "Title only",
  render: (args) => (
    <Card {...args} className="w-80">
      <CardHeader>
        <CardTitle>Carte sans description</CardTitle>
      </CardHeader>
      <CardContent>
        <p>Une carte qui n'a qu'un titre dans son en-tête.</p>
      </CardContent>
    </Card>
  ),
}

export const WithAction: Story = {
  name: "With header action",
  render: (args) => (
    <Card {...args} className="w-80">
      <CardHeader>
        <CardTitle>Liste de contacts</CardTitle>
        <CardDescription>
          12 contacts importés depuis le dernier fichier CSV.
        </CardDescription>
        <CardAction>
          <Button variant="ghost" size="icon-sm" aria-label="Plus d'options">
            <MoreHorizontal />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p>Dernière synchronisation il y a 3 minutes.</p>
      </CardContent>
    </Card>
  ),
}

export const WithFooter: Story = {
  name: "With footer",
  render: (args) => (
    <Card {...args} className="w-80">
      <CardHeader>
        <CardTitle>Supprimer le workspace</CardTitle>
        <CardDescription>
          Cette action est irréversible. Toutes les données associées seront
          détruites.
        </CardDescription>
      </CardHeader>
      <CardFooter className="justify-end gap-2">
        <Button variant="ghost" size="sm">
          Annuler
        </Button>
        <Button variant="destructive" size="sm">
          Supprimer
        </Button>
      </CardFooter>
    </Card>
  ),
}

export const ContentOnly: Story = {
  name: "Content only",
  render: (args) => (
    <Card {...args} className="w-80">
      <CardContent>
        <p>
          Une carte qui se résume à un bloc de contenu, sans en-tête ni
          footer.
        </p>
      </CardContent>
    </Card>
  ),
}

export const LongContent: Story = {
  name: "Long content (overflow)",
  render: (args) => (
    <Card {...args} className="w-80">
      <CardHeader>
        <CardTitle>
          Un titre relativement long pour vérifier le wrapping interne
        </CardTitle>
        <CardDescription>
          Une description elle aussi suffisamment longue pour s'étaler sur
          plusieurs lignes et observer le rendu typographique dans une carte
          contrainte en largeur.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p>
          {"Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(
            8,
          )}
        </p>
      </CardContent>
    </Card>
  ),
}
