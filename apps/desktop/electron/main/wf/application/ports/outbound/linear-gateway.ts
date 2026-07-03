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
 * Raw bytes of an image embedded in a ticket, downloaded from its source URL.
 * Kept encoding-agnostic for the domain: the adapter downloads the bytes and
 * returns them base64-encoded (the artifact store is text-only), together with
 * the server-reported MIME type.
 */
export type LinearImage = {
  /** Source URL the bytes were fetched from (typically `uploads.linear.app`). */
  url: string;
  /** Server-reported MIME type, e.g. `"image/png"`. `null` when unknown. */
  mimeType: string | null;
  /** Base64-encoded image bytes. */
  dataBase64: string;
  /** Decoded byte length — handy for downstream size budgeting. */
  byteLength: number;
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

  /**
   * Posts a Markdown comment in a ticket's native comment thread. `ref` is the
   * human identifier (`"ENG-123"`) or UUID; `body` is Markdown. Returns the
   * refreshed ticket snapshot, whose `comments` now include the new entry.
   * Rejects on auth/network failure, unknown ticket, or an empty body.
   */
  addComment(ref: string, body: string): Promise<LinearTicket>;

  /**
   * Fetches the `limit` most-recently-created tickets currently sitting in a
   * Triage workflow state (matched by the canonical `triage` state *type*, so
   * it spans every team regardless of the state's display name). Results are
   * ordered newest-first by creation date. `limit` is clamped to `[1, 250]`.
   * Rejects on auth/network failure.
   */
  fetchTriageTickets(limit: number): Promise<ReadonlyArray<LinearTicket>>;

  /**
   * Downloads the raw bytes of an image referenced by a ticket. `uploads.linear.app`
   * assets sit behind the API key, so the adapter attaches the Linear
   * `Authorization` header for Linear-hosted URLs and fetches external URLs
   * anonymously. Returns the bytes base64-encoded plus the reported MIME type.
   * Rejects on invalid URL, HTTP error or network failure — callers decide
   * whether to skip the image or fail the step.
   */
  fetchImage(url: string): Promise<LinearImage>;
}
