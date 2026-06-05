import {
  BookOpen,
  Boxes,
  CloudDownload,
  FileDown,
  FileJson,
  FileText,
  FolderCog,
  FolderDown,
  FolderMinus,
  Gavel,
  GitBranch,
  GitBranchPlus,
  GitCommitHorizontal,
  GitFork,
  GitMerge,
  GitPullRequest,
  Layers,
  ListChecks,
  ListTree,
  Radio,
  Repeat,
  Replace,
  Sparkles,
  Split,
  Terminal,
  Ticket,
  ToggleRight,
  UserCheck,
  Webhook,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import {
  BUILTIN_ARTIFACT_KINDS,
  type ActorRole,
  type BuiltinArtifactKind,
  type StepKindId,
} from "../../../domain/workflow/types";

/**
 * Kinds builtin proposables comme discriminateur scalaire (`outputKind` /
 * `inputKind`). Dérivé de {@link BUILTIN_ARTIFACT_KINDS} — ajouter un kind là-bas
 * le fait apparaître ici automatiquement (ou l'exclut explicitement via
 * `selectableAsScalar: false`), plus aucune liste à maintenir à la main.
 */
export const ARTIFACT_KINDS: ReadonlyArray<BuiltinArtifactKind> = (
  Object.keys(BUILTIN_ARTIFACT_KINDS) as BuiltinArtifactKind[]
).filter((k) => BUILTIN_ARTIFACT_KINDS[k].selectableAsScalar);

/**
 * Visual family of a step kind — drives the accent color and the icon
 * container tint in the editor canvas. Picking a family rather than a flat
 * color means UX shifts (renaming/swapping a family palette) stay isolated
 * to {@link FAMILY_ACCENT} below.
 */
export type StepKindFamily =
  | "ai"
  | "input"
  | "human"
  | "transform"
  | "system"
  | "library";

/**
 * Usage-oriented grouping for the **plugin picker** only. Distinct on purpose
 * from {@link StepKindFamily} (which drives canvas accent colors): the picker
 * reads more naturally when control-flow nodes (branch, loops) sit together and
 * sources (spec, fetch, file, skill) are gathered under one header, even though
 * they don't all share a canvas color. Ordering of the groups is fixed by
 * {@link CATEGORY_ORDER} and follows the natural flow of a workflow.
 */
export type StepCategory =
  | "source"
  | "ai"
  | "transform"
  | "control"
  | "human"
  | "system";

/**
 * UI-only metadata for a step kind — picker ordering, localized label,
 * default actor, default config blob. Port signatures (kinds in/out) are
 * derived at runtime from {@link NodeSpecView} resolved via the engine's
 * `resolveSpec`, so they do **not** live here anymore.
 *
 * `buildDefaultConfig()` seeds polymorphic discriminators (e.g.
 * `outputKind` for `user.input` / `claude_code.invoke`, `inputKind` for `human.gate`)
 * so a freshly inserted step has a valid resolved signature out of the box.
 */
export type StepKindMeta = {
  id: StepKindId;
  label: string;
  description: string;
  defaultActor: ActorRole;
  defaultHumanGateRequired: boolean;
  icon: LucideIcon;
  family: StepKindFamily;
  /** Picker grouping — see {@link StepCategory}. */
  category: StepCategory;
  buildDefaultConfig: () => Record<string, unknown>;
};

export const STEP_KIND_CATALOG: ReadonlyArray<StepKindMeta> = [
  {
    id: "user.input",
    label: "User Input",
    description: "Point d'entrée : capture la seed fournie par l'utilisateur.",
    defaultActor: "PO",
    defaultHumanGateRequired: false,
    icon: FileText,
    family: "input",
    category: "source",
    buildDefaultConfig: () => ({ outputKind: "Markdown" }),
  },
  {
    id: "claude_code.invoke",
    label: "Claude Code Invoke",
    description: "Invocation d'un modèle dont le prompt est l'entrée du nœud.",
    defaultActor: "LLMAgent",
    defaultHumanGateRequired: false,
    icon: Sparkles,
    family: "ai",
    category: "ai",
    buildDefaultConfig: () => ({
      model: "claude-opus-4-7",
      maxTokens: 8000,
      outputKind: "Markdown",
    }),
  },
  {
    id: "codex.invoke",
    label: "Codex Invoke",
    description: "Invocation du CLI Codex (OpenAI) dont le prompt est l'entrée du nœud.",
    defaultActor: "LLMAgent",
    defaultHumanGateRequired: false,
    icon: Sparkles,
    family: "ai",
    category: "ai",
    buildDefaultConfig: () => ({
      model: "gpt-5-codex",
      maxTokens: 8000,
      outputKind: "Markdown",
    }),
  },
  {
    id: "llm.judge",
    label: "LLM Judge",
    description:
      "Évalue l'artifact d'entrée avec un LLM et route vers approved / rejected / exhausted. Sur rejected avec une transition isLoop, l'orchestrateur ré-invoque automatiquement le step amont avec le feedback du judge.",
    defaultActor: "LLMAgent",
    defaultHumanGateRequired: false,
    icon: Gavel,
    family: "ai",
    category: "ai",
    buildDefaultConfig: () => ({
      judgePrompt: "",
      model: "claude-haiku-4-5",
      maxAttempts: 3,
    }),
  },
  {
    id: "claude_code.judge",
    label: "Claude Code Judge",
    description:
      "Juge agentique (CLI Claude Code) piloté par une Skill : évalue le subject et route vers approved / rejected / exhausted. Sur rejected avec une transition isLoop, l'orchestrateur ré-invoque le step amont avec le feedback. Critères via l'input `criteria` (skill.loader) ou `config.judgePrompt`.",
    defaultActor: "LLMAgent",
    defaultHumanGateRequired: false,
    icon: Gavel,
    family: "ai",
    category: "ai",
    buildDefaultConfig: () => ({
      judgePrompt: "",
      model: "claude-opus-4-7",
      maxAttempts: 3,
      maxTokens: 8000,
    }),
  },
  {
    id: "openrouter.invoke",
    label: "OpenRouter Invoke",
    description:
      "Appelle un modèle via OpenRouter dont le prompt est l'entrée du nœud.",
    defaultActor: "LLMAgent",
    defaultHumanGateRequired: false,
    icon: Radio,
    family: "ai",
    category: "ai",
    buildDefaultConfig: () => ({
      model: "openai/gpt-4o-mini",
      maxTokens: 4000,
      outputKind: "Markdown",
    }),
  },
  {
    id: "human.gate",
    label: "Human Gate",
    description: "Pause le workflow jusqu'à validation humaine.",
    defaultActor: "Developer",
    defaultHumanGateRequired: true,
    icon: UserCheck,
    family: "human",
    category: "human",
    buildDefaultConfig: () => ({
      role: "Developer",
      prompt: "Valider ou demander un ajustement.",
      inputKind: "Markdown",
    }),
  },
  {
    id: "linear.fetch",
    label: "Linear Fetch",
    description:
      "Récupère un ticket Linear et l'expose comme un Ticket structuré (un seul artifact).",
    defaultActor: "Developer",
    defaultHumanGateRequired: false,
    icon: Ticket,
    family: "input",
    category: "source",
    buildDefaultConfig: () => ({
      ticketRef: "",
      actorRole: "PO",
    }),
  },
  {
    id: "linear.split",
    label: "Linear Split",
    description: "Éclate un Linear Ticket en title + description Markdown.",
    defaultActor: "Developer",
    defaultHumanGateRequired: false,
    icon: Split,
    family: "transform",
    category: "transform",
    buildDefaultConfig: () => ({}),
  },
  {
    id: "linear.set-status",
    label: "Linear Set Status",
    description:
      "Change le statut d'un ticket Linear (nouveau statut fourni en string) et ré-émet le Ticket mis à jour.",
    defaultActor: "Developer",
    defaultHumanGateRequired: false,
    icon: Ticket,
    family: "system",
    category: "system",
    buildDefaultConfig: () => ({
      ticketRef: "",
      status: "",
    }),
  },
  {
    id: "branch.bool",
    label: "Branch",
    description:
      "Route le workflow vers l'une de N branches selon la valeur d'un verdict (Markdown).",
    defaultActor: "Developer",
    defaultHumanGateRequired: false,
    icon: GitFork,
    family: "transform",
    category: "control",
    buildDefaultConfig: () => ({
      cases: ["true", "false"],
      inputKind: "Markdown",
    }),
  },
  {
    id: "branch.json",
    label: "Branch (JSON)",
    description:
      "Route le workflow selon un champ JSON de l'artifact d'entrée (JSONPath déterministe, aucun LLM).",
    defaultActor: "Developer",
    defaultHumanGateRequired: false,
    icon: GitFork,
    family: "transform",
    category: "control",
    buildDefaultConfig: () => ({
      path: "$.flag",
      cases: ["true", "false"],
      inputKind: "Json",
    }),
  },
  {
    id: "select.markdown",
    label: "Select (Markdown)",
    description:
      "Injecte un fragment Markdown si un flag JSONPath est vrai, sinon rien. Passe-plat, jamais de branchement — remplace un diamant branch.json d'injection conditionnelle.",
    defaultActor: "Developer",
    defaultHumanGateRequired: false,
    icon: ToggleRight,
    family: "transform",
    category: "control",
    buildDefaultConfig: () => ({ path: "$.flag" }),
  },
  {
    id: "workspace.set",
    label: "Workspace Set",
    description:
      "Change le cwd utilisé par les étapes natives suivantes (CLI Claude). N'émet aucun artifact.",
    defaultActor: "Developer",
    defaultHumanGateRequired: false,
    icon: FolderCog,
    family: "system",
    category: "system",
    buildDefaultConfig: () => ({
      cwd: "",
    }),
  },
  {
    id: "shell.exec",
    label: "Shell Exec",
    description:
      "Exécute une commande shell ; branche sur l'exit code (success/failure par défaut, ou ports nommés via `exitCodes`) et expose stdout/stderr séparément.",
    defaultActor: "Developer",
    defaultHumanGateRequired: false,
    icon: Terminal,
    family: "system",
    category: "system",
    buildDefaultConfig: () => ({
      command: "",
      useShell: false,
      timeoutMs: 60_000,
      maxOutputBytes: 256 * 1024,
    }),
  },
  {
    id: "skill.loader",
    label: "Skill Loader",
    description:
      "Charge un prompt sauvegardé de la bibliothèque et l'expose comme artifact Markdown.",
    defaultActor: "Developer",
    defaultHumanGateRequired: false,
    icon: BookOpen,
    family: "library",
    category: "source",
    buildDefaultConfig: () => ({
      skillRef: "",
    }),
  },
  {
    id: "file.load",
    label: "Load File",
    description:
      "Lit un fichier au chemin absolu (input `path` ou config) et l'expose comme artifact du kind choisi (Markdown ou Json).",
    defaultActor: "Developer",
    defaultHumanGateRequired: false,
    icon: FileDown,
    family: "input",
    category: "source",
    buildDefaultConfig: () => ({
      path: "",
      outputKind: "Markdown",
    }),
  },
  {
    id: "files.load",
    label: "Load Files",
    description:
      "Lit N fichiers sous un répertoire de base et expose chacun sur son port (Markdown ou Json).",
    defaultActor: "Developer",
    defaultHumanGateRequired: false,
    icon: FolderDown,
    family: "input",
    category: "source",
    buildDefaultConfig: () => ({
      path: "",
      slots: [{ port: "out", subpath: "", outputKind: "Markdown" }],
    }),
  },
  {
    id: "files.load-manifest",
    label: "Load Files (manifest)",
    description:
      "Charge les fichiers nommés dans un tableau JSONPath de l'artifact d'entrée (0..N), sous une base + subdir, et émet leur concaténation wrappée. Noms calculés au runtime — pas de slots statiques.",
    defaultActor: "Developer",
    defaultHumanGateRequired: false,
    icon: ListTree,
    family: "input",
    category: "source",
    buildDefaultConfig: () => ({
      selector: "$.files[*]",
      subdir: "",
      outputKind: "Json",
      wrap: { header: '<file name="{name}">', footer: "</file>" },
    }),
  },
  {
    id: "file.load-markdown",
    label: "Load Markdown File",
    description:
      "Lit un fichier Markdown au chemin absolu choisi par l'utilisateur et l'expose comme artifact Markdown.",
    defaultActor: "Developer",
    defaultHumanGateRequired: false,
    icon: FileDown,
    family: "input",
    category: "source",
    buildDefaultConfig: () => ({
      path: "",
    }),
  },
  {
    id: "concat.markdown",
    label: "Concat Markdown",
    description:
      "Concatène un Markdown principal (`main`) avec jusqu'à 3 Markdown additionnels optionnels (`markdown1..3`).",
    defaultActor: "Developer",
    defaultHumanGateRequired: false,
    icon: Layers,
    family: "transform",
    category: "transform",
    buildDefaultConfig: () => ({
      mode: "concat",
      separator: "\n\n",
      header: "",
      footer: "",
      order: "top-to-bottom",
      onMissing: "keep",
      onUnused: "append",
    }),
  },
  {
    id: "transform.run",
    label: "Transform",
    description:
      "Applique un parser saved sur l'artefact d'entrée et produit un nouvel artefact typé (`outputKind`). Déterministe.",
    defaultActor: "Developer",
    defaultHumanGateRequired: false,
    icon: Replace,
    family: "transform",
    category: "transform",
    buildDefaultConfig: () => ({
      outputKind: "Markdown",
      transformRef: { id: "", version: "" },
    }),
  },
  {
    id: "json.transform",
    label: "JSON Transform",
    description:
      "Extrait N projections d'un JSON via JSONPath. Chaque slot émet un Json (tableau des matches).",
    defaultActor: "Developer",
    defaultHumanGateRequired: false,
    icon: FileJson,
    family: "transform",
    category: "transform",
    buildDefaultConfig: () => ({
      transformations: [{ port: "out", expression: "$" }],
    }),
  },
  {
    id: "loop.foreach",
    label: "For each",
    description:
      "Itère sur un tableau en fan-out du sous-graphe jusqu'au loop.collect correspondant.",
    defaultActor: "LLMAgent",
    defaultHumanGateRequired: false,
    icon: Repeat,
    family: "transform",
    category: "control",
    buildDefaultConfig: () => ({
      itemKind: "Markdown",
    }),
  },
  {
    id: "loop.collect",
    label: "Collect",
    description:
      "Agrège les N sorties par itération d'un scope loop.foreach en un artifact liste.",
    defaultActor: "LLMAgent",
    defaultHumanGateRequired: false,
    icon: ListChecks,
    family: "transform",
    category: "control",
    buildDefaultConfig: () => ({
      itemKind: "Markdown",
    }),
  },
  {
    id: "git.worktree.create",
    label: "Git Worktree Create",
    description:
      "Crée un worktree git dédié (+ branche) et y positionne le cwd du run.",
    defaultActor: "Developer",
    defaultHumanGateRequired: false,
    icon: GitBranchPlus,
    family: "system",
    category: "system",
    buildDefaultConfig: () => ({
      repoDir: "",
      branch: "",
      baseRef: "HEAD",
      worktreesDir: ".worktrees",
    }),
  },
  {
    id: "git.commit_push",
    label: "Git Commit & Push",
    description:
      "Stage des chemins explicites, commit, rebase sur le remote, push en --force-with-lease.",
    defaultActor: "Developer",
    defaultHumanGateRequired: false,
    icon: GitCommitHorizontal,
    family: "system",
    category: "system",
    buildDefaultConfig: () => ({
      paths: [],
      message: "",
      branch: "",
      remote: "origin",
      maxRetries: 3,
    }),
  },
  {
    id: "git.worktree.remove",
    label: "Git Worktree Remove",
    description: "Supprime un worktree git et (optionnellement) sa branche locale.",
    defaultActor: "Developer",
    defaultHumanGateRequired: false,
    icon: FolderMinus,
    family: "system",
    category: "system",
    buildDefaultConfig: () => ({
      repoDir: "",
      worktreePath: "",
      deleteBranch: true,
      branch: "",
    }),
  },
  {
    id: "git.clone",
    label: "Git Clone",
    description:
      "Clone un repo distant (GitLab via token) dans un dossier et émet son chemin.",
    defaultActor: "Developer",
    defaultHumanGateRequired: false,
    icon: GitBranch,
    family: "system",
    category: "system",
    buildDefaultConfig: () => ({
      repoUrl: "",
      baseDir: "",
      folder: "",
      branch: "",
      cleanBefore: true,
    }),
  },
  {
    id: "gitlab.mr.create",
    label: "GitLab: créer une MR",
    description:
      "Crée une merge request via l'API GitLab et émet l'objet MR (iid, web_url).",
    defaultActor: "Developer",
    defaultHumanGateRequired: false,
    icon: GitPullRequest,
    family: "system",
    category: "system",
    buildDefaultConfig: () => ({
      project: "",
      sourceBranch: "",
      targetBranch: "main",
      title: "",
      description: "",
      baseUrl: "",
    }),
  },
  {
    id: "gitlab.mr.merge",
    label: "GitLab: merger une MR",
    description:
      "Merge immédiatement une merge request GitLab (cible depuis l'input ou la config).",
    defaultActor: "Developer",
    defaultHumanGateRequired: false,
    icon: GitMerge,
    family: "system",
    category: "system",
    buildDefaultConfig: () => ({
      project: "",
      mergeRequestIid: "",
      baseUrl: "",
    }),
  },
  {
    id: "gitlab.files.fetch",
    label: "GitLab : récupérer des fichiers",
    description:
      "Récupère N fichiers d'un dépôt GitLab (réf épinglée) via l'API REST et expose chacun sur son port (Markdown ou Json).",
    defaultActor: "Developer",
    defaultHumanGateRequired: false,
    icon: CloudDownload,
    family: "system",
    category: "system",
    buildDefaultConfig: () => ({
      project: "",
      ref: "",
      baseUrl: "",
      basePath: "",
      slots: [{ port: "out", subpath: "", outputKind: "Markdown" }],
    }),
  },
  {
    id: "webhook.call",
    label: "Webhook / HTTP call",
    description:
      "Appelle une API REST (URL dynamique depuis un input) et stocke la réponse JSON typée.",
    defaultActor: "Developer",
    defaultHumanGateRequired: false,
    icon: Webhook,
    family: "system",
    category: "system",
    buildDefaultConfig: () => ({ method: "GET", failOnError: true }),
  },
  {
    id: "export_run",
    label: "Export Run",
    description:
      "Snapshot complet du run (events, executions, artifacts inline, sessions LLM) en un seul JSON autocontenu.",
    defaultActor: "LLMAgent",
    defaultHumanGateRequired: false,
    icon: FileJson,
    family: "system",
    category: "system",
    buildDefaultConfig: () => ({}),
  },
  {
    id: "workflow.call",
    label: "Sous-workflow",
    description:
      "Inline le graphe d'un autre template publié au démarrage (workflow.call). Ses étapes apparaissent dans le même run, sans instance enfant.",
    defaultActor: "Developer",
    defaultHumanGateRequired: false,
    icon: Boxes,
    family: "library",
    category: "transform",
    buildDefaultConfig: () => ({ templateId: "", templateVersion: "" }),
  },
  {
    id: "template.invoke",
    label: "Invoquer un template",
    description:
      "Démarre une instance enfant isolée d'un autre template publié (template.invoke). L'enfant tourne dans son propre run, branché au parent par ses variables d'interface.",
    defaultActor: "Developer",
    defaultHumanGateRequired: false,
    icon: GitFork,
    family: "library",
    category: "transform",
    buildDefaultConfig: () => ({ templateId: "", templateVersion: "" }),
  },
];

export const getKindMeta = (kind: StepKindId): StepKindMeta | undefined =>
  STEP_KIND_CATALOG.find((k) => k.id === kind);

export const iconForKind = (kind: string): LucideIcon =>
  getKindMeta(kind)?.icon ?? Workflow;

export const familyForKind = (kind: string): StepKindFamily =>
  getKindMeta(kind)?.family ?? "system";

/**
 * Accent color per step-kind family — the single place a family maps to a hue.
 * Drives the colored top "filet" and the tinted icon chip on the canvas node
 * ({@link StepNode}), and the matching icon chip in the inspector header
 * ({@link StepInspector}), so a selected node keeps the same visual identity
 * across canvas and inspector. Hand-picked (not hashed) so the palette stays
 * coherent and recognizable across boots and themes.
 */
export const FAMILY_ACCENT: Record<StepKindFamily, string> = {
  ai: "hsl(262 72% 62%)",
  input: "hsl(210 82% 56%)",
  human: "hsl(35 92% 55%)",
  transform: "hsl(168 62% 44%)",
  system: "hsl(222 12% 58%)",
  library: "hsl(330 68% 60%)",
};

export const accentForKind = (kind: string): string =>
  FAMILY_ACCENT[familyForKind(kind)];

/** Localized label per family — shown as a tag in the inspector header. */
export const FAMILY_LABEL: Record<StepKindFamily, string> = {
  ai: "IA",
  input: "Entrée",
  human: "Humain",
  transform: "Transform",
  system: "Système",
  library: "Bibliothèque",
};

/**
 * Fixed display order of the picker groups — follows the natural flow of a
 * workflow (sources → génération → transformation → flux → humain → système).
 * The picker iterates this array, so a category absent here never renders.
 */
export const CATEGORY_ORDER: ReadonlyArray<StepCategory> = [
  "source",
  "ai",
  "transform",
  "control",
  "human",
  "system",
];

/** Localized header label per picker category. */
export const CATEGORY_LABEL: Record<StepCategory, string> = {
  source: "Sources / Entrées",
  ai: "Génération IA",
  transform: "Transformation",
  control: "Flux / Contrôle",
  human: "Validation humaine",
  system: "Système / Exécution",
};

/**
 * Icon shown next to each category in the two-level picker — reuses the
 * dominant icon of each family so the root menu reads as a tight summary of
 * what's inside before the submenu is opened.
 */
export const CATEGORY_ICON: Record<StepCategory, LucideIcon> = {
  source: FileDown,
  ai: Sparkles,
  transform: Replace,
  control: GitFork,
  human: UserCheck,
  system: Terminal,
};

/**
 * Polymorphic runners declare a config-level discriminator that drives their
 * resolved signature. The inspector renders a select for whichever
 * discriminator a kind exposes.
 */
export type PolymorphismDiscriminator =
  | { kind: "outputKind" }
  | { kind: "inputKind" };

export const polymorphismOf = (
  kind: StepKindId,
): PolymorphismDiscriminator | null => {
  switch (kind) {
    case "user.input":
    case "claude_code.invoke":
    case "codex.invoke":
    case "openrouter.invoke":
    case "transform.run":
    case "webhook.call":
      return { kind: "outputKind" };
    case "human.gate":
      return { kind: "inputKind" };
    default:
      return null;
  }
};
