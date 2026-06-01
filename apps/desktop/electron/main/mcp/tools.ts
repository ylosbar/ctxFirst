import { z, type ZodTypeAny } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  AgentToolProvider,
  LocalToolSpec,
} from "../chat/application/ports/outbound/agent-tool-provider";
import type { WfEngine } from "../wf/composition-root";
import { asSkillRef, asWorkflowId } from "../wf/domain/ids";
import type { ArtifactKind } from "../wf/domain/artifact";
import { toUserArtifactKind } from "../wf/domain/artifact-schema";
import type {
  ArtifactSchemaRecord,
  SaveUserArtifactSchema,
} from "../wf/domain/artifact-schema";
import type { Skill } from "../wf/domain/skill";
import type { WorkflowTemplate } from "../wf/domain/template";

const summarize = (tpl: WorkflowTemplate) => ({
  id: tpl.id,
  version: tpl.version,
  ref: `${tpl.id}@${tpl.version}`,
  name: tpl.name,
  description: tpl.description,
  status: tpl.status,
  stepCount: tpl.steps.length,
  transitionCount: tpl.transitions.length,
  variableCount: tpl.variables.length,
});

const summarizeSkill = (skill: Skill) => ({
  ref: skill.ref,
  meta: skill.meta,
  bodyPreview: skill.body.slice(0, 200),
  bodyLength: skill.body.length,
});

/**
 * Forme compacte d'un artifact kind pour `ctxfirst_list_artifact_kinds` — le
 * `kind` canonique sert de clé à passer à `ctxfirst_get_artifact_kind`. On ne
 * remonte ni le schéma Zod compilé (non sérialisable) ni la projection `fn`
 * (ne traverse pas la frontière MCP), comme la projection IPC `wf:listArtifactSchemas`.
 */
const summarizeArtifactKind = (record: ArtifactSchemaRecord) => ({
  kind: record.kind,
  id: record.id,
  version: record.version,
  name: record.name,
  description: record.description,
  source: record.source,
  extends: record.extends,
  synthesized: record.synthesized,
});

/**
 * Forme détaillée d'un artifact kind pour `ctxfirst_get_artifact_kind` /
 * `ctxfirst_save_artifact_kind`. Projette les schémas JSON (raw + simplified) et
 * le gabarit Markdown, sans le `schema` Zod ni la projection `fn`.
 */
const detailArtifactKind = (record: ArtifactSchemaRecord) => ({
  ...summarizeArtifactKind(record),
  rawSchema: record.rawSchema,
  simplifiedSchema: record.simplifiedSchema,
  sampleRaw: record.sampleRaw,
  sample: record.sample,
  structuralHash: record.structuralHash,
  markdownTemplate:
    record.markdownProjection?.kind === "template"
      ? record.markdownProjection.template
      : null,
});

// Le SDK MCP embarque son propre `zod` (nested resolution) ; TypeScript voit
// donc deux instances structurelles distinctes du même module. Le runtime
// fonctionne — on caste l'API au plus haut niveau pour traverser la frontière.
type ToolConfig = {
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};
type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;
type RegisterTool = (
  name: string,
  config: ToolConfig,
  handler: ToolHandler,
) => unknown;

type ToolGroup = "template" | "skill" | "artifact" | "run";

/**
 * Type effectif d'un paramètre de tool MCP, après unwrap d'éventuels
 * `.optional()` / `.default()`. Couvre les formes utilisées dans `tools.ts` ;
 * tout le reste retombe sur `"json"` (l'UI affiche un Textarea JSON).
 */
export type McpToolParamInfo = {
  name: string;
  description: string;
  kind: "string" | "number" | "boolean" | "json";
  optional: boolean;
};

/**
 * Static metadata for a tool registered on the local MCP server. Mirrors what
 * the SDK would expose via `tools/list` but is computed eagerly so the renderer
 * can display the catalog without round-tripping to the HTTP transport.
 */
export type McpToolInfo = {
  name: string;
  title: string;
  description: string;
  group: ToolGroup;
  /** Input parameter declarations, in declaration order. */
  parameters: ReadonlyArray<McpToolParamInfo>;
};

