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
    // A `Json` envelope (`{ format: "json", body }`) — e.g. a triage item kept
    // by a `linear.triage.fetch → json.transform` chain — carries the ticket(s)
    // as a JSON string in `body`. Dig out the first item's `identifier` so the
    // extracted ticket can feed the ref port directly, without a LinearRef
    // projection in between.
    if (typeof p.body === "string" && p.body.trim()) {
      try {
        const parsed = JSON.parse(p.body);
        const item = Array.isArray(parsed) ? parsed[0] : parsed;
        if (
          item &&
          typeof item === "object" &&
          typeof item.identifier === "string" &&
          item.identifier.trim()
        ) {
          return item.identifier.trim();
        }
      } catch {
        // Not parseable JSON — fall through to the raw-content fallback.
      }
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
          // `Json` lets an extracted triage item (`linear.triage.fetch →
          // json.transform`) feed the ref directly; `refFromInput` digs the
          // `identifier` out of its `{ format:"json", body }` envelope.
          name: "ref",
          kinds: ["LinearRef", TICKET_KIND, "Json"],
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

// ---- linear.comment runner ----

// Resolves the ticket ref for a comment: the `ref` port, else the first
// non-`body` input (so an unnamed single ref input isn't mistaken for the
// body), else config.ticketRef. Mirrors `resolveSetStatusRef`.
const resolveCommentRef = (ctx) => {
  const refInput =
    inputOnPort(ctx, "ref") ?? ctx.inputs.find((i) => i && i.port !== "body");
  const fromInput = refFromInput(refInput);
  if (fromInput) return fromInput;
  const fromConfig = ctx.step.config && ctx.step.config.ticketRef;
  if (typeof fromConfig === "string" && fromConfig.trim().length > 0) {
    return fromConfig.trim();
  }
  throw new Error(
    "linear.comment runner requires a ticket ref (input `ref` or config.ticketRef)",
  );
};

// Pulls the comment body from the `body` port (a Markdown/Text `{ body }`
// payload, a `{ value }`-shaped scalar, or the raw `content`), falling back to
// `config.body`. Internal whitespace/formatting is preserved (only emptiness is
// checked with `.trim()`); the gateway trims the outer edges before posting.
const resolveCommentBody = (ctx) => {
  const input = inputOnPort(ctx, "body");
  if (input) {
    const p = input.payload;
    if (p && typeof p === "object") {
      if (typeof p.body === "string" && p.body.trim()) return p.body;
      if (typeof p.value === "string" && p.value.trim()) return p.value;
    }
    if (typeof input.content === "string" && input.content.trim()) {
      return input.content;
    }
  }
  const fromConfig = ctx.step.config && ctx.step.config.body;
  if (typeof fromConfig === "string" && fromConfig.trim().length > 0) {
    return fromConfig;
  }
  throw new Error(
    "linear.comment runner requires a comment body (input `body` or config.body)",
  );
};

const createLinearCommentRunner = () => ({
  kind: "linear.comment",

  resolveSpec() {
    return {
      title: "Linear Comment",
      description:
        "Posts a Markdown comment in a Linear ticket's native comment thread and re-emits the updated Ticket.",
      inputs: [
        {
          // Same ref shapes as `linear.set-status`: a LinearRef, a structured
          // Ticket, or a triage `Json` envelope (identifier dug out by
          // `refFromInput`).
          name: "ref",
          kinds: ["LinearRef", TICKET_KIND, "Json"],
          optional: true,
          primary: true,
        },
        { name: "body", kinds: ["Markdown", "Text", "Json"], optional: true },
      ],
      outputs: [
        {
          name: "ticket",
          kind: TICKET_KIND,
          description: "Updated ticket after the comment was posted.",
          primary: true,
        },
      ],
    };
  },

  async run(ctx) {
    const ref = resolveCommentRef(ctx);
    const body = resolveCommentBody(ctx);
    const started = Date.now();

    const ticket = await ctx.deps.linear.addComment(ref, body);
    const ticketPayload = toTicketPayload(ticket);

    const artifact = await ctx.deps.artifactStore.put(
      TICKET_KIND,
      JSON.stringify(ticketPayload),
      {
        provider: "linear",
        identifier: ticket.identifier,
        url: ticket.url,
        state: ticket.state,
        commentBodyChars: String(body.length),
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

// ---- linear.triage.fetch runner ----

const DEFAULT_TRIAGE_LIMIT = 10;

// Reads the configurable count `N` (`config.limit`), coercing strings and
// clamping to Linear's `[1, 250]` page bound. Falls back to 10.
const resolveTriageLimit = (ctx) => {
  const raw = ctx.step.config && ctx.step.config.limit;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_TRIAGE_LIMIT;
  return Math.min(Math.max(Math.trunc(n), 1), 250);
};

// Projects a gateway `LinearTicket` into a compact JSON row for the array
// output (keeps the description so triage has the full ask; drops only the
// heavy comments blob).
const toTriageListItem = (ticket) => ({
  identifier: ticket.identifier,
  title: ticket.title,
  description: ticket.description,
  state: ticket.state,
  priority: ticket.priority,
  priorityLabel: ticket.priorityLabel,
  assignee: ticket.assignee,
  team: ticket.team,
  labels: [...ticket.labels],
  url: ticket.url,
  createdAt: ticket.createdAt,
  updatedAt: ticket.updatedAt,
});

// Pulls image references out of a ticket description. Matches Markdown images
// (`![alt](url)`, ignoring an optional `"title"`) and bare HTML `<img src>` —
// the two forms Linear emits when an image is dropped into a description.
// De-duplicates by URL, preserving first-seen order.
const IMAGE_MD_RE = /!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;
const IMAGE_HTML_RE = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;

const extractDescriptionImageRefs = (description) => {
  if (typeof description !== "string" || description.length === 0) return [];
  const refs = [];
  const seen = new Set();
  const push = (rawUrl, altText) => {
    const url = (rawUrl || "").trim();
    if (!url || seen.has(url)) return;
    seen.add(url);
    refs.push({ url, altText: (altText || "").trim() });
  };
  for (const m of description.matchAll(IMAGE_MD_RE)) push(m[2], m[1]);
  for (const m of description.matchAll(IMAGE_HTML_RE)) push(m[1], "");
  return refs;
};

// Downloads every image embedded in the ticket description via the Linear
// gateway (which attaches the API key for `uploads.linear.app` assets). A
// per-image failure never aborts the triage run: the image is kept in the
// output with an `error` marker instead of its bytes, and logged.
const downloadDescriptionImages = async (ctx, ticket) => {
  const refs = extractDescriptionImageRefs(ticket.description);
  if (refs.length === 0) return [];
  return Promise.all(
    refs.map(async (ref) => {
      try {
        const img = await ctx.deps.linear.fetchImage(ref.url);
        return {
          url: ref.url,
          altText: ref.altText,
          mimeType: img.mimeType,
          byteLength: img.byteLength,
          dataBase64: img.dataBase64,
        };
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        if (ctx.deps.logger && typeof ctx.deps.logger.warn === "function") {
          ctx.deps.logger.warn(
            `linear.triage.fetch: failed to download image ${ref.url} for ${ticket.identifier}: ${message}`,
          );
        }
        return { url: ref.url, altText: ref.altText, error: message };
      }
    }),
  );
};

const createLinearTriageFetchRunner = () => ({
  kind: "linear.triage.fetch",

  resolveSpec() {
    return {
      title: "Linear Triage Fetch",
      description:
        "Fetches the N most recent tickets currently in the Linear Triage state (N configurable via config.limit, default 10) and exposes them as a JSON array, newest first. Images embedded in each ticket's description are downloaded and attached to the item as an `images` array (base64 bytes + MIME type).",
      inputs: [
        // Optional trigger only — lets the node start a graph or be chained
        // downstream; its value is never read.
        { name: "trigger", kinds: ["*"], optional: true },
      ],
      outputs: [
        {
          name: "tickets",
          kind: "Json",
          description:
            "JSON array of the N latest triage tickets (newest first).",
          primary: true,
        },
      ],
    };
  },

  async run(ctx) {
    const limit = resolveTriageLimit(ctx);
    const started = Date.now();

    const tickets = await ctx.deps.linear.fetchTriageTickets(limit);
    // Fetch each ticket's description images alongside its projection. Kept
    // per-ticket parallel; a failed image degrades to an `error` marker rather
    // than failing the whole triage batch (see `downloadDescriptionImages`).
    const items = await Promise.all(
      tickets.map(async (ticket) => ({
        ...toTriageListItem(ticket),
        images: await downloadDescriptionImages(ctx, ticket),
      })),
    );
    const imageCount = items.reduce((n, it) => n + it.images.length, 0);

    const artifact = await ctx.deps.artifactStore.put(
      "Json",
      JSON.stringify({ format: "json", body: JSON.stringify(items) }),
      {
        provider: "linear",
        source: "linear.triage.fetch",
        count: String(items.length),
        imageCount: String(imageCount),
        limit: String(limit),
        latencyMs: String(Date.now() - started),
        payloadFormat: PAYLOAD_FORMAT_JSON_V1,
      },
    );

    return { kind: "produced", artifact };
  },
});

// ---- onload ----

exports.onload = async (api) => {
  api.registerStepRunner(createLinearFetchRunner());
  api.registerStepRunner(createLinearSplitRunner());
  api.registerStepRunner(createLinearSetStatusRunner());
  api.registerStepRunner(createLinearCommentRunner());
  api.registerStepRunner(createLinearTriageFetchRunner());
  api.log.info(
    `loaded — runners=[linear.fetch, linear.split, linear.set-status, linear.comment, linear.triage.fetch], kind=${TICKET_KIND}`,
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
exports.createLinearCommentRunner = createLinearCommentRunner;
exports.createLinearTriageFetchRunner = createLinearTriageFetchRunner;
exports.extractDescriptionImageRefs = extractDescriptionImageRefs;
exports.TICKET_KIND = TICKET_KIND;
