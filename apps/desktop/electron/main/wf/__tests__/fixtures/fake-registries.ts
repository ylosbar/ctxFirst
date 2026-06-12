import { z } from "zod";
import type {
  ArtifactSchemaRegistry,
  PluginArtifactSchemaContribution,
} from "../../application/ports/outbound/artifact-schema-registry";
import type { ChannelRegistry } from "../../application/ports/outbound/channel-registry";
import type {
  ParserRegistry,
  PluginParserContribution,
} from "../../application/ports/outbound/parser-registry";
import type { SkillRegistry } from "../../application/ports/outbound/skill-registry";
import type {
  StepKindSuggestion,
  StepKindSuggestionRegistry,
  PluginStepKindSuggestionContribution,
} from "../../application/ports/outbound/step-kind-suggestions";
import type { TemplateRegistry } from "../../application/ports/outbound/template-registry";
import type { Channel } from "../../domain/channel";
import { DEFAULT_CHANNEL_ID } from "../../domain/channel";
import {
  isContainerArtifactKind,
  isContentAddressedArtifactKind,
  isErrorArtifactKind,
  isSuccessArtifactKind,
  isSumArtifactKind,
  parseContentAddressedArtifactKind,
  parseErrorArtifactKind,
  parseListArtifactKind,
  parseSuccessArtifactKind,
  parseSumArtifactKind,
  type ArtifactKind,
} from "../../domain/artifact";
import {
  ArtifactSchemaError,
  UnknownArtifactKindError,
} from "../../domain/artifact-errors";
import { parseArtifact } from "../../domain/parse-artifact";
import {
  BUILTIN_DESCRIPTORS,
  BUILTIN_DESCRIPTORS_BY_KIND,
} from "../../domain/BuiltIns";
import {
  composeListStructuralHash,
  composeSumStructuralHash,
  composeWrapperStructuralHash,
  computeStructuralHash,
} from "../../domain/artifact-schema-hash";
import {
  ArtifactSchemaBreakingChangeError,
  classifyChange,
} from "../../domain/artifact-schema-compat";
import { plainFallback } from "../../domain/artifact-serializer";
import type {
  ArtifactKindDescriptor,
  ArtifactSchemaRecord,
  ArtifactSchemaRef,
  SaveUserArtifactSchema,
} from "../../domain/artifact-schema";
import type { ParserRecord, ParserRef, SaveUserParser } from "../../domain/parser";
import type { Skill } from "../../domain/skill";
import type {
  TemplateId,
  TemplateVersion,
  SkillRef,
} from "../../domain/ids";
import type { WorkflowTemplate } from "../../domain/template";
import type { TemplateLayout } from "@shared/wf/layout";

// ---------- Template registry ----------

export type FakeTemplateRegistry = TemplateRegistry & {
  reset(): void;
  /** Synchronous getter for tests. */
  getById(id: TemplateId, version: TemplateVersion): WorkflowTemplate | undefined;
};

export const createFakeTemplateRegistry = (
  initial: ReadonlyArray<WorkflowTemplate> = [],
): FakeTemplateRegistry => {
  const byKey = new Map<string, WorkflowTemplate>();
  const layouts = new Map<string, TemplateLayout>();
  const key = (id: TemplateId, version: TemplateVersion) => `${id}@${version}`;
  for (const t of initial) byKey.set(key(t.id, t.version), t);

  return {
    async resolve(id, version) {
      const t = byKey.get(key(id, version));
      if (!t) throw new Error(`[fake-templates] unknown template ${id}@${version}`);
      return t;
    },
    async resolveRef(ref) {
      const at = ref.lastIndexOf("@");
      if (at < 0) throw new Error(`[fake-templates] invalid ref ${ref}`);
      const id = ref.slice(0, at) as TemplateId;
      const version = ref.slice(at + 1) as TemplateVersion;
      const t = byKey.get(key(id, version));
      if (!t) throw new Error(`[fake-templates] unknown template ${ref}`);
      return t;
    },
    async list() {
      return [...byKey.values()];
    },
    async save(tpl) {
      byKey.set(key(tpl.id, tpl.version), tpl);
    },
    async rename(id, version, newName) {
      const cur = byKey.get(key(id, version));
      if (!cur) throw new Error(`[fake-templates] unknown template ${id}@${version}`);
      byKey.set(key(id, version), { ...cur, name: newName });
    },
    async remove(id, version) {
      byKey.delete(key(id, version));
    },
    async getLayout(id, version) {
      return layouts.get(key(id, version)) ?? null;
    },
    async saveLayout(id, version, layout) {
      const k = key(id, version);
      if (!byKey.has(k)) throw new Error(`[fake-templates] no row for ${k}`);
      layouts.set(k, layout);
    },
    getById(id, version) {
      return byKey.get(key(id, version));
    },
    reset() {
      byKey.clear();
      layouts.clear();
    },
  };
};