/** Résultat d'une invocation de tool MCP via le handler IPC `mcp:invokeTool`. */
export type McpInvokeResult =
  | { ok: true; text: string; durationMs: number }
  | { ok: false; error: string; durationMs: number };

type ToolDescriptor = {
  name: string;
  title: string;
  description: string;
  group: ToolGroup;
  inputSchema: Record<string, ZodTypeAny>;
  /**
   * Marque les tools dont l'exécution mute l'état (DB, fs). Le chat Pi
   * demande une confirmation utilisateur avant `execute` quand ce flag
   * vaut `true`. Source de vérité unique pour le gating.
   */
  destructive?: boolean;
  handler: (engine: WfEngine, args: Record<string, unknown>) => Promise<unknown>;
};

/**
 * `_def.type` (Zod v4) est interne à Zod ; on l'utilise volontairement pour
 * exposer le `kind` effectif d'un paramètre au playground UI. Toute
 * structure non reconnue retombe sur `"json"` (Textarea), donc une montée
 * de version Zod n'a pas d'effet bloquant — seul le rendu est dégradé.
 */
const describeParam = (name: string, type: ZodTypeAny): McpToolParamInfo => {
  let inner: ZodTypeAny = type;
  let optional = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let def = inner._def as any;
  while (def?.type === "optional" || def?.type === "default") {
    optional = true;
    inner = def.innerType as ZodTypeAny;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    def = inner._def as any;
  }
  const typeName: string = def?.type ?? "";
  const kind: McpToolParamInfo["kind"] =
    typeName === "string"
      ? "string"
      : typeName === "number"
        ? "number"
        : typeName === "boolean"
          ? "boolean"
          : "json";
  return {
    name,
    description: type.description ?? inner.description ?? "",
    kind,
    optional,
  };
};

const describeSchema = (
  schema: Record<string, ZodTypeAny>,
): ReadonlyArray<McpToolParamInfo> =>
  Object.entries(schema).map(([name, type]) => describeParam(name, type));

const TEMPLATE_TOOLS: ReadonlyArray<ToolDescriptor> = [
  {
    name: "ctxfirst_list_templates",
    title: "Liste les workflow templates",
    description:
      "Retourne un résumé de tous les workflow templates enregistrés " +
      "(brouillons et publiés). Chaque entrée fournit le `ref` canonique " +
      "(`id@version`) à passer à `ctxfirst_get_template` pour obtenir le détail.",
    group: "template",
    inputSchema: {},
    handler: async (engine) => {
      const tpls = await engine.listTemplates();
      const summaries = tpls.map(summarize);
      return {
        content: [{ type: "text", text: JSON.stringify(summaries, null, 2) }],
      };
    },
  },
  {
    name: "ctxfirst_get_template",
    title: "Détail d'un workflow template",
    description:
      "Retourne la définition complète d'un workflow template (steps, " +
      "transitions, variables) à partir de sa référence canonique " +
      "`id@version`. Utiliser `ctxfirst_list_templates` au préalable pour " +
      "découvrir les refs disponibles.",
    group: "template",
    inputSchema: {
      ref: z
        .string()
        .min(1)
        .describe("Référence canonique du template au format `id@version`"),
    },
    handler: async (engine, args) => {
      const { ref } = args as { ref: string };
      const tpl = await engine.getTemplate(ref);
      return {
        content: [{ type: "text", text: JSON.stringify(tpl, null, 2) }],
      };
    },
  },
  {
    name: "ctxfirst_save_template",
    title: "Crée ou édite un workflow template (draft)",
    description:
      "Upsert d'un workflow template par sa paire `(id, version)`. Si la ref " +
      '`id@version` existe déjà ET est en `status: "draft"`, elle est ' +
      "remplacée. Si elle est `published`, refuse (publication = immuable). " +
      "Le payload `template` doit être un `WorkflowTemplate` complet : " +
      "`steps` (array), `transitions` (array), `variables` (array, [] si " +
      "aucune), `entryStep` (string), `exitSteps` (array), `status` ('draft'). " +
      "Validation structurelle (entry/exit ∈ steps, pas de cycle non-loop) + " +
      "typage des ports appliqués côté moteur ; toute violation renvoie un " +
      "message d'erreur texte que tu DOIS lire pour corriger. " +
      "⚠ Tool destructif : confirmation utilisateur requise.",
    group: "template",
    destructive: true,
    inputSchema: {
      template: z
        .record(z.string(), z.unknown())
        .describe(
          "Objet WorkflowTemplate complet (cf. specs/chat-workflow-authoring.md §Format). " +
            "status DOIT valoir 'draft' (la publication est manuelle, hors chat).",
        ),
    },
    handler: async (engine, args) => {
      const { template } = args as { template: Record<string, unknown> };
      // Accepte `draft` ou `published`. La publication via MCP est autorisée
      // (un sous-template doit être `published` pour être inliné par un
      // `workflow.call`, cf. validate-workflow-calls §Rule 1) ; l'immutabilité
      // d'une ref déjà publiée reste protégée par le garde-fou ci-dessous.
      if (template["status"] !== "draft" && template["status"] !== "published") {
        throw new Error(
          'ctxfirst_save_template: `status` doit valoir "draft" ou "published".',
        );
      }
      // Garde-fou supplémentaire : si la ref existe déjà en `published`, on refuse.
      const id = template["id"];
      const version = template["version"];
      if (typeof id === "string" && typeof version === "string") {
        const existing = await engine
          .getTemplate(`${id}@${version}`)
          .catch(() => null);
        if (existing && existing.status === "published") {
          throw new Error(
            `ctxfirst_save_template: ${id}@${version} est publié (immutable). ` +
              "Crée une nouvelle version (ex. `v2`) si tu veux itérer.",
          );
        }
      }
      // Validation runtime déléguée à makeSaveTemplate (validateTemplate +
      // validateTemplatePorts) ; le cast traverse juste le branding du domaine.
      await engine.saveTemplate(template as unknown as WorkflowTemplate);
      const saved = await engine.getTemplate(`${id}@${version}`);
      return {
        content: [{ type: "text", text: JSON.stringify(summarize(saved), null, 2) }],
      };
    },
  },
];

