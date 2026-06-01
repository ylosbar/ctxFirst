/**
 * Runner du step kind "shell.exec".
 *
 * Exécute une commande shell dans le `cwd` posé par un `workspace.set` amont
 * et expose la sortie (stdout/stderr/exit/duration) comme un artifact
 * `Markdown` consommable par les steps suivants.
 *
 * Garde-fous (cf. specs/shell-exec-step.md §Sécurité) :
 *  G1  cwd requis et verrouillé, `subdir` ne peut pas s'évader,
 *  G2  pas de `shell: true` implicite,
 *  G3  environnement filtré par défaut (pas de fuite de secrets),
 *  G4  timeout obligatoire et borné,
 *  G5  sortie bornée puis tronquée,
 *  G6  pas d'interpolation d'input dans la commande (V1),
 *  G8  refus net de `sudo`, `rm -rf /`, et caractères NUL.
 */
import { putArtifactPayload } from "../application/artifact-io";
import type {
  NodeSpec,
  OutputPort,
  ResolveSpecContext,
  StepOutcome,
  StepRunner,
} from "../application/step-runner";
import type { PathPort } from "../application/ports/outbound/path";
import type { ArtifactPayload } from "../domain/artifact-schemas";
import { formatStream, renderBranchSummary } from "./shell-exec-formatter";
import { buildEnv } from "./shell-env";

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 600_000;
const MIN_TIMEOUT_MS = 1_000;
const DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024;

/** Patterns that we reject up-front, regardless of allowlist (G8). */
const FORBIDDEN_PATTERNS: ReadonlyArray<{ re: RegExp; label: string }> = [
  { re: /\brm\s+-rf?\s+\/(?:\s|$)/, label: "rm -rf /" },
];

export type ExitCodeValue = number | "timeout";

/**
 * Mapping de noms de port (côté gauche) vers leurs exit codes (côté droit).
 * Exactement une entrée porte la sentinelle catch-all `"*"`. Chaque valeur
 * numérique ou `"timeout"` apparaît au plus une fois sur l'ensemble.
 */
export type ExitCodesConfig = {
  readonly [portName: string]: ReadonlyArray<ExitCodeValue> | "*";
};

type ShellExecConfig = {
  command: string | ReadonlyArray<string>;
  useShell: boolean;
  subdir?: string;
  env?: Record<string, string>;
  timeoutMs: number;
  maxOutputBytes: number;
  stdin?: string;
  exitCodes?: ExitCodesConfig;
};

const PORT_NAME_RE = /^[a-z][a-z0-9_-]{0,31}$/;
const RESERVED_PORT_NAMES: ReadonlySet<string> = new Set(["stdout", "stderr"]);

/**
 * Validates and normalises the optional `exitCodes` map. Returns `undefined`
 * when the field is absent (the runner then falls back to legacy
 * `success`/`failure` ports). Throws on the first violation with a precise
 * message — the caller is the `run()` path, which surfaces it as a
 * `StepFailed`.
 */
