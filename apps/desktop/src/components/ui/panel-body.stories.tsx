import type { Meta, StoryObj } from "@storybook/react-vite"

import { PanelBody } from "./panel-body"

const Header = ({ children }: { children: React.ReactNode }) => (
  <h2 className="border-b px-3 py-2 text-sm font-semibold text-foreground">
    {children}
  </h2>
)

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-64 w-full flex-col overflow-hidden rounded-md border bg-background">
    {children}
  </div>
)

const Filler = () => (
  <p className="text-sm text-muted-foreground">
    Contenu du panneau. Le header au-dessus touche les bords (border-b pleine
    largeur), tandis que ce corps porte le padding de contenu.
  </p>
)

const meta = {
  title: "UI/PanelBody",
  component: PanelBody,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    padding: {
      control: "inline-radio",
      options: ["none", "sm", "default", "lg"],
    },
  },
  args: {
    padding: "default",
  },
} satisfies Meta<typeof PanelBody>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <Frame>
      <Header>Chronologie des étapes</Header>
      <PanelBody {...args}>
        <Filler />
      </PanelBody>
    </Frame>
  ),
}

export const Paddings: Story = {
  render: (args) => (
    <div className="flex flex-col gap-4">
      {(["none", "sm", "default", "lg"] as const).map((padding) => (
        <Frame key={padding}>
          <Header>padding=&quot;{padding}&quot;</Header>
          <PanelBody {...args} padding={padding}>
            <Filler />
          </PanelBody>
        </Frame>
      ))}
    </div>
  ),
}

export const Scrolling: Story = {
  name: "Overflow (scroll)",
  render: (args) => (
    <Frame>
      <Header>Header collant en haut</Header>
      <PanelBody {...args}>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 24 }, (_, i) => (
            <p key={i} className="text-sm text-muted-foreground">
              Ligne {i + 1} — le corps déborde et défile, le header reste fixe.
            </p>
          ))}
        </div>
      </PanelBody>
    </Frame>
  ),
}