const NODE_SPEC_TOOLS: ReadonlyArray<ToolDescriptor> = [
  {
    name: "ctxfirst_list_node_specs",
    title: "Catalogue des step kinds (nodes disponibles)",
    description:
      "Retourne tous les step kinds enregistrés dans le moteur, avec leur " +
      "titre, description, ports d'entrée (name, kinds acceptés, optional/isList/primary) " +
      "et ports de sortie (name, kind produit). À utiliser AVANT de créer ou " +
      "modifier un workflow via `ctxfirst_save_template`, pour choisir les bons " +
      "`kind` et câbler les transitions correctement. " +
      "⚠ Les runners polymorphiques (ex. `user.input`, `claude_code.invoke`, " +
      "`openrouter.invoke`) lisent leur kind de sortie depuis `step.config.outputKind` ; " +
      "le `kind` retourné ici est un fallback du picker.",
    group: "template",
    inputSchema: {},
    handler: async (engine) => {
      const specs = await engine.listNodeSpecs();
      return { content: [{ type: "text", text: JSON.stringify(specs, null, 2) }] };
    },
  },
  {
    name: "ctxfirst_list_step_kind_suggestions",
    title: "Suggestions de step kinds contribuées par les plugins",
    description:
      "Retourne les suggestions de step kinds (contributed by plugins, ex. " +
      "kanban) déclarées pertinentes pour le kind d'artefact `inputKind` " +
      "(c.-à-d. les nodes capables de consommer ce kind en entrée). " +
      "Complément optionnel à `ctxfirst_list_node_specs` quand tu cherches un " +
      "node qui consomme un kind spécifique.",
    group: "template",
    inputSchema: {
      inputKind: z
        .string()
        .min(1)
        .describe(
          "Kind d'artefact d'entrée à matcher (ex. `KanbanItemRef`, `Markdown`).",
        ),
    },
    handler: async (engine, args) => {
      const { inputKind } = args as { inputKind: string };
      const suggestions = await engine.listStepKindSuggestions(
        inputKind as ArtifactKind,
      );
      return {
        content: [{ type: "text", text: JSON.stringify(suggestions, null, 2) }],
      };
    },
  },
];