// ---------- Skill registry ----------

export type FakeSkillRegistry = SkillRegistry & {
  reset(): void;
};

export const createFakeSkillRegistry = (
  initial: ReadonlyArray<Skill> = [],
): FakeSkillRegistry => {
  const byRef = new Map<SkillRef, Skill>();
  for (const s of initial) byRef.set(s.ref, s);

  return {
    async resolve(ref) {
      const s = byRef.get(ref);
      if (!s) throw new Error(`[fake-skills] unknown skill ${ref}`);
      return s;
    },
    async list() {
      return [...byRef.values()];
    },
    async save(skill) {
      byRef.set(skill.ref, skill);
    },
    async remove(ref) {
      byRef.delete(ref);
    },
    reset() {
      byRef.clear();
    },
  };
};

// ---------- Artifact-type registry ----------

export type FakeArtifactSchemaRegistry = ArtifactSchemaRegistry & {
  reset(): void;
};

const pluginContribToDescriptor = (
  pluginId: string,
  t: PluginArtifactSchemaContribution["types"][number],
  resolveParentHash: (kind: ArtifactKind) => string | null,
): ArtifactKindDescriptor => {
  const simplifiedSchema = t.simplifiedSchema;
  // The fake compiles a tolerant schema on demand — tests that need strict
  // validation of a plugin payload should inject the descriptor directly.
  let schema: z.ZodTypeAny;
  try {
    schema = z.fromJSONSchema(simplifiedSchema as never);
  } catch {
    schema = z.unknown();
  }
  const extendsKind = (t.extends ?? null) as ArtifactKind | null;
  return {
    kind: `plugin:${pluginId}:${t.id}@${t.version}`,
    id: t.id,
    version: t.version,
    name: t.name,
    description: t.description ?? "",
    rawSchema: t.rawSchema ?? null,
    simplifiedSchema,
    sampleRaw: t.sampleRaw ?? null,
    sample: t.sample ?? null,
    source: { kind: "plugin", pluginId },
    schema,
    synthesized: false,
    extends: extendsKind,
    structuralHash: computeStructuralHash(
      { simplifiedSchema, extends: extendsKind },
      resolveParentHash,
    ),
    markdownProjection: t.markdownTemplate
      ? { kind: "template", template: t.markdownTemplate }
      : null,
    coerceFrom: null,
  };
};

/**
 * In-memory artifact-schema registry. Built-ins come from
 * `BUILTIN_DESCRIPTORS` (single source of truth); user records and plugin
 * contributions are stored in maps.
 */