export const parseExitCodes = (raw: unknown): ExitCodesConfig | undefined => {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("shell.exec: `exitCodes` must be an object");
  }
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length < 2) {
    throw new Error("shell.exec: `exitCodes` must declare at least 2 ports");
  }

  const seenCodes = new Map<number | "timeout", string>();
  const seenPorts = new Set<string>();
  let catchAllPort: string | null = null;
  const out: Record<string, ReadonlyArray<ExitCodeValue> | "*"> = {};

  for (const [port, value] of entries) {
    if (!PORT_NAME_RE.test(port)) {
      throw new Error(`shell.exec: invalid port name "${port}"`);
    }
    if (RESERVED_PORT_NAMES.has(port)) {
      throw new Error(`shell.exec: port name "${port}" is reserved`);
    }
    if (seenPorts.has(port)) {
      throw new Error(`shell.exec: duplicate port name "${port}"`);
    }
    seenPorts.add(port);

    if (value === "*") {
      if (catchAllPort !== null) {
        throw new Error(
          `shell.exec: exactly one port must use "*" as catch-all ` +
            `(found "${catchAllPort}" and "${port}")`,
        );
      }
      catchAllPort = port;
      out[port] = "*";
      continue;
    }
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error(
        `shell.exec: port "${port}" must be a non-empty array of exit codes or "*"`,
      );
    }
    const codes: ExitCodeValue[] = [];
    for (const v of value) {
      const ok =
        v === "timeout" ||
        (typeof v === "number" &&
          Number.isInteger(v) &&
          v >= -128 &&
          v <= 255);
      if (!ok) {
        throw new Error(
          `shell.exec: invalid exit code ${JSON.stringify(v)} in port "${port}"`,
        );
      }
      const code = v as ExitCodeValue;
      const prior = seenCodes.get(code);
      if (prior !== undefined) {
        throw new Error(
          `shell.exec: exit code ${JSON.stringify(code)} mapped to multiple ports ("${prior}" and "${port}")`,
        );
      }
      seenCodes.set(code, port);
      codes.push(code);
    }
    out[port] = codes;
  }

  if (catchAllPort === null) {
    throw new Error(
      `shell.exec: \`exitCodes\` must declare exactly one catch-all port (value "*")`,
    );
  }
  return out;
};

/**
 * Picks the named port whose mapped codes contain the observed exit. Falls
 * back to the (validated, mandatory) catch-all. Pure — no IO. The
 * `"killed"` sentinel from {@link ShellRunResult} routes through the
 * catch-all (it is not exposed in the public mapping vocabulary).
 */
const selectExitCodePort = (
  mapping: ExitCodesConfig,
  observed: number | "timeout" | "killed",
): string => {
  let catchAll: string | null = null;
  for (const [port, codes] of Object.entries(mapping)) {
    if (codes === "*") {
      catchAll = port;
      continue;
    }
    if (observed !== "killed" && codes.includes(observed)) {
      return port;
    }
  }
  // Invariant: `parseExitCodes` guarantees exactly one catch-all entry.
  return catchAll as string;
};

/**
 * Builds a short tooltip string for a configured exit-code branch — `"exit
 * 0"`, `"exit 1, 2"`, `"timeout"`, or `"catch-all"`.
 */
const describePort = (codes: ReadonlyArray<ExitCodeValue> | "*"): string => {
  if (codes === "*") return "catch-all (any other exit code).";
  const parts = codes.map((c) => (c === "timeout" ? "timeout" : String(c)));
  return `Branch taken on exit ${parts.join(", ")}.`;
};

const isStringArray = (v: unknown): v is ReadonlyArray<string> =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

const parseShellExecConfig = (cfg: Readonly<Record<string, unknown>>): ShellExecConfig => {
  const rawCommand = cfg["command"];
  let command: string | ReadonlyArray<string>;
  if (typeof rawCommand === "string") {
    if (!rawCommand.trim()) {
      throw new Error("shell.exec: `command` must be a non-empty string or argv array");
    }
    command = rawCommand;
  } else if (isStringArray(rawCommand)) {
    if (rawCommand.length === 0) {
      throw new Error("shell.exec: `command` argv array must not be empty");
    }
    command = [...rawCommand];
  } else {
    throw new Error("shell.exec: `command` is required (string or string[])");
  }

  const useShell = cfg["useShell"] === true;
  const subdir =
    typeof cfg["subdir"] === "string" && cfg["subdir"].trim().length > 0
      ? cfg["subdir"].trim()
      : undefined;

  const env =
    cfg["env"] && typeof cfg["env"] === "object" && !Array.isArray(cfg["env"])
      ? Object.fromEntries(
          Object.entries(cfg["env"] as Record<string, unknown>).filter(
            ([, v]) => typeof v === "string",
          ) as ReadonlyArray<[string, string]>,
        )
      : undefined;

  const rawTimeout =
    typeof cfg["timeoutMs"] === "number" && Number.isFinite(cfg["timeoutMs"])
      ? cfg["timeoutMs"]
      : DEFAULT_TIMEOUT_MS;
  const timeoutMs = Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, Math.floor(rawTimeout)));

  // `failOnNonZero` is intentionally not read: the runner now branches on the
  // exit code via the `success` / `failure` ports, so the flag is obsolete.
  // Legacy templates may still carry it — it is silently ignored (no throw).

  const rawMax =
    typeof cfg["maxOutputBytes"] === "number" && Number.isFinite(cfg["maxOutputBytes"])
      ? cfg["maxOutputBytes"]
      : DEFAULT_MAX_OUTPUT_BYTES;
  const maxOutputBytes = Math.max(1024, Math.floor(rawMax));

  const stdin = typeof cfg["stdin"] === "string" ? cfg["stdin"] : undefined;

  const exitCodes = parseExitCodes(cfg["exitCodes"]);

  return {
    command,
    useShell,
    subdir,
    env,
    timeoutMs,
    maxOutputBytes,
    stdin,
    exitCodes,
  };
};