const SKILL_TOOLS: ReadonlyArray<ToolDescriptor> = [
  {
    name: "ctxfirst_list_skills",
    title: "Liste les skills (system prompts)",
    description:
      "Retourne un résumé de toutes les skills enregistrées (prompts " +
      "système utilisés par les steps `claude_code.invoke` et " +
      "`openrouter.invoke`). Chaque entrée fournit le `ref` canonique " +
      "(`name@version`), la meta et un aperçu du body — utiliser " +
      "`ctxfirst_get_skill` pour obtenir le body complet.",
    group: "skill",
    inputSchema: {},
    handler: async (engine) => {
      const skills = await engine.listSkills();
      const summaries = skills.map(summarizeSkill);
      return {
        content: [{ type: "text", text: JSON.stringify(summaries, null, 2) }],
      };
    },
  },
  {
    name: "ctxfirst_get_skill",
    title: "Détail d'une skill",
    description:
      "Retourne la définition complète d'une skill (body + meta) à " +
      "partir de sa référence canonique `name@version`. Utiliser " +
      "`ctxfirst_list_skills` au préalable pour découvrir les refs disponibles.",
    group: "skill",
    inputSchema: {
      ref: z
        .string()
        .min(1)
        .describe("Référence canonique de la skill au format `name@version`"),
    },
    handler: async (engine, args) => {
      const { ref } = args as { ref: string };
      const skill = await engine.getSkill(asSkillRef(ref));
      return {
        content: [{ type: "text", text: JSON.stringify(skill, null, 2) }],
      };
    },
  },
  {
    name: "ctxfirst_save_skill",
    title: "Crée ou édite une skill",
    description:
      "Upsert d'une skill par sa `ref` (`name@version`). Si la ref " +
      "existe déjà, le body et la meta sont remplacés ; sinon une " +
      "nouvelle skill est créée dans le channel actif. La meta est un " +
      'objet libre (ex. `{ outputKind: "Markdown" }`). Tool destructif : ' +
      "l'app demande une confirmation utilisateur avant exécution.",
    group: "skill",
    destructive: true,
    inputSchema: {
      ref: z
        .string()
        .min(1)
        .describe("Référence canonique de la skill au format `name@version`"),
      body: z
        .string()
        .min(1)
        .describe("Texte du system prompt envoyé tel quel au LLM"),
      meta: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Métadonnées libres (ex. `{ outputKind: "Markdown" }`)'),
    },
    handler: async (engine, args) => {
      const { ref, body, meta } = args as {
        ref: string;
        body: string;
        meta?: Record<string, unknown>;
      };
      await engine.saveSkill({
        ref: asSkillRef(ref),
        body,
        meta: meta ?? {},
      });
      const saved = await engine.getSkill(asSkillRef(ref));
      return {
        content: [{ type: "text", text: JSON.stringify(saved, null, 2) }],
      };
    },
  },
];

