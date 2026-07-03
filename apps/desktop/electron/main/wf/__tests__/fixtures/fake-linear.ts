import type {
  LinearGateway,
  LinearImage,
  LinearTicket,
} from "../../application/ports/outbound/linear-gateway";

export type FakeLinearGateway = LinearGateway & {
  /** Pre-populate a ticket reachable by ref. */
  setTicket(ref: string, ticket: LinearTicket): void;
  /** Make fetchTicket throw a specific error for `ref`. */
  setError(ref: string, error: Error): void;
  /** Seed the (already newest-first) triage backlog for `fetchTriageTickets`. */
  setTriageTickets(tickets: ReadonlyArray<LinearTicket>): void;
  /** Pre-populate the bytes returned by `fetchImage` for `url`. */
  setImage(url: string, image: LinearImage): void;
  readonly fetches: ReadonlyArray<string>;
  /** Records of `setTicketStatus` calls, in order. */
  readonly statusUpdates: ReadonlyArray<{ ref: string; status: string }>;
  /** Records of `addComment` calls, in order. */
  readonly commentPosts: ReadonlyArray<{ ref: string; body: string }>;
  /** Records of `fetchTriageTickets` limits requested, in order. */
  readonly triageFetches: ReadonlyArray<number>;
  /** Records of `fetchImage` URLs requested, in order. */
  readonly imageFetches: ReadonlyArray<string>;
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
  const commentPosts: { ref: string; body: string }[] = [];
  let triage: LinearTicket[] = [];
  const triageFetches: number[] = [];
  const images = new Map<string, LinearImage>();
  const imageFetches: string[] = [];

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
    async addComment(ref, body) {
      commentPosts.push({ ref, body });
      const err = errors.get(ref);
      if (err) throw err;
      const t = tickets.get(ref);
      if (!t) throw new Error(`[fake-linear] no ticket configured for ${ref}`);
      const updated = {
        ...t,
        comments: [
          ...t.comments,
          { author: "workflow", body, createdAt: "2026-01-01T00:00:00.000Z" },
        ],
      };
      tickets.set(ref, updated);
      return updated;
    },
    async fetchTriageTickets(limit) {
      triageFetches.push(limit);
      const capped = Number.isFinite(limit)
        ? Math.min(Math.max(Math.trunc(limit), 1), 250)
        : 10;
      return triage.slice(0, capped);
    },
    async fetchImage(url) {
      imageFetches.push(url);
      const img = images.get(url);
      if (!img) throw new Error(`[fake-linear] no image configured for ${url}`);
      return img;
    },
    setTicket(ref, ticket) {
      tickets.set(ref, ticket.identifier === ref ? ticket : { ...ticket, identifier: ref });
    },
    setError(ref, error) {
      errors.set(ref, error);
    },
    setTriageTickets(list) {
      triage = [...list];
    },
    setImage(url, image) {
      images.set(url, image);
    },
    get fetches() {
      return fetches;
    },
    get statusUpdates() {
      return statusUpdates;
    },
    get commentPosts() {
      return commentPosts;
    },
    get triageFetches() {
      return triageFetches;
    },
    get imageFetches() {
      return imageFetches;
    },
    reset() {
      tickets.clear();
      errors.clear();
      fetches.length = 0;
      statusUpdates.length = 0;
      commentPosts.length = 0;
      triage = [];
      triageFetches.length = 0;
      images.clear();
      imageFetches.length = 0;
    },
  };
};

export const buildLinearTicket = buildTicket;