export const createFakeArtifactSchemaRegistry = (): FakeArtifactSchemaRegistry => {
  const userRecords = new Map<string, ArtifactKindDescriptor>();
  const pluginContribs: PluginArtifactSchemaContribution[] = [];
  const synthesizedCache = new Map<ArtifactKind, ArtifactKindDescriptor>();

  const resolveParentHash = (kind: ArtifactKind): string | null =>
    findRecord(kind)?.structuralHash ?? null;

  // Mirrors the SQLite adapter's eager dependent-hash recompute: when a user
  // record's hash changes, every user record that refines it (transitively)
  // is recomputed in dependency order so no child keeps a stale parent hash.
  const recomputeDependentHashes = (changedKind: ArtifactKind): void => {
    const affected = new Set<string>([changedKind]);
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const [kind, desc] of userRecords) {
        const parent = desc.extends;
        if (!parent || !affected.has(parent) || affected.has(kind)) continue;
        affected.add(kind);
        progressed = true;
        const newHash = computeStructuralHash(
          { simplifiedSchema: desc.simplifiedSchema, extends: parent },
          resolveParentHash,
        );
        if (newHash !== desc.structuralHash) {
          userRecords.set(kind, { ...desc, structuralHash: newHash });
        }
      }
    }
  };

  const synthesizeList = (kind: ArtifactKind): ArtifactKindDescriptor | null => {
    if (!isContainerArtifactKind(kind)) return null;
    const inner = parseListArtifactKind(kind);
    if (!inner) throw new UnknownArtifactKindError(kind);
    const innerDesc = findRecord(inner);
    if (!innerDesc) throw new UnknownArtifactKindError(inner);
    const listSchema = z.object({ items: z.array(innerDesc.schema) });
    return {
      kind,
      id: kind,
      version: "v1",
      name: `List<${innerDesc.name}>`,
      description: `List of ${innerDesc.name}.`,
      source: innerDesc.source,
      schema: listSchema,
      rawSchema: null,
      simplifiedSchema: z.toJSONSchema(listSchema, { unrepresentable: "any" }),
      sampleRaw: null,
      sample: null,
      synthesized: true,
      extends: null,
      structuralHash: composeListStructuralHash(innerDesc.structuralHash),
      markdownProjection: null,
      coerceFrom: null,
    };
  };

  const synthesizeSum = (kind: ArtifactKind): ArtifactKindDescriptor | null => {
    if (!isSumArtifactKind(kind)) return null;
    const variants = parseSumArtifactKind(kind);
    if (!variants) throw new UnknownArtifactKindError(kind);
    const variantDescriptors = variants.map((v) => {
      const d = findRecord(v);
      if (!d) throw new UnknownArtifactKindError(v);
      return d;
    });
    const schema = z.discriminatedUnion(
      "variantKind",
      variantDescriptors.map((d) =>
        z.object({ variantKind: z.literal(d.kind), payload: d.schema }),
      ) as never,
    );
    return {
      kind,
      id: kind,
      version: "v1",
      name: `OneOf<${variantDescriptors.map((d) => d.name).join(", ")}>`,
      description: `Sum of ${variantDescriptors.length} variants.`,
      source: { kind: "builtin" },
      schema,
      rawSchema: null,
      simplifiedSchema: z.toJSONSchema(schema, { unrepresentable: "any" }),
      sampleRaw: null,
      sample: null,
      synthesized: true,
      extends: null,
      structuralHash: composeSumStructuralHash(
        variantDescriptors.map((d) => d.structuralHash),
      ),
      markdownProjection: null,
      coerceFrom: null,
    };
  };

  const synthesizeWrapper = (
    kind: ArtifactKind,
    parse: (k: ArtifactKind) => ArtifactKind | null,
    label: "Success" | "Error",
  ): ArtifactKindDescriptor | null => {
    const inner = parse(kind);
    if (!inner) return null;
    const innerDesc = findRecord(inner);
    if (!innerDesc) throw new UnknownArtifactKindError(inner);
    const schema = z.object({
      variant: z.literal(label),
      value: innerDesc.schema,
    });
    return {
      kind,
      id: kind,
      version: "v1",
      name: `${label}<${innerDesc.name}>`,
      description: `${label} result wrapping ${innerDesc.name}.`,
      source: innerDesc.source,
      schema,
      rawSchema: null,
      simplifiedSchema: z.toJSONSchema(schema, { unrepresentable: "any" }),
      sampleRaw: null,
      sample: null,
      synthesized: true,
      extends: null,
      structuralHash: composeWrapperStructuralHash(
        label,
        innerDesc.structuralHash,
      ),
      markdownProjection: null,
      coerceFrom: null,
    };
  };

  const lookupByHashPrefix = (
    hashPrefix: string,
  ): ArtifactKindDescriptor | null => {
    const matches: ArtifactKindDescriptor[] = [];
    for (const d of BUILTIN_DESCRIPTORS_BY_KIND.values()) {
      if (d.structuralHash.startsWith(hashPrefix)) matches.push(d);
    }
    for (const r of userRecords.values()) {
      if (r.structuralHash.startsWith(hashPrefix)) matches.push(r);
    }
    for (const contrib of pluginContribs) {
      for (const t of contrib.types) {
        const desc = pluginContribToDescriptor(
          contrib.pluginId,
          t,
          resolveParentHash,
        );
        if (desc.structuralHash.startsWith(hashPrefix)) matches.push(desc);
      }
    }
    if (matches.length === 0) return null;
    if (matches.length > 1) {
      throw new Error(
        `ambiguous record:<hash> prefix "${hashPrefix}" — ${matches.length} matches`,
      );
    }
    return matches[0];
  };

  const findRecord = (kind: ArtifactKind): ArtifactKindDescriptor | null => {
    const builtin = BUILTIN_DESCRIPTORS_BY_KIND.get(kind);
    if (builtin) return builtin;
    if (isContentAddressedArtifactKind(kind)) {
      const prefix = parseContentAddressedArtifactKind(kind);
      return prefix ? lookupByHashPrefix(prefix) : null;
    }
    const cached = synthesizedCache.get(kind);
    if (cached) return cached;
    if (isContainerArtifactKind(kind)) {
      const synth = synthesizeList(kind);
      if (synth) synthesizedCache.set(kind, synth);
      return synth;
    }
    if (isSumArtifactKind(kind)) {
      const synth = synthesizeSum(kind);
      if (synth) synthesizedCache.set(kind, synth);
      return synth;
    }
    if (isSuccessArtifactKind(kind)) {
      const synth = synthesizeWrapper(
        kind,
        (k) => parseSuccessArtifactKind(k),
        "Success",
      );
      if (synth) synthesizedCache.set(kind, synth);
      return synth;
    }
    if (isErrorArtifactKind(kind)) {
      const synth = synthesizeWrapper(
        kind,
        (k) => parseErrorArtifactKind(k),
        "Error",
      );
      if (synth) synthesizedCache.set(kind, synth);
      return synth;
    }
    if (kind.startsWith("user:")) {
      return userRecords.get(kind) ?? null;
    }
    if (kind.startsWith("plugin:")) {
      const m = /^plugin:([^:]+):([^@]+)@(.+)$/.exec(kind);
      if (!m) return null;
      const [, pid, id, version] = m;
      const contrib = pluginContribs.find((c) => c.pluginId === pid);
      const type = contrib?.types.find(
        (t) => t.id === id && t.version === version,
      );
      if (!type) return null;
      return pluginContribToDescriptor(pid, type, resolveParentHash);
    }
    return null;
  };

  const registry: FakeArtifactSchemaRegistry = {
    list() {
      const out: ArtifactSchemaRecord[] = [...BUILTIN_DESCRIPTORS];
      for (const r of userRecords.values()) out.push(r);
      for (const contrib of pluginContribs) {
        for (const t of contrib.types) {
          out.push(
            pluginContribToDescriptor(contrib.pluginId, t, resolveParentHash),
          );
        }
      }
      return out;
    },
    resolve(kind) {
      return findRecord(kind);
    },
    getSchema(kind) {
      return findRecord(kind)?.schema ?? null;
    },
    validate(kind, rawContent) {
      const descriptor = findRecord(kind);
      if (!descriptor) {
        return { ok: false, error: new UnknownArtifactKindError(kind) };
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawContent);
      } catch {
        try {
          parsed = plainFallback(kind, rawContent);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            ok: false,
            error: new ArtifactSchemaError(kind, [
              {
                code: "custom",
                path: [],
                message: `unable to decode raw content: ${message}`,
              } as never,
            ]),
          };
        }
      }
      try {
        parseArtifact(registry, kind, parsed);
        return { ok: true };
      } catch (err) {
        if (err instanceof ArtifactSchemaError || err instanceof UnknownArtifactKindError) {
          return { ok: false, error: err };
        }
        throw err;
      }
    },
    async save(type: SaveUserArtifactSchema) {
      const kind = `user:${type.id}@${type.version}` as ArtifactKind;
      const simplifiedSchema = type.simplifiedSchema;
      // Mirror the SQLite adapter's BACKWARD gate: an in-place overwrite at the
      // same (id, version) must still read payloads valid under the stored one.
      if (!type.allowBreaking) {
        const existing = userRecords.get(kind);
        if (existing) {
          const verdict = classifyChange(existing.simplifiedSchema, simplifiedSchema);
          if (verdict.breaking.length > 0) {
            throw new ArtifactSchemaBreakingChangeError(
              { id: type.id, version: type.version, name: type.name },
              verdict.breaking,
            );
          }
        }
      }
      let schema: z.ZodTypeAny;
      try {
        schema = z.fromJSONSchema(simplifiedSchema as never);
      } catch {
        schema = z.unknown();
      }
      const extendsKind: ArtifactKind | null = type.extends ?? null;
      userRecords.set(kind, {
        kind,
        id: type.id,
        version: type.version,
        name: type.name,
        description: type.description ?? "",
        rawSchema: type.rawSchema ?? null,
        simplifiedSchema,
        sampleRaw: type.sampleRaw ?? null,
        sample: type.sample ?? null,
        source: { kind: "user" },
        schema,
        synthesized: false,
        extends: extendsKind,
        structuralHash: computeStructuralHash(
          { simplifiedSchema, extends: extendsKind },
          resolveParentHash,
        ),
        markdownProjection: type.markdownTemplate
          ? { kind: "template", template: type.markdownTemplate }
          : null,
        coerceFrom: type.coerceFrom ?? null,
      });
      recomputeDependentHashes(kind);
      synthesizedCache.clear();
    },
    async remove(ref: ArtifactSchemaRef) {
      const kind = `user:${ref.id}@${ref.version}` as ArtifactKind;
      userRecords.delete(kind);
      synthesizedCache.clear();
    },
    setPluginContributions(contribs) {
      pluginContribs.length = 0;
      pluginContribs.push(...contribs);
      synthesizedCache.clear();
    },
    reset() {
      userRecords.clear();
      pluginContribs.length = 0;
      synthesizedCache.clear();
    },
  };

  return registry;
};