const ARTIFACT_TOOLS: ReadonlyArray<ToolDescriptor> = [
  {
    name: "ctxfirst_list_artifact_kinds",
    title: "Liste les artifact kinds (types d'artefacts)",
    description:
      "Retourne tous les artifact kinds visibles dans le channel actif : " +
      "built-ins (`String`, `Markdown`, `Json`, …), types contribués par les " +
      "plugins (`source.kind = 'plugin'`) et types utilisateur " +
      "(`source.kind = 'user'`, les seuls éditables). Chaque entrée fournit le " +
      "`kind` canonique à passer à `ctxfirst_get_artifact_kind` pour le détail " +
      "(schéma JSON). Utiliser ce catalogue AVANT de câbler des ports de " +
      "workflow ou de créer un nouveau type via `ctxfirst_save_artifact_kind`.",
    group: "artifact",
    inputSchema: {},
    handler: async (engine) => {
      const records = await engine.listArtifactSchemas();
      const summaries = records.map(summarizeArtifactKind);
      return {
        content: [{ type: "text", text: JSON.stringify(summaries, null, 2) }],
      };
    },
  },
  {
    name: "ctxfirst_get_artifact_kind",
    title: "Détail d'un artifact kind",
    description:
      "Retourne la définition complète d'un artifact kind (schéma JSON " +
      "`simplifiedSchema`, `rawSchema` éventuel, samples, `extends`, gabarit " +
      "Markdown) à partir de son `kind` canonique. Le `kind` est la chaîne " +
      "exacte remontée par `ctxfirst_list_artifact_kinds` : un built-in " +
      "(`Markdown`), un type plugin (`plugin:<id>:<name>@<version>`), un type " +
      "utilisateur (`user:<id>@<version>`) ou un kind paramétrique " +
      "(`List<String>`, `OneOf<String,Number>`).",
    group: "artifact",
    inputSchema: {
      kind: z
        .string()
        .min(1)
        .describe(
          "Kind canonique de l'artefact (ex. `Markdown`, `user:Brief@v1`, `List<String>`).",
        ),
    },
    handler: async (engine, args) => {
      const { kind } = args as { kind: string };
      const record = engine.artifactSchemas.resolve(kind as ArtifactKind);
      if (!record) {
        throw new Error(
          `Artifact kind inconnu: "${kind}". Utilise ctxfirst_list_artifact_kinds ` +
            "pour découvrir les kinds disponibles.",
        );
      }
      return {
        content: [
          { type: "text", text: JSON.stringify(detailArtifactKind(record), null, 2) },
        ],
      };
    },
  },
  {
    name: "ctxfirst_save_artifact_kind",
    title: "Crée ou édite un artifact kind (type utilisateur)",
    description:
      "Upsert d'un artifact kind **utilisateur** par sa paire `(id, version)`. " +
      "Si `user:<id>@<version>` existe déjà, sa définition est remplacée ; " +
      "sinon un nouveau type est créé dans le channel actif. Seuls les types " +
      "utilisateur sont éditables : tenter d'écrire sur un id de built-in " +
      "(`String`, `Markdown`, …) ou un type plugin est refusé par le moteur. " +
      "`simplifiedSchema` est OBLIGATOIRE et doit être un objet JSON Schema " +
      "décrivant le payload simplifié (ce que les runners produisent). " +
      "`extends` (optionnel) référence un super-type pour un raffinement " +
      "(covariance). `markdownTemplate` (optionnel) est un gabarit `{{champ}}`. " +
      "⚠ Tool destructif : confirmation utilisateur requise.",
    group: "artifact",
    destructive: true,
    inputSchema: {
      id: z
        .string()
        .min(1)
        .describe("Id logique du type (ex. `Brief`). Immuable une fois publié."),
      version: z
        .string()
        .min(1)
        .describe("Version logique (ex. `v1`). Bumper = nouveau type, ancien préservé."),
      name: z.string().min(1).describe("Nom lisible affiché dans le kind picker."),
      description: z
        .string()
        .optional()
        .describe("Description courte du type (optionnel)."),
      simplifiedSchema: z
        .record(z.string(), z.unknown())
        .describe(
          "Objet JSON Schema décrivant le payload simplifié (obligatoire). " +
            "Ex. `{ type: 'object', properties: { value: { type: 'string' } }, required: ['value'] }`.",
        ),
      rawSchema: z
        .record(z.string(), z.unknown())
        .nullish()
        .describe("JSON Schema optionnel du payload brut (parser playground)."),
      sampleRaw: z
        .string()
        .nullish()
        .describe("Exemple optionnel de payload brut."),
      sample: z
        .unknown()
        .optional()
        .describe(
          "Exemple optionnel de payload conforme à `simplifiedSchema` (sinon auto-dérivé).",
        ),
      extends: z
        .string()
        .nullish()
        .describe(
          "Super-type pour raffinement (ex. `String`). `null`/omis pour un type racine.",
        ),
      markdownTemplate: z
        .string()
        .nullish()
        .describe("Gabarit Markdown `{{champ}}` optionnel pour la projection."),
    },
    handler: async (engine, args) => {
      const input = args as {
        id: string;
        version: string;
        name: string;
        description?: string;
        simplifiedSchema: Record<string, unknown>;
        rawSchema?: Record<string, unknown> | null;
        sampleRaw?: string | null;
        sample?: unknown;
        extends?: string | null;
        markdownTemplate?: string | null;
      };
      const payload: SaveUserArtifactSchema = {
        id: input.id,
        version: input.version,
        name: input.name,
        description: input.description,
        simplifiedSchema: input.simplifiedSchema,
        rawSchema: input.rawSchema ?? null,
        sampleRaw: input.sampleRaw ?? null,
        sample: input.sample ?? null,
        extends: (input.extends ?? null) as ArtifactKind | null,
        markdownTemplate: input.markdownTemplate ?? null,
      };
      // Validation runtime (id/version/name + JSON Schema) déléguée à
      // makeSaveArtifactSchema ; le registry refuse les collisions builtin/plugin.
      await engine.saveArtifactSchema(payload);
      const saved = engine.artifactSchemas.resolve(
        toUserArtifactKind({ id: input.id, version: input.version }),
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(saved ? detailArtifactKind(saved) : null, null, 2),
          },
        ],
      };
    },
  },
];

