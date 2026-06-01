import type {
  LinearGateway,
  LinearTicket,
} from "../../application/ports/outbound/linear-gateway";

export type FakeLinearGateway = LinearGateway & {
  /** Pre-populate a ticket reachable by ref. */
  setTicket(ref: string, ticket: LinearTicket): void;
  /** Make fetchTicket throw a specific error for `ref`. */
  setError(ref: string, error: Error): void;
  readonly fetches: ReadonlyArray<string>;
  /** Records of `setTicketStatus` calls, in order. */
  readonly statusUpdates: ReadonlyArray<{ ref: string; status: string }>;
  reset(): void;
};

const buildTicket = (ref: string, over: Partial<LinearTicket> = {}): LinearTicket => ({
  identifier: ref,
  title: over.title ?? `Ticket ${ref}`,
  description: over.description ?? "",
  state: over.state ?? "Backlog",
  priority: over.priority ?? 0,
  priorityLabel: over.priorityLabel ?? "No priority",
  assignee: over.assignee ?? null,
  team: over.team ?? null,
  labels: over.labels ?? [],
  url: over.url ?? `https://linear.app/test/${ref}`,
  createdAt: over.createdAt ?? "2026-01-01T00:00:00.000Z",
  updatedAt: over.updatedAt ?? "2026-01-01T00:00:00.000Z",
  comments: over.comments ?? [],
});

export const createFakeLinearGateway = (): FakeLinearGateway => {
  const tickets = new Map<string, LinearTicket>();
  const errors = new Map<string, Error>();
  const fetches: string[] = [];
  const statusUpdates: { ref: string; status: string }[] = [];

  return {
    async fetchTicket(ref) {
      fetches.push(ref);
      const err = errors.get(ref);
      if (err) throw err;
      const t = tickets.get(ref);
      if (!t) throw new Error(`[fake-linear] no ticket configured for ${ref}`);
      return t;
    },
    async setTicketStatus(ref, status) {
      statusUpdates.push({ ref, status });
      const err = errors.get(ref);
      if (err) throw err;
      const t = tickets.get(ref);
      if (!t) throw new Error(`[fake-linear] no ticket configured for ${ref}`);
      const updated = { ...t, state: status };
      tickets.set(ref, updated);
      return updated;
    },
    setTicket(ref, ticket) {
      tickets.set(ref, ticket.identifier === ref ? ticket : { ...ticket, identifier: ref });
    },
    setError(ref, error) {
      errors.set(ref, error);
    },
    get fetches() {
      return fetches;
    },
    get statusUpdates() {
      return statusUpdates;
    },
    reset() {
      tickets.clear();
      errors.clear();
      fetches.length = 0;
      statusUpdates.length = 0;
    },
  };
};

export const buildLinearTicket = buildTicket;