// ---------- Parser registry ----------

export type FakeParserRegistry = ParserRegistry & {
  /** Quick way to push a user-style parser into the registry. */
  push(rec: ParserRecord): void;
  reset(): void;
};

export const createFakeParserRegistry = (): FakeParserRegistry => {
  const records: ParserRecord[] = [];
  const pluginContribs: PluginParserContribution[] = [];

  const refKey = (r: ParserRef) => `${r.id}@${r.version}`;

  const allRecords = (): ParserRecord[] => {
    const out = records.slice();
    for (const contrib of pluginContribs) {
      for (const p of contrib.parsers) {
        out.push({
          id: p.id,
          version: p.version,
          forType: p.forType,
          mode: p.mode,
          body: p.body,
          source: { kind: "plugin", pluginId: contrib.pluginId },
          meta: p.meta ?? {},
        });
      }
    }
    return out;
  };

  const registry: FakeParserRegistry = {
    list(forType) {
      const all = allRecords();
      if (!forType) return all;
      return all.filter(
        (r) =>
          r.forType.id === forType.id && r.forType.version === forType.version,
      );
    },
    resolve(ref) {
      return allRecords().find((r) => refKey(r) === refKey(ref)) ?? null;
    },
    async save(parser: SaveUserParser) {
      const idx = records.findIndex(
        (r) => r.id === parser.id && r.version === parser.version,
      );
      const next: ParserRecord = {
        id: parser.id,
        version: parser.version,
        forType: parser.forType,
        mode: parser.mode,
        body: parser.body,
        source: { kind: "user" },
        meta: parser.meta ?? {},
      };
      if (idx >= 0) records[idx] = next;
      else records.push(next);
    },
    async remove(ref) {
      const idx = records.findIndex((r) => refKey(r) === refKey(ref));
      if (idx >= 0) records.splice(idx, 1);
    },
    setPluginContributions(contribs) {
      pluginContribs.length = 0;
      pluginContribs.push(...contribs);
    },
    push(rec) {
      records.push(rec);
    },
    reset() {
      records.length = 0;
      pluginContribs.length = 0;
    },
  };

  return registry;
};

