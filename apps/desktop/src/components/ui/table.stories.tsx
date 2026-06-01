import type { Meta, StoryObj } from "@storybook/react-vite"

import { Badge } from "./badge"
import { Checkbox } from "./checkbox"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "./table"

type Invoice = {
  id: string
  customer: string
  status: "paid" | "pending" | "overdue"
  amount: string
}

const invoices: Invoice[] = [
  { id: "INV-001", customer: "Acme Inc.", status: "paid", amount: "1 250,00 €" },
  { id: "INV-002", customer: "Globex Corp.", status: "pending", amount: "480,00 €" },
  { id: "INV-003", customer: "Initech", status: "overdue", amount: "3 200,00 €" },
  { id: "INV-004", customer: "Umbrella", status: "paid", amount: "725,50 €" },
  { id: "INV-005", customer: "Soylent", status: "pending", amount: "190,00 €" },
]

const statusTone: Record<Invoice["status"], "success" | "warning" | "danger"> = {
  paid: "success",
  pending: "warning",
  overdue: "danger",
}

const meta = {
  title: "UI/Table",
  component: Table,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Table>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div className="w-[36rem] rounded-md border">
      <Table {...args}>
        <TableHeader>
          <TableRow>
            <TableHead>Facture</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead className="text-right">Montant</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice) => (
            <TableRow key={invoice.id}>
              <TableCell className="font-mono text-xs">{invoice.id}</TableCell>
              <TableCell>{invoice.customer}</TableCell>
              <TableCell>
                <Badge tone={statusTone[invoice.status]} size="sm">
                  {invoice.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-mono text-xs">
                {invoice.amount}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  ),
}

export const WithFooter: Story = {
  name: "With footer",
  render: (args) => (
    <div className="w-[36rem] rounded-md border">
      <Table {...args}>
        <TableHeader>
          <TableRow>
            <TableHead>Facture</TableHead>
            <TableHead>Client</TableHead>
            <TableHead className="text-right">Montant</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice) => (
            <TableRow key={invoice.id}>
              <TableCell className="font-mono text-xs">{invoice.id}</TableCell>
              <TableCell>{invoice.customer}</TableCell>
              <TableCell className="text-right font-mono text-xs">
                {invoice.amount}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={2}>Total</TableCell>
            <TableCell className="text-right font-mono text-xs">
              5 845,50 €
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  ),
}

export const WithCaption: Story = {
  name: "With caption",
  render: (args) => (
    <div className="w-[36rem] rounded-md border">
      <Table {...args}>
        <TableCaption>Factures émises en mai 2026.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Facture</TableHead>
            <TableHead>Client</TableHead>
            <TableHead className="text-right">Montant</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.slice(0, 3).map((invoice) => (
            <TableRow key={invoice.id}>
              <TableCell className="font-mono text-xs">{invoice.id}</TableCell>
              <TableCell>{invoice.customer}</TableCell>
              <TableCell className="text-right font-mono text-xs">
                {invoice.amount}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  ),
}

export const SelectedRows: Story = {
  name: "Selected rows",
  render: (args) => (
    <div className="w-[36rem] rounded-md border">
      <Table {...args}>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox aria-label="Tout sélectionner" checked="indeterminate" />
            </TableHead>
            <TableHead>Facture</TableHead>
            <TableHead>Client</TableHead>
            <TableHead className="text-right">Montant</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice, index) => {
            const selected = index === 1 || index === 3
            return (
              <TableRow
                key={invoice.id}
                data-state={selected ? "selected" : undefined}
              >
                <TableCell>
                  <Checkbox
                    aria-label={`Sélectionner ${invoice.id}`}
                    defaultChecked={selected}
                  />
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {invoice.id}
                </TableCell>
                <TableCell>{invoice.customer}</TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {invoice.amount}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  ),
}

export const Empty: Story = {
  render: (args) => (
    <div className="w-[36rem] rounded-md border">
      <Table {...args}>
        <TableHeader>
          <TableRow>
            <TableHead>Facture</TableHead>
            <TableHead>Client</TableHead>
            <TableHead className="text-right">Montant</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell
              colSpan={3}
              className="py-8 text-center text-muted-foreground"
            >
              Aucune facture à afficher.
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  ),
}

export const HorizontalOverflow: Story = {
  name: "Horizontal overflow (scroll)",
  render: (args) => (
    <div className="w-80 rounded-md border">
      <Table {...args}>
        <TableHeader>
          <TableRow>
            <TableHead>Facture</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Émise le</TableHead>
            <TableHead>Échéance</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead className="text-right">Montant TTC</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice) => (
            <TableRow key={invoice.id}>
              <TableCell className="font-mono text-xs whitespace-nowrap">
                {invoice.id}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {invoice.customer}
              </TableCell>
              <TableCell className="whitespace-nowrap">2026-05-01</TableCell>
              <TableCell className="whitespace-nowrap">2026-05-31</TableCell>
              <TableCell>
                <Badge tone={statusTone[invoice.status]} size="sm">
                  {invoice.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-mono text-xs whitespace-nowrap">
                {invoice.amount}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  ),
}

export const ManyRows: Story = {
  name: "Many rows (vertical scroll)",
  render: (args) => (
    <div className="h-64 w-[36rem] overflow-hidden rounded-md border">
      <Table {...args}>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Libellé</TableHead>
            <TableHead className="text-right">Valeur</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 40 }, (_, i) => (
            <TableRow key={i}>
              <TableCell className="font-mono text-xs">{i + 1}</TableCell>
              <TableCell>Élément n°{i + 1}</TableCell>
              <TableCell className="text-right font-mono text-xs">
                {((i + 1) * 12.5).toFixed(2)} €
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  ),
}
