import type { Meta, StoryObj } from "@storybook/react-vite"
import { Info, Settings } from "lucide-react"

import { Button } from "./button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip"

const meta = {
  title: "UI/Tooltip",
  component: TooltipContent,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <TooltipProvider delay={0}>
        <Story />
      </TooltipProvider>
    ),
  ],
  argTypes: {
    side: {
      control: "inline-radio",
      options: ["top", "right", "bottom", "left"],
    },
    align: {
      control: "inline-radio",
      options: ["start", "center", "end"],
    },
    sideOffset: { control: "number" },
    alignOffset: { control: "number" },
    children: { control: "text" },
  },
  args: {
    side: "top",
    align: "center",
    sideOffset: 4,
    alignOffset: 0,
    children: "Tooltip content",
  },
} satisfies Meta<typeof TooltipContent>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="outline" size="sm">
            Hover me
          </Button>
        }
      />
      <TooltipContent {...args} />
    </Tooltip>
  ),
}

export const Sides: Story = {
  render: (args) => (
    <div className="grid grid-cols-2 gap-12">
      {(["top", "right", "bottom", "left"] as const).map((side) => (
        <Tooltip key={side} defaultOpen>
          <TooltipTrigger
            render={
              <Button variant="outline" size="sm">
                {side}
              </Button>
            }
          />
          <TooltipContent {...args} side={side}>
            {`side="${side}"`}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  ),
}

export const Alignments: Story = {
  render: (args) => (
    <div className="flex flex-col gap-12">
      {(["start", "center", "end"] as const).map((align) => (
        <Tooltip key={align} defaultOpen>
          <TooltipTrigger
            render={
              <Button variant="outline" size="sm" className="w-48">
                {`align=${align}`}
              </Button>
            }
          />
          <TooltipContent {...args} align={align}>
            {`align="${align}"`}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  ),
}

export const OnIconButton: Story = {
  name: "On icon button",
  render: (args) => (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Paramètres"
          >
            <Settings />
          </Button>
        }
      />
      <TooltipContent {...args}>Paramètres</TooltipContent>
    </Tooltip>
  ),
}

export const RichContent: Story = {
  name: "Rich content",
  render: (args) => (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="outline" size="sm">
            <Info data-icon="inline-start" />
            En savoir plus
          </Button>
        }
      />
      <TooltipContent {...args}>
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">Synchronisation</span>
          <span className="opacity-80">
            Dernière mise à jour il y a 3 minutes.
          </span>
        </span>
      </TooltipContent>
    </Tooltip>
  ),
}

export const LongContent: Story = {
  name: "Long content (max-width)",
  args: {
    children:
      "Un contenu de tooltip volontairement long pour vérifier que la largeur maximale (max-w-xs) déclenche bien le retour à la ligne plutôt qu'un débordement horizontal.",
  },
  render: (args) => (
    <Tooltip defaultOpen>
      <TooltipTrigger
        render={
          <Button variant="outline" size="sm">
            Hover
          </Button>
        }
      />
      <TooltipContent {...args} />
    </Tooltip>
  ),
}

export const Controlled: Story = {
  name: "Controlled (defaultOpen)",
  render: (args) => (
    <Tooltip defaultOpen>
      <TooltipTrigger
        render={
          <Button variant="outline" size="sm">
            Toujours ouvert au mount
          </Button>
        }
      />
      <TooltipContent {...args}>Ouvert par défaut</TooltipContent>
    </Tooltip>
  ),
}