// ---------- Channel registry ----------

export type FakeChannelRegistry = ChannelRegistry & {
  reset(): void;
};

const defaultChannel = (): Channel => ({
  id: DEFAULT_CHANNEL_ID,
  name: "Default",
  description: "",
  color: null,
  iconImagePath: null,
  iconImageMime: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

export const createFakeChannelRegistry = (
  seed: ReadonlyArray<Channel> = [defaultChannel()],
): FakeChannelRegistry => {
  const channels = new Map<string, Channel>(seed.map((c) => [c.id, c]));

  return {
    async list() {
      return [...channels.values()];
    },
    async get(id) {
      return channels.get(id) ?? null;
    },
    async save(draft) {
      const existing = channels.get(draft.id);
      const now = "2026-01-01T00:00:00.000Z";
      channels.set(draft.id, {
        id: draft.id,
        name: draft.name,
        description: draft.description ?? "",
        color: draft.color ?? null,
        iconImagePath:
          draft.iconImagePath === undefined
            ? existing?.iconImagePath ?? null
            : draft.iconImagePath,
        iconImageMime:
          draft.iconImageMime === undefined
            ? existing?.iconImageMime ?? null
            : draft.iconImageMime,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
    },
    async remove(id) {
      channels.delete(id);
    },
    reset() {
      channels.clear();
      for (const c of seed) channels.set(c.id, c);
    },
  };
};

// ---------- Step-kind suggestions ----------

export type FakeStepKindSuggestions = StepKindSuggestionRegistry & {
  reset(): void;
};

export const createFakeStepKindSuggestions = (): FakeStepKindSuggestions => {
  let contribs: PluginStepKindSuggestionContribution[] = [];

  return {
    forInputKind(kind) {
      const out: StepKindSuggestion[] = [];
      for (const c of contribs) {
        for (const s of c.suggestions) {
          if (s.inputKind === kind) {
            out.push({
              stepKindId: s.stepKindId,
              label: s.label,
              icon: s.icon,
              pluginId: c.pluginId,
              inputKind: s.inputKind,
              role: s.role,
            });
          }
        }
      }
      return out;
    },
    setPluginContributions(next) {
      contribs = [...next];
    },
    reset() {
      contribs = [];
    },
  };
};