/**
 * Limite indicative pour le `content` retourné par `ctxfirst_get_step_artifact`.
 * Au-delà, on tronque et on expose `truncated: true` + `fullSizeBytes`. La
 * borne reste sous l'ordre de grandeur d'un seul tour de chat — un artifact
 * géant ne doit pas pouvoir asphyxier le contexte de la session.
 */
const ARTIFACT_CONTENT_MAX_BYTES = 32_768;

const RUN_TOOLS: ReadonlyArray<ToolDescriptor> = [
  {
    name: "ctxfirst_get_step_artifact",
    title: "Récupère un artifact produit par une étape d'un run",
    description:
      "Retourne le contenu de l'artifact produit par l'étape `stepId` du " +
      "run `instanceId`. Par défaut renvoie le slot de sortie principal " +
      "de la dernière exécution du step (la plus récente après " +
      "éventuelles boucles). Précise `port` si la step expose plusieurs " +
      "sorties (la liste `availablePorts` te dit lesquelles existent). Le " +
      `contenu est tronqué à ${Math.round(ARTIFACT_CONTENT_MAX_BYTES / 1024)} ` +
      "Ko ; `fullSizeBytes` et `truncated` te le signalent.",
    group: "run",
    inputSchema: {
      instanceId: z
        .string()
        .min(1)
        .describe("Identifiant du run (workflow instance)."),
      stepId: z
        .string()
        .min(1)
        .describe("`stepId` logique du step dans le template (pas le `stepExecId`)."),
      port: z
        .string()
        .min(1)
        .optional()
        .describe(
          "Nom du slot de sortie à lire. Omettre = slot principal (`out` " +
            "s'il existe, sinon le premier produit).",
        ),
    },
    handler: async (engine, args) => {
      const { instanceId, stepId, port } = args as {
        instanceId: string;
        stepId: string;
        port?: string;
      };
      const state = await engine.getInstanceTimeline(asWorkflowId(instanceId));
      if (!state) {
        throw new Error(`Run inconnu: instanceId=${instanceId}`);
      }
      const execs = state.executions.filter((e) => e.stepId === stepId);
      if (execs.length === 0) {
        throw new Error(
          `Aucune exécution trouvée pour stepId=${stepId} dans le run ${instanceId}`,
        );
      }
      // Last execution wins — couvre le cas des loops (la dernière itération
      // est la version courante du step pour la lecture).
      const exec = execs[execs.length - 1];
      const availablePorts = [...exec.outputs.keys()];
      const targetPort =
        port ??
        (exec.outputs.has("out") ? "out" : availablePorts[0]);
      if (!targetPort) {
        throw new Error(
          `Le step ${stepId} (status=${exec.status}) n'a produit aucun artifact.`,
        );
      }
      const artifactId = exec.outputs.get(targetPort);
      if (!artifactId) {
        throw new Error(
          `Aucun artifact sur le port "${targetPort}" du step ${stepId}. ` +
            `Ports disponibles: ${availablePorts.length > 0 ? availablePorts.join(", ") : "aucun"}.`,
        );
      }
      const { meta, content } = await engine.artifactStore.get(artifactId);
      const fullSizeBytes = Buffer.byteLength(content, "utf8");
      const truncated = content.length > ARTIFACT_CONTENT_MAX_BYTES;
      const body = truncated
        ? `${content.slice(0, ARTIFACT_CONTENT_MAX_BYTES)}\n[... contenu tronqué]`
        : content;
      const payload = {
        instanceId,
        stepId,
        stepExecId: exec.id,
        stepExecStatus: exec.status,
        port: targetPort,
        availablePorts,
        artifactId,
        kind: meta.kind,
        hash: meta.hash,
        metadata: meta.metadata,
        createdAt: meta.createdAt,
        fullSizeBytes,
        truncated,
        content: body,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      };
    },
  },
];

