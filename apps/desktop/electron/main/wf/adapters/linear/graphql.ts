import type {
  LinearComment,
  LinearGateway,
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
  };
};
