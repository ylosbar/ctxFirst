import type {
  LinearComment,
  LinearGateway,
  LinearImage,
  LinearTicket,
} from "../../application/ports/outbound/linear-gateway";

type Deps = {
  /** Linear API key. Defaults to `process.env.LINEAR_API_KEY`. */
  apiKey?: string;
  /**
   * Resolves the Linear API key at call time. Takes precedence over
   * `apiKey` and the `LINEAR_API_KEY` env var. Returning `null`/`undefined`
   * lets the resolution fall through to those defaults.
   */
  getApiKey?: () => string | null | undefined;
  /** Override endpoint (mainly for tests). */
  endpoint?: string;
};

const DEFAULT_ENDPOINT = "https://api.linear.app/graphql";

// Images dropped into a Linear description are uploaded to this host and served
// behind the workspace API key; other hosts (external `![](…)` links) are public.
const isLinearUploadUrl = (host: string): boolean =>
  host === "uploads.linear.app" || host.endsWith(".linear.app");

const PRIORITY_LABELS = ["No priority", "Urgent", "High", "Medium", "Low"];

// Shared issue selection — reused by the read query and the update mutation so
// both produce the same {@link IssueNode} shape consumed by `mapIssue`.
const ISSUE_FIELDS = `
    id
    identifier
    title
    description
    url
    priority
    createdAt
    updatedAt
    state { name }
    assignee { name }
    team { name }
    labels(first: 50) { nodes { name } }
    comments(first: 100) {
      nodes {
        body
        createdAt
        user { name }
      }
    }
`;

const ISSUE_QUERY = `
  query Issue($id: String!) {
    issue(id: $id) {
${ISSUE_FIELDS}
    }
  }
`;

// Resolves a ticket's internal UUID plus the full list of workflow states of
// its team, so we can translate a human status name into the `stateId` the
// mutation expects.
const ISSUE_STATES_QUERY = `
  query IssueStates($id: String!) {
    issue(id: $id) {
      id
      team {
        states(first: 250) {
          nodes { id name }
        }
      }
    }
  }
`;

const ISSUE_UPDATE_MUTATION = `
  mutation IssueSetState($id: String!, $stateId: String!) {
    issueUpdate(id: $id, input: { stateId: $stateId }) {
      success
      issue {
${ISSUE_FIELDS}
      }
    }
  }
`;

// Resolves a ticket's internal UUID from a human identifier, since
// `commentCreate` expects the issue's UUID in `issueId`.
const ISSUE_ID_QUERY = `
  query IssueId($id: String!) {
    issue(id: $id) { id }
  }
`;

// Posts a comment and re-reads the mutated issue (its `comments` now include
// the new entry) so the caller gets a refreshed {@link LinearTicket}.
const COMMENT_CREATE_MUTATION = `
  mutation CommentCreate($issueId: String!, $body: String!) {
    commentCreate(input: { issueId: $issueId, body: $body }) {
      success
      comment {
        id
        issue {
${ISSUE_FIELDS}
        }
      }
    }
  }
`;

// Newest-first tickets sitting in a Triage state. Filtering on the canonical
// `triage` state *type* (rather than a display name) matches every team's
// triage column regardless of how it's labelled. `orderBy: createdAt` returns
// them in descending order (Linear's default direction).
const TRIAGE_ISSUES_QUERY = `
  query TriageIssues($limit: Int!) {
    issues(
      first: $limit
      filter: { state: { type: { eq: "triage" } } }
      orderBy: createdAt
    ) {
      nodes {
${ISSUE_FIELDS}
      }
    }
  }
`;

// Linear caps a single page at 250 issues; keep the request inside that bound
// and always ask for at least one.
const clampLimit = (limit: number): number =>
  Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 250) : 10;

type CommentNode = {
  body: string;
  createdAt: string;
  user: { name: string } | null;
};

type IssueNode = {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  priority: number | null;
  createdAt: string;
  updatedAt: string;
  state: { name: string } | null;
  assignee: { name: string } | null;
  team: { name: string } | null;
  labels: { nodes: ReadonlyArray<{ name: string }> };
  comments: { nodes: ReadonlyArray<CommentNode> };
};

type WorkflowStateNode = { id: string; name: string };

type GraphqlResponse<T> = {
  data?: T;
  errors?: ReadonlyArray<{ message: string }>;
};

const toComment = (n: CommentNode): LinearComment => ({
  author: n.user?.name ?? "Unknown",
  body: n.body,
  createdAt: n.createdAt,
});

const mapIssue = (issue: IssueNode): LinearTicket => {
  const priority = issue.priority ?? 0;
  return {
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description ?? "",
    state: issue.state?.name ?? "Unknown",
    priority,
    priorityLabel: PRIORITY_LABELS[priority] ?? "No priority",
    assignee: issue.assignee?.name ?? null,
    team: issue.team?.name ?? null,
    labels: issue.labels.nodes.map((n) => n.name),
    url: issue.url,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    comments: issue.comments.nodes.map(toComment),
  };
};