const ALL_TOOLS: ReadonlyArray<ToolDescriptor> = [
  ...TEMPLATE_TOOLS,
  ...NODE_SPEC_TOOLS,
  ...SKILL_TOOLS,
  ...ARTIFACT_TOOLS,
  ...RUN_TOOLS,
];

const TOOLS_BY_NAME: ReadonlyMap<string, ToolDescriptor> = new Map(
  ALL_TOOLS.map((t) => [t.name, t]),
);

/**
 * Invoque un tool MCP en bypass du transport HTTP : on retrouve le
 * `ToolDescriptor` enregistré, on valide les `args` via le schéma Zod,
 * puis on appelle le handler avec le même `engine` que celui passé au
 * serveur. Sert au playground in-app (debug-loop court côté dev).
 *
 * Voie "direct call" pour debug local — si un futur middleware MCP est
 * ajouté au registerTool du SDK (auth, transformation), ce chemin ne le
 * verra pas.
 */
export const invokeMcpTool = async (
  engine: WfEngine,
  name: string,
  args: Record<string, unknown>,
): Promise<{ text: string }> => {
  const tool = TOOLS_BY_NAME.get(name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  const parsed = z.object(tool.inputSchema).parse(args);
  const result = (await tool.handler(engine, parsed)) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = (result.content ?? [])
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("\n");
  return { text };
};

const registerGroup = (
  server: McpServer,
  engine: WfEngine,
  group: ReadonlyArray<ToolDescriptor>,
): void => {
  const registerTool = server.registerTool.bind(server) as RegisterTool;
  for (const tool of group) {
    registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      (args) => tool.handler(engine, args),
    );
  }
};

export const registerTemplateTools = (
  server: McpServer,
  engine: WfEngine,
): void => registerGroup(server, engine, TEMPLATE_TOOLS);

export const registerNodeSpecTools = (
  server: McpServer,
  engine: WfEngine,
): void => registerGroup(server, engine, NODE_SPEC_TOOLS);

export const registerSkillTools = (
  server: McpServer,
  engine: WfEngine,
): void => registerGroup(server, engine, SKILL_TOOLS);

export const registerArtifactTools = (
  server: McpServer,
  engine: WfEngine,
): void => registerGroup(server, engine, ARTIFACT_TOOLS);

export const registerRunTools = (
  server: McpServer,
  engine: WfEngine,
): void => registerGroup(server, engine, RUN_TOOLS);

/** Static catalog of tools registered on the MCP server, for UI display. */
export const listMcpTools = (): ReadonlyArray<McpToolInfo> =>
  ALL_TOOLS.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    group: tool.group,
    parameters: describeSchema(tool.inputSchema),
  }));

/**
 * Factory du provider consommé par l'adapter Pi : projette chaque
 * `ToolDescriptor` en `LocalToolSpec` (sans révéler Zod ni le `WfEngine` au
 * module `chat`), et délègue l'invocation à `invokeMcpTool` — exactement le
 * même code path que le playground.
 */
export const createMcpToolProvider = (engine: WfEngine): AgentToolProvider => ({
  list: (): ReadonlyArray<LocalToolSpec> =>
    ALL_TOOLS.map((t) => ({
      name: t.name,
      description: t.title ? `${t.title} — ${t.description}` : t.description,
      params: describeSchema(t.inputSchema),
      destructive: t.destructive ?? false,
    })),
  invoke: (name, args) => invokeMcpTool(engine, name, args),
});
