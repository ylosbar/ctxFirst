/**
 * Compat shim that rewrites templates relying on the removed
 * "parser-as-option" mechanism (cf. `specs/artifact-typing-overhaul.md`
 * §Pilier B) into explicit `transform.run` nodes inserted between the
 * producer and the LLM-invocation step.
 *
 * Seed: the SQL migration `v18` drains the dropped `wf_artifact_schema_active_parser`
 * table into an `app_settings` row keyed by {@link PARSER_AS_OPTION_SEED_KEY} —
 * a JSON snapshot `[{ kind, parserId, parserVersion }, …]`. The template
 * registry calls this function on every load with the snapshot, idempotently:
 * after a first rewrite the producer→consumer edge already routes through a
 * `transform.run` with the matching `transformRef`, so a second pass is a no-op.
 */
import { asStepId, type StepId } from "../../domain/ids";
import type {
  StepDef,
  Transition,
  WorkflowTemplate,
} from "../../domain/template";

/** `app_settings.key` row holding the migration seed (cf. SQL migration v18). */
export const PARSER_AS_OPTION_SEED_KEY = "parser_as_option_migration_seed";

/** One entry of the seed dropped by SQL migration v18. */
export type ParserAsOptionSeedEntry = {
  /** Encoded artifact kind, e.g. `"user:foo@v1"` or `"plugin:bar:baz@v1"`. */
  kind: string;
  parserId: string;
  parserVersion: string;
};

/**
 * Step kinds the migration recognises as "LLM-invocation" — these are the
 * only consumers we wrap. Built-in only ; plugin-contributed LLM steps stay
 * out of scope (the plugin author is expected to register a fresh runner).
 */
const LLM_CONSUMER_KINDS: ReadonlySet<string> = new Set([
  "agent.invoke",
  "claude_code.invoke",
  "openrouter.invoke",
]);

/**
 * Fixed output kinds of built-in producers. Polymorphic producers (those
 * reading `config.outputKind`) are handled separately. Multi-output runners
 * (e.g. `linear.split`, `shell.exec`) are intentionally absent — they branch
 * across several `fromPort`s, so wrapping a single producer→consumer edge in a
 * `transform.run` would require per-port resolution we skip in this pass (see
 * {@link MULTI_OUTPUT_PRODUCERS}).
 */
const FIXED_OUTPUT_KINDS: Readonly<Record<string, string>> = {
  "linear.fetch": "plugin:linear:Ticket@v1",
  "file.load-markdown": "Markdown",
  "concat.markdown": "Markdown",
  "skill.loader": "Markdown",
};

/**
 * Built-in producers that expose more than one output port. The migration
 * cannot derive "the" output kind for a producer→consumer edge here, so it
 * leaves these untouched and reports a `multi-output-producer` skip.
 */
const MULTI_OUTPUT_PRODUCERS: ReadonlySet<string> = new Set([
  "linear.split",
  "shell.exec",
]);

const POLYMORPHIC_OUTPUT_PRODUCERS: ReadonlySet<string> = new Set([
  "user.input",
  "agent.invoke",
  "claude_code.invoke",
  "openrouter.invoke",
  "transform.run",
]);

export type MigrationSkipReason =
  | "unknown-producer-output"
  | "multi-output-producer"
  | "transition-source-not-found";

export type MigrationSkipped = {
  stepId: StepId;
  reason: MigrationSkipReason;
  message: string;
};

export type MigrationResult = {
  template: WorkflowTemplate;
  changed: boolean;
  skipped: ReadonlyArray<MigrationSkipped>;
};

const isPolymorphicOutputKind = (step: StepDef): string | null => {
  if (!POLYMORPHIC_OUTPUT_PRODUCERS.has(step.kind)) return null;
  const k = step.config["outputKind"];
  return typeof k === "string" && k.length > 0 ? k : null;
};

const producerOutputKind = (step: StepDef): string | null => {
  const poly = isPolymorphicOutputKind(step);
  if (poly) return poly;
  return FIXED_OUTPUT_KINDS[step.kind] ?? null;
};