/**
 * Resolves the effective `cwd` for the child process, enforcing G1 + the
 * `subdir` containment check. The returned path is absolute and guaranteed
 * to live under `workspaceCwd`.
 */
const resolveCwd = (
  workspaceCwd: string | undefined,
  subdir: string | undefined,
  pathPort: PathPort,
): string => {
  if (!workspaceCwd || !workspaceCwd.trim()) {
    throw new Error(
      "shell.exec requires a workspace cwd (place a `workspace.set` step upstream)",
    );
  }
  const base = pathPort.resolve(workspaceCwd);
  if (!subdir) return base;
  const candidate = pathPort.resolve(base, subdir);
  const sep = pathPort.sep;
  const baseWithSep = base.endsWith(sep) ? base : base + sep;
  if (candidate !== base && !candidate.startsWith(baseWithSep)) {
    throw new Error(`shell.exec: subdir escapes workspace (${subdir})`);
  }
  return candidate;
};

/** Returns the first token of a command for guard checks. */
const firstToken = (cmd: string | ReadonlyArray<string>): string => {
  if (Array.isArray(cmd)) return cmd[0] ?? "";
  const m = (cmd as string).match(/^\s*(\S+)/);
  return m ? m[1] : "";
};

/** Surface for joined-command pattern checks (G8). */
const joinedCommand = (cmd: string | ReadonlyArray<string>): string =>
  typeof cmd === "string" ? cmd : cmd.join(" ");

const enforceGuards = (cfg: ShellExecConfig): void => {
  const head = firstToken(cfg.command);
  if (head === "sudo") {
    throw new Error("shell.exec: `sudo` is not allowed");
  }
  const joined = joinedCommand(cfg.command);
  if (joined.indexOf("\0") !== -1) {
    throw new Error("shell.exec: NUL byte in command");
  }
  for (const { re, label } of FORBIDDEN_PATTERNS) {
    if (re.test(joined)) {
      throw new Error(`shell.exec: forbidden pattern detected (${label})`);
    }
  }
};

