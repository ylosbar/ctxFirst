/**
 * Port abstracting an external issue tracker (Linear). The domain only
 * manipulates the structured DTO returned here; the adapter is free to use
 * the Linear SDK, raw GraphQL or a fake.
 *
 * Implementations:
 *  - {@link createLinearGraphqlGateway} (HTTPS GraphQL, requires LINEAR_API_KEY)
 *  - {@link createFakeLinearGateway}    (deterministic fake for dev/tests)
 */

export type LinearComment = {
  author: string;
  body: string;
  createdAt: string;
};

/**
 * Structured snapshot of a Linear issue at fetch time. Free of HTML, JSX or
 * other host-specific encodings — the formatter turns this into clean
 * Markdown for the artifact store.
 */
export type LinearTicket = {
  /** Human-readable identifier, e.g. `"ENG-123"`. */
  identifier: string;
  title: string;
  /** Markdown description as stored on Linear; may be empty. */
  description: string;
  state: string;
  priority: number;
  priorityLabel: string;
  assignee: string | null;
  team: string | null;
  labels: ReadonlyArray<string>;
  url: string;
  createdAt: string;
  updatedAt: string;
  comments: ReadonlyArray<LinearComment>;
};

export interface LinearGateway {
  /**
   * Fetches a ticket by its human identifier (`"ENG-123"`) or its UUID.
   * Rejects with a descriptive error on auth failure, network failure or
   * unknown ticket.
   */
  fetchTicket(ref: string): Promise<LinearTicket>;

  /**
   * Moves a ticket to a new workflow state, identified by its display name
   * (`"In Progress"`, `"Done"`, …; case-insensitive). Returns the refreshed
   * ticket snapshot. Rejects on auth/network failure, unknown ticket, or when
   * the team has no workflow state matching `status`.
   */
  setTicketStatus(ref: string, status: string): Promise<LinearTicket>;
}