const isAlreadyMigrated = (
  producer: StepDef,
  outputKind: string,
  parserId: string,
  parserVersion: string,
): boolean => {
  if (producer.kind !== "transform.run") return false;
  const cfgKind = producer.config["outputKind"];
  if (cfgKind !== outputKind) return false;
  const ref = producer.config["transformRef"];
  if (!ref || typeof ref !== "object") return false;
  const r = ref as { id?: unknown; version?: unknown };
  return r.id === parserId && r.version === parserVersion;
};

const makeFreshStepId = (
  base: string,
  used: ReadonlySet<string>,
): StepId => {
  let candidate = base;
  let i = 1;
  while (used.has(candidate)) {
    candidate = `${base}-${i}`;
    i += 1;
  }
  return asStepId(candidate);
};

export const migrateActiveParsersToTransformRun = (
  tpl: WorkflowTemplate,
  seedEntries: ReadonlyArray<ParserAsOptionSeedEntry>,
): MigrationResult => {
  if (seedEntries.length === 0) {
    return { template: tpl, changed: false, skipped: [] };
  }
  const seedByKind = new Map<string, ParserAsOptionSeedEntry>();
  for (const e of seedEntries) seedByKind.set(e.kind, e);

  const steps: StepDef[] = tpl.steps.map((s) => ({ ...s }));
  const transitions: Transition[] = tpl.transitions.map((t) => ({ ...t }));
  const skipped: MigrationSkipped[] = [];
  const stepIds = new Set<string>(steps.map((s) => s.id));
  let changed = false;

  // Snapshot the original transitions — we mutate `transitions` while iterating.
  const original = [...transitions];
  for (const t of original) {
    if (t.isLoop) continue;
    const consumer = steps.find((s) => s.id === t.to);
    if (!consumer) continue;
    if (!LLM_CONSUMER_KINDS.has(consumer.kind)) continue;

    const producer = steps.find((s) => s.id === t.from);
    if (!producer) {
      skipped.push({
        stepId: t.to,
        reason: "transition-source-not-found",
        message: `transition target=${t.to}: source step ${t.from} not in template`,
      });
      continue;
    }

    const outputKind = producerOutputKind(producer);
    if (!outputKind) {
      skipped.push({
        stepId: producer.id,
        reason: MULTI_OUTPUT_PRODUCERS.has(producer.kind)
          ? "multi-output-producer"
          : "unknown-producer-output",
        message: `producer ${producer.id} (kind ${producer.kind}): cannot derive output kind without the runner registry — skipped`,
      });
      continue;
    }

    const seed = seedByKind.get(outputKind);
    if (!seed) continue;

    if (isAlreadyMigrated(producer, outputKind, seed.parserId, seed.parserVersion)) {
      continue;
    }

    // Insert a `transform.run` step between producer and consumer.
    const newId = makeFreshStepId(
      `${producer.id}-transform-${outputKind.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
      stepIds,
    );
    stepIds.add(newId);
    const transformStep: StepDef = {
      id: newId,
      name: `Transform ${outputKind}`,
      kind: "transform.run",
      actorRole: consumer.actorRole,
      humanGateRequired: false,
      config: {
        outputKind,
        transformRef: { id: seed.parserId, version: seed.parserVersion },
      },
    };
    steps.push(transformStep);

    // Rewire: producer →[fromPort] transformStep →[default] consumer
    const idx = transitions.findIndex(
      (x) =>
        x.from === t.from &&
        x.to === t.to &&
        (x.fromPort ?? null) === (t.fromPort ?? null) &&
        (x.toPort ?? null) === (t.toPort ?? null) &&
        x.isLoop === t.isLoop,
    );
    if (idx >= 0) transitions.splice(idx, 1);
    transitions.push({
      from: producer.id,
      to: newId,
      fromPort: t.fromPort,
      toPort: "src",
      isLoop: false,
      order: t.order,
    });
    transitions.push({
      from: newId,
      to: consumer.id,
      fromPort: "out",
      toPort: t.toPort,
      isLoop: false,
      order: t.order,
    });
    changed = true;
  }

  if (!changed) {
    return { template: tpl, changed: false, skipped };
  }
  return {
    template: { ...tpl, steps, transitions },
    changed: true,
    skipped,
  };
};