export const createLinearGraphqlGateway = (deps: Deps = {}): LinearGateway => {
  const endpoint = deps.endpoint ?? DEFAULT_ENDPOINT;

  const resolveApiKey = (): string => {
    const apiKey =
      deps.getApiKey?.() ?? deps.apiKey ?? process.env.LINEAR_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Linear API key is not set — cannot call the Linear API. " +
          "Configure it in the desktop app's Settings page (or set " +
          "LINEAR_API_KEY in the environment).",
      );
    }
    return apiKey;
  };

  const callGraphql = async <T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> => {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: resolveApiKey(),
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Linear API HTTP ${res.status}: ${text.slice(0, 500)}`);
    }

    const json = (await res.json()) as GraphqlResponse<T>;
    if (json.errors && json.errors.length > 0) {
      throw new Error(
        `Linear GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`,
      );
    }
    if (json.data === undefined) {
      throw new Error("Linear API returned no data");
    }
    return json.data;
  };

  return {
    async fetchTicket(ref: string): Promise<LinearTicket> {
      const trimmed = ref.trim();
      if (!trimmed) throw new Error("linear.fetch: empty ticket ref");

      const data = await callGraphql<{ issue: IssueNode | null }>(ISSUE_QUERY, {
        id: trimmed,
      });
      const issue = data.issue;
      if (!issue) throw new Error(`Linear ticket not found: ${trimmed}`);
      return mapIssue(issue);
    },

    async setTicketStatus(ref: string, status: string): Promise<LinearTicket> {
      const trimmedRef = ref.trim();
      if (!trimmedRef) throw new Error("linear.set-status: empty ticket ref");
      const trimmedStatus = status.trim();
      if (!trimmedStatus) {
        throw new Error("linear.set-status: empty target status");
      }

      const data = await callGraphql<{
        issue: { id: string; team: { states: { nodes: ReadonlyArray<WorkflowStateNode> } } | null } | null;
      }>(ISSUE_STATES_QUERY, { id: trimmedRef });

      const issue = data.issue;
      if (!issue) throw new Error(`Linear ticket not found: ${trimmedRef}`);
      const states = issue.team?.states.nodes ?? [];
      const target = states.find(
        (s) => s.name.toLowerCase() === trimmedStatus.toLowerCase(),
      );
      if (!target) {
        const available = states.map((s) => s.name).join(", ") || "(none)";
        throw new Error(
          `Linear ticket ${trimmedRef}: no workflow state named "${trimmedStatus}". ` +
            `Available states: ${available}.`,
        );
      }

      const result = await callGraphql<{
        issueUpdate: { success: boolean; issue: IssueNode | null };
      }>(ISSUE_UPDATE_MUTATION, { id: issue.id, stateId: target.id });

      if (!result.issueUpdate.success || !result.issueUpdate.issue) {
        throw new Error(
          `Linear API rejected the status update for ${trimmedRef}`,
        );
      }
      return mapIssue(result.issueUpdate.issue);
    },

    async addComment(ref: string, body: string): Promise<LinearTicket> {
      const trimmedRef = ref.trim();
      if (!trimmedRef) throw new Error("linear.comment: empty ticket ref");
      const trimmedBody = body.trim();
      if (!trimmedBody) throw new Error("linear.comment: empty comment body");

      // `commentCreate` keys on the issue UUID, so resolve it from the ref first.
      const found = await callGraphql<{ issue: { id: string } | null }>(
        ISSUE_ID_QUERY,
        { id: trimmedRef },
      );
      const issue = found.issue;
      if (!issue) throw new Error(`Linear ticket not found: ${trimmedRef}`);

      const result = await callGraphql<{
        commentCreate: {
          success: boolean;
          comment: { issue: IssueNode | null } | null;
        };
      }>(COMMENT_CREATE_MUTATION, { issueId: issue.id, body: trimmedBody });

      if (!result.commentCreate.success || !result.commentCreate.comment?.issue) {
        throw new Error(`Linear API rejected the comment for ${trimmedRef}`);
      }
      return mapIssue(result.commentCreate.comment.issue);
    },

    async fetchTriageTickets(
      limit: number,
    ): Promise<ReadonlyArray<LinearTicket>> {
      const capped = clampLimit(limit);
      const data = await callGraphql<{
        issues: { nodes: ReadonlyArray<IssueNode> };
      }>(TRIAGE_ISSUES_QUERY, { limit: capped });

      const nodes = data.issues?.nodes ?? [];
      // Defensive re-sort: guarantee a deterministic newest-first order for the
      // emitted array even if the API's default direction ever changes.
      return nodes
        .map(mapIssue)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
        .slice(0, capped);
    },

    async fetchImage(url: string): Promise<LinearImage> {
      const trimmed = url.trim();
      if (!trimmed) throw new Error("linear.fetchImage: empty image URL");

      let parsed: URL;
      try {
        parsed = new URL(trimmed);
      } catch {
        throw new Error(`linear.fetchImage: invalid image URL "${trimmed}"`);
      }

      // Attach the API key only for Linear-hosted uploads; external images are
      // fetched anonymously (sending the key to a third-party host would leak it).
      const headers: Record<string, string> = {};
      if (isLinearUploadUrl(parsed.host)) {
        headers.Authorization = resolveApiKey();
      }

      const res = await fetch(trimmed, { headers });
      if (!res.ok) {
        throw new Error(
          `Linear image download HTTP ${res.status} for ${trimmed}`,
        );
      }

      const contentType = res.headers.get("content-type");
      const mimeType = contentType
        ? (contentType.split(";")[0]?.trim() ?? null) || null
        : null;
      const bytes = Buffer.from(await res.arrayBuffer());
      return {
        url: trimmed,
        mimeType,
        dataBase64: bytes.toString("base64"),
        byteLength: bytes.length,
      };
    },
  };
};
