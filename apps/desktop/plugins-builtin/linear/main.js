// Plugin entry — registers the two step runners (`linear.fetch`, `linear.split`)
// that used to live in the engine core. The runners access the engine's Linear
// gateway through `ctx.deps.linear` and the artifact store through
// `ctx.deps.artifactStore`, so no `network` permission is required: the plugin
// only contributes step logic + the `plugin:linear:Ticket@v1` artifact kind
// (declared in manifest.json under `contributions.artifactSchemas`).
//
// Plain CommonJS — no build step.

const TICKET_KIND = "plugin:linear:Ticket@v1";
const PAYLOAD_FORMAT_JSON_V1 = "json-v1";

// ---- Markdown formatter (ported from the old engine-side linear-fetch-formatter.ts) ----

const stripHtml = (s) =>
  s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');

const collapseBlankLines = (s) =>
  s.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

const cleanText = (s) => collapseBlankLines(stripHtml(s));

const headerLine = (label, value) => {
  if (!value) return null;
  return `- **${label}**: ${value}`;
};

const formatComment = (c, index) => {
  const body = cleanText(c.body);
  return [
    `### Comment #${index + 1} — ${c.author} (${c.createdAt})`,
    "",
    body || "_(empty)_",
  ].join("\n");
};

const formatLinearTicket = (t) => {
  const meta = [
    headerLine("State", t.state),
    headerLine("Priority", t.priorityLabel),
    headerLine("Assignee", t.assignee),
    headerLine("Team", t.team),
    headerLine("Labels", t.labels.length > 0 ? t.labels.join(", ") : null),
    headerLine("Created", t.createdAt),
    headerLine("Updated", t.updatedAt),
    headerLine("URL", t.url),
  ].filter((x) => x !== null);

  const description = cleanText(t.description) || "_(no description)_";

  const sections = [
    `# ${t.identifier} — ${t.title}`,
    "",
    ...meta,
    "",
    "## Description",
    "",
    description,
  ];

  if (t.comments.length > 0) {
    sections.push("", "## Comments", "");
    sections.push(t.comments.map(formatComment).join("\n\n"));
  }

  return collapseBlankLines(sections.join("\n")) + "\n";
};

// ---- shared helpers ----

// Builds the `plugin:linear:Ticket@v1` payload from a gateway `LinearTicket`.
const toTicketPayload = (ticket) => ({
  identifier: ticket.identifier,
  title: ticket.title,
  state: ticket.state,
  priority: ticket.priority,
  url: ticket.url,
  labels: [...ticket.labels],
  comments: ticket.comments.map((c) => ({
    author: c.author,
    body: c.body,
    createdAt: c.createdAt,
  })),
  renderedMarkdown: formatLinearTicket(ticket),
});

// Extracts a ticket reference out of a wired input. Accepts a `LinearRef`
// (`{ value }`-shaped, §2) or a structured Ticket (`{ identifier }`), then
// falls back to the raw `content`. Returns `null` when nothing usable is found.
const refFromInput = (input) => {
  if (!input) return null;
  const p = input.payload;
  if (p && typeof p === "object") {
    if (typeof p.value === "string" && p.value.trim()) return p.value.trim();
    if (typeof p.identifier === "string" && p.identifier.trim()) {
      return p.identifier.trim();
    }
  }
  if (typeof input.content === "string" && input.content.trim()) {
    return input.content.trim();
  }
  return null;
};

const inputOnPort = (ctx, port) =>
  ctx.inputs.find((i) => i && i.port === port);

// ---- linear.fetch runner ----

const resolveTicketRef = (ctx) => {
  const fromInput = refFromInput(ctx.inputs[0]);
  if (fromInput) return fromInput;
  const fromConfig = ctx.step.config && ctx.step.config.ticketRef;
  if (typeof fromConfig === "string" && fromConfig.trim().length > 0) {
    return fromConfig.trim();
  }
  throw new Error(
    "linear.fetch runner requires a ticket ref (input or config.ticketRef)",
  );
};

const createLinearFetchRunner = () => ({
  kind: "linear.fetch",

  resolveSpec() {
    return {
      title: "Linear Fetch",
      description:
        "Fetches a Linear ticket by reference and exposes it as a structured Ticket.",
      inputs: [
        { name: "ref", kinds: ["LinearRef"], optional: true, primary: true },
      ],
      outputs: [
        {
          name: "ticket",
          kind: TICKET_KIND,
          description: "Full structured ticket.",
          primary: true,
        },
      ],
    };
  },

  async run(ctx) {
    const ref = resolveTicketRef(ctx);
    const started = Date.now();

    const ticket = await ctx.deps.linear.fetchTicket(ref);
    const ticketPayload = toTicketPayload(ticket);

    const artifact = await ctx.deps.artifactStore.put(
      TICKET_KIND,
      JSON.stringify(ticketPayload),
      {
        provider: "linear",
        identifier: ticket.identifier,
        url: ticket.url,
        state: ticket.state,
        priority: String(ticket.priority),
        commentCount: String(ticket.comments.length),
        labels: ticket.labels.join(","),
        latencyMs: String(Date.now() - started),
        payloadFormat: PAYLOAD_FORMAT_JSON_V1,
      },
    );

    return { kind: "produced", artifact };
  },
});

// ---- linear.set-status runner ----

// Pulls the target status string out of the `status` port (a Markdown
// `{ body }` payload, a `{ value }`-shaped scalar, or the raw `content`),
// falling back to `config.status`.
const resolveTargetStatus = (ctx) => {
  const input = inputOnPort(ctx, "status");
  if (input) {
    const p = input.payload;
    if (p && typeof p === "object") {
      if (typeof p.body === "string" && p.body.trim()) return p.body.trim();
      if (typeof p.value === "string" && p.value.trim()) return p.value.trim();
    }
    if (typeof input.content === "string" && input.content.trim()) {
      return input.content.trim();
    }
  }
  const fromConfig = ctx.step.config && ctx.step.config.status;
  if (typeof fromConfig === "string" && fromConfig.trim().length > 0) {
    return fromConfig.trim();
  }
  throw new Error(
    "linear.set-status runner requires a target status (input `status` or config.status)",
  );
};