export const createShellExecRunner = (): StepRunner => ({
  kind: "shell.exec",

  resolveSpec({ config }: ResolveSpecContext): NodeSpec {
    // Tolerant parse: `resolveSpec` is called by `listNodeSpecs()` (no config
    // context) and by the template editor with in-progress configs. Throwing
    // here would hide the kind from the picker; the strict throw stays in
    // `parseShellExecConfig` on the run() path.
    let exitCodes: ExitCodesConfig | undefined;
    try {
      exitCodes = parseExitCodes(config["exitCodes"]);
    } catch {
      exitCodes = undefined;
    }

    const branchPorts: ReadonlyArray<OutputPort> = exitCodes
      ? Object.entries(exitCodes).map(([name, codes], i) => ({
          name,
          kind: "Markdown",
          primary: i === 0,
          description: describePort(codes),
        }))
      : [
          {
            name: "success",
            kind: "Markdown",
            primary: true,
            description: "Branch taken when the command exits 0.",
          },
          {
            name: "failure",
            kind: "Markdown",
            description:
              "Branch taken when the command exits non-zero (including timeout / signal).",
          },
        ];

    return {
      title: "Shell Exec",
      description:
        "Runs a shell command in the workspace cwd. Branches on exit code (success/failure by default, or named ports via `exitCodes`) and exposes stdout/stderr separately.",
      // V1: optional `*` input — available for chaining but not interpolated
      // into the command (cf. G6).
      inputs: [{ name: "context", kinds: ["*"], optional: true }],
      outputs: [
        ...branchPorts,
        {
          name: "stdout",
          kind: "Markdown",
          description: "Verbatim stdout stream. Always produced.",
        },
        {
          name: "stderr",
          kind: "Markdown",
          description: "Verbatim stderr stream. Always produced.",
        },
      ],
    };
  },

  async run(ctx): Promise<StepOutcome> {
    const cfg = parseShellExecConfig(ctx.step.config);
    enforceGuards(cfg);
    const cwd = resolveCwd(ctx.workspace.cwd, cfg.subdir, ctx.deps.path);
    const env = buildEnv(cfg.env, ctx.deps.environment);

    if (cfg.useShell) {
      ctx.deps.logger.info(
        `[wf:shell-exec] useShell=true cwd=${cwd} cmd=${joinedCommand(cfg.command)}`,
      );
    }

    const result = await ctx.deps.shell.run({
      command: cfg.command,
      useShell: cfg.useShell,
      cwd,
      env,
      timeoutMs: cfg.timeoutMs,
      maxOutputBytes: cfg.maxOutputBytes,
      stdin: cfg.stdin,
    });

    // Branch on the exit code: emit exactly one branch port (mutually
    // exclusive), plus the always-present `stdout` / `stderr` streams. The
    // unproduced branch ports are skip-propagated downstream by the
    // orchestrator (partial `produced-many`). Human gating, when set on the
    // step, is opened by the orchestrator's `produced-many` handler.
    //
    // Two regimes:
    //  - `default` — legacy `success` (exit 0) / `failure` (anything else),
    //  - `configured` — user-defined mapping from `cfg.exitCodes`.
    const branchMode: "default" | "configured" = cfg.exitCodes
      ? "configured"
      : "default";
    const branchPort: string = cfg.exitCodes
      ? selectExitCodePort(cfg.exitCodes, result.exitCode)
      : result.exitCode === 0
        ? "success"
        : "failure";
    const anyTruncated = result.truncated.stdout || result.truncated.stderr;

    const branchPayload: ArtifactPayload<"Markdown"> = {
      format: "markdown",
      body: renderBranchSummary(branchPort, result),
    };
    const branchArtifact = await putArtifactPayload(
      ctx.deps.artifactStore,
      "Markdown",
      branchPayload,
      {
        port: branchPort,
        branchMode,
        exitCode: String(result.exitCode),
        signal: result.signal ?? "",
        durationMs: String(result.durationMs),
        truncated: String(anyTruncated),
        cwd,
      },
    );

    const stdoutPayload: ArtifactPayload<"Markdown"> = {
      format: "markdown",
      body: formatStream(result.stdout, result.truncated.stdout),
    };
    const stdoutArtifact = await putArtifactPayload(
      ctx.deps.artifactStore,
      "Markdown",
      stdoutPayload,
      { stream: "stdout", truncated: String(result.truncated.stdout), cwd },
    );

    const stderrPayload: ArtifactPayload<"Markdown"> = {
      format: "markdown",
      body: formatStream(result.stderr, result.truncated.stderr),
    };
    const stderrArtifact = await putArtifactPayload(
      ctx.deps.artifactStore,
      "Markdown",
      stderrPayload,
      { stream: "stderr", truncated: String(result.truncated.stderr), cwd },
    );

    return {
      kind: "produced-many",
      artifacts: [
        { port: branchPort, artifact: branchArtifact },
        { port: "stdout", artifact: stdoutArtifact },
        { port: "stderr", artifact: stderrArtifact },
      ],
    };
  },
});