const resolveSetStatusRef = (ctx) => {
  // Prefer the `ref` port; otherwise the first non-`status` input (covers
  // unnamed single inputs without grabbing the status payload).
  const refInput =
    inputOnPort(ctx, "ref") ?? ctx.inputs.find((i) => i && i.port !== "status");
  const fromInput = refFromInput(refInput);
  if (fromInput) return fromInput;
  const fromConfig = ctx.step.config && ctx.step.config.ticketRef;
  if (typeof fromConfig === "string" && fromConfig.trim().length > 0) {
    return fromConfig.trim();
  }
  throw new Error(
    "linear.set-status runner requires a ticket ref (input `ref` or config.ticketRef)",
  );
};

const createLinearSetStatusRunner = () => ({
  kind: "linear.set-status",

  resolveSpec() {
    return {
      title: "Linear Set Status",
      description:
        "Moves a Linear ticket to a new workflow state (status given as a string) and re-emits the updated Ticket.",
      inputs: [
        {
          name: "ref",
          kinds: ["LinearRef", TICKET_KIND],
          optional: true,
          primary: true,
        },
        { name: "status", kinds: ["Markdown", "Text"], optional: true },
      ],
      outputs: [
        {
          name: "ticket",
          kind: TICKET_KIND,
          description: "Updated ticket after the status change.",
          primary: true,
        },
      ],
    };
  },

  async run(ctx) {
    const ref = resolveSetStatusRef(ctx);
    const status = resolveTargetStatus(ctx);
    const started = Date.now();

    const ticket = await ctx.deps.linear.setTicketStatus(ref, status);
    const ticketPayload = toTicketPayload(ticket);

    const artifact = await ctx.deps.artifactStore.put(
      TICKET_KIND,
      JSON.stringify(ticketPayload),
      {
        provider: "linear",
        identifier: ticket.identifier,
        url: ticket.url,
        state: ticket.state,
        requestedStatus: status,
        priority: String(ticket.priority),
        commentCount: String(ticket.comments.length),
        labels: ticket.labels.join(","),
        latencyMs: String(Date.now() - started),
        payloadFormat: PAYLOAD_FORMAT_JSON_V1,
      },
    );

    return { kind: "produced", artifact };
  },
});

// ---- linear.split runner ----

const createLinearSplitRunner = () => ({
  kind: "linear.split",

  resolveSpec() {
    return {
      title: "Linear Split",
      description:
        "Projects a Linear Ticket into its title and description as standalone Markdown artifacts.",
      inputs: [
        {
          name: "ticket",
          kinds: [TICKET_KIND],
          optional: false,
          primary: true,
        },
      ],
      outputs: [
        {
          name: "title",
          kind: "Markdown",
          description: "Ticket title as Markdown.",
        },
        {
          name: "description",
          kind: "Markdown",
          description: "Ticket description (rendered body) as Markdown.",
          primary: true,
        },
      ],
    };
  },

  async run(ctx) {
    const input = ctx.inputs[0];
    if (!input) {
      throw new Error(
        "linear.split runner requires a Linear Ticket input on port `ticket`",
      );
    }
    if (input.kind !== TICKET_KIND) {
      throw new Error(
        `linear.split runner expects a ${TICKET_KIND} input, got ${input.kind}`,
      );
    }
    // The orchestrator parses the payload upstream (strict mode); in
    // log-only / off modes `payload` may be null and we fall back to JSON.
    let payload = input.payload;
    if (!payload) {
      try {
        payload = JSON.parse(input.content);
      } catch (err) {
        throw new Error(
          `linear.split runner could not parse the Linear Ticket payload: ${err && err.message ? err.message : String(err)}`,
        );
      }
    }

    const commonMeta = {
      provider: "linear",
      identifier: payload.identifier,
      url: payload.url,
    };

    const titleArtifact = await ctx.deps.artifactStore.put(
      "Markdown",
      JSON.stringify({ format: "markdown", body: payload.title }),
      { ...commonMeta, slot: "title", payloadFormat: PAYLOAD_FORMAT_JSON_V1 },
    );

    const descriptionArtifact = await ctx.deps.artifactStore.put(
      "Markdown",
      JSON.stringify({ format: "markdown", body: payload.renderedMarkdown }),
      {
        ...commonMeta,
        slot: "description",
        payloadFormat: PAYLOAD_FORMAT_JSON_V1,
      },
    );

    return {
      kind: "produced-many",
      artifacts: [
        { port: "title", artifact: titleArtifact },
        { port: "description", artifact: descriptionArtifact },
      ],
    };
  },
});

// ---- onload ----

exports.onload = async (api) => {
  api.registerStepRunner(createLinearFetchRunner());
  api.registerStepRunner(createLinearSplitRunner());
  api.registerStepRunner(createLinearSetStatusRunner());
  api.log.info(
    `loaded — runners=[linear.fetch, linear.split, linear.set-status], kind=${TICKET_KIND}`,
  );
};

exports.onunload = (api) => {
  api.log.info("unloading");
};

// Exported for direct unit tests.
exports.formatLinearTicket = formatLinearTicket;
exports.createLinearFetchRunner = createLinearFetchRunner;
exports.createLinearSplitRunner = createLinearSplitRunner;
exports.createLinearSetStatusRunner = createLinearSetStatusRunner;
exports.TICKET_KIND = TICKET_KIND;
