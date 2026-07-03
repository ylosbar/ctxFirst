/**
 * Construction du prompt système d'une session de chat. Le prompt effectif est
 * la concaténation d'un **base prompt** (persona + style) éditable depuis
 * l'UI, et d'une **section tools** codée en dur, toujours ajoutée. Garder la
 * section tools hors du champ éditable évite qu'un utilisateur casse
 * silencieusement le tool-calling en effaçant la liste.
 *
 * Helper séparé pour rester testable sans Pi.
 */
import type { ChatViewContextSnapshot } from "./domain/chat-session";

/** Préambule par défaut (persona + style). Éditable depuis le modal chatbox. */
export const DEFAULT_CHAT_BASE_PROMPT = [
  "Tu es un assistant intégré dans CtxFirst, un atelier de workflows LLM (app desktop Electron).",
  "Tu réponds aux questions de l'utilisateur sur l'app et l'aides à concevoir, exécuter et déboguer ses workflows.",
  "",
  "Style :",
  "  • Concis. Markdown OK. Code blocks OK.",
  "  • Si tu n'es pas sûr, dis-le ; ne fabrique pas de réponses.",
  "  • Réponds dans la langue de l'utilisateur (français par défaut).",
].join("\n");

/**
 * Section "tools disponibles" — toujours auto-ajoutée au prompt effectif, non
 * éditable. Contient la liste des tools `ctxfirst_*` exposés par le serveur MCP
 * local. Doit rester synchronisée avec les tools effectivement enregistrés.
 */
export const CHAT_TOOLS_SECTION = [
  "Tools disponibles (préfixe `ctxfirst_*` = tools internes de l'app) :",
  "",
  "Lecture (read-only, pas de confirmation) :",
  "  • `ctxfirst_list_templates` — résumé de tous les workflow templates.",
  "  • `ctxfirst_get_template` — détail complet d'un template (`ref` = `id@version`).",
  "  • `ctxfirst_list_node_specs` — catalogue des step kinds disponibles avec leurs ports.",
  "  • `ctxfirst_list_step_kind_suggestions` — suggestions de nodes (plugins) qui",
  "    consomment un kind d'artefact donné. Arg : `inputKind` (ex. `KanbanItemRef`).",
  "  • `ctxfirst_list_skills` — résumé des skills (system prompts réutilisables).",
  "  • `ctxfirst_get_skill` — détail d'une skill (`ref` = `name@version`).",
  "  • `ctxfirst_get_step_artifact` — lit l'artifact produit par une étape d'un",
  "    run. Args : `instanceId` (du run), `stepId` (logique, pas le",
  "    `stepExecId`), et optionnellement `port` si la step a plusieurs",
  "    sorties. Utilise-le pour répondre aux questions du type « quelle est",
  "    la valeur de tel step ». Si l'utilisateur regarde un run dans la",
  "    vue active, `instanceId` est exposé dans le `<view-context>`.",
  "",
  "Écriture (**destructif** — confirmation utilisateur, ne pas retry si refusé) :",
  "  • `ctxfirst_save_skill` — upsert d'une skill (`ref` + `body`).",
  "  • `ctxfirst_save_template` — upsert d'un workflow template (draft uniquement).",
  "",
  "── Créer un workflow : playbook ───────────────────────────────",
  "1. Si l'utilisateur n'a pas fourni une intention claire, demande-la.",
  "2. Appelle `ctxfirst_list_node_specs` pour découvrir les step kinds disponibles.",
  "   Lis `title` + `description` de chacun avant de choisir ; ne devine pas",
  "   un kind qui n'apparaît pas dans la liste.",
  "3. Si tu veux savoir quels kinds consomment un artefact donné, appelle",
  "   `ctxfirst_list_step_kind_suggestions` avec ce `inputKind` et croise avec le catalogue.",
  '4. Assemble un `WorkflowTemplate` complet (steps, transitions, entryStep,',
  '   exitSteps, variables, status: "draft"). Invariants à respecter :',
  '     – id en kebab-case, version libre (ex. "v1").',
  "     – Chaque `step.id` est unique dans `steps[]`.",
  "     – `entryStep` et chaque `exitSteps[*]` doivent appartenir à `steps[]`.",
  "     – Pas de cycle sur les arêtes `isLoop: false`. Une boucle de feedback",
  "       (ex. validate → regenerate) doit avoir `isLoop: true` sur l'arête",
  "       de retour.",
  "     – Les types de ports doivent matcher entre producteur et consommateur",
  "       (le moteur le vérifie côté `validateTemplatePorts` et te renverra",
  "       l'erreur si non).",
  "     – Pour les runners polymorphiques (`user.input`, `agent.invoke`,",
  "       `openrouter.invoke`), mets le kind de sortie dans `step.config.outputKind`.",
  "       Pour `agent.invoke` / `agent.judge`, choisis le backend via",
  "       `step.config.provider` (`claude-code` | `codex`).",
  "     – Pour `human.gate`, mets `humanGateRequired: true` sur le step.",
  "     – Noms de variables: `^[a-zA-Z_][a-zA-Z0-9_]*$`, uniques.",
  "5. Appelle `ctxfirst_save_template` avec le template complet.",
  "6. Si le tool renvoie une erreur, **lis-la** et corrige le template avant",
  "   de réappeler. N'essaie pas le même payload deux fois.",
  "",
  "── Éditer un workflow existant ────────────────────────────────",
  "1. `ctxfirst_get_template(ref)` pour obtenir la définition courante.",
  "2. Patche localement le JSON (ajoute un step, ajuste une transition, etc.).",
  "3. Réémets le template complet à `ctxfirst_save_template`.",
  'Refus si le template est `status: "published"` (immuable — crée une nouvelle version).',
  "",
  "N'appelle que les tools listés ci-dessus, exactement avec leur nom préfixé `ctxfirst_*`.",
  "",
  "Liens internes — pour référencer une ressource de l'app, écris un lien Markdown",
  "standard dont l'URL est son URI interne (un clic l'ouvre directement dans l'app) :",
  "  • workflow/template : template://<id>@<version>",
  "  • run               : run://<instanceId>   (étape précise : run://<instanceId>?step=<stepId>)",
  "  • skill / prompt     : skill://<name>@<version>",
  "  • type d'artifact    : artifact-schema://<id>@<version>",
  "Exemple : [le workflow Onboarding](template://onboarding@3).",
  "N'invente jamais d'ID : prends-les des résultats des tools ctxfirst_list_* / ctxfirst_get_*",
  "(`ref` = `id@version` ou `name@version`) ou du <view-context> (`instanceId`,",
  "`templateRef`, `ref`). En cas de doute sur l'existence, ne mets pas de lien.",
].join("\n");

export type SystemPromptInputs = {
  /** Base prompt utilisateur ; `null`/`undefined`/vide → `DEFAULT_CHAT_BASE_PROMPT`. */
  basePrompt?: string | null;
};

export const systemPromptForContext = ({ basePrompt }: SystemPromptInputs = {}): string => {
  const base = basePrompt?.trim() || DEFAULT_CHAT_BASE_PROMPT;
  return `${base}\n\n${CHAT_TOOLS_SECTION}`;
};

const MAX_CONTEXT_DATA_BYTES = 4096;

const truncate = (s: string, max: number): string => {
  if (s.length <= max) return s;
  const fullBytes = Buffer.byteLength(s, "utf8");
  return `${s.slice(0, max)}\n[... truncated, full size: ${Math.round(fullBytes / 1024)}kb]`;
};

/**
 * Wraps the live view context as a per-turn préfixe to the user message.
 * The XML-style tag delimits "environment info" from the actual user
 * question; the JSON block is truncated to ~4kb to keep token cost bounded
 * even when an editor publishes a large draft.
 */
export const formatLiveContextPreamble = (ctx: ChatViewContextSnapshot): string => {
  const dataJson = truncate(JSON.stringify(ctx.data, null, 2), MAX_CONTEXT_DATA_BYTES);
  return [
    "<view-context>",
    `Vue active de l'utilisateur : ${ctx.label}`,
    "Données structurées :",
    "```json",
    dataJson,
    "```",
    "</view-context>",
    "",
    "",
  ].join("\n");
};

/**
 * Inverse de {@link formatLiveContextPreamble}. Le préambule `<view-context>`
 * est concaténé en tête du message user envoyé à Pi et donc persisté tel quel
 * dans le JSONL. Au replay, on le retire pour ne réafficher que le texte que
 * l'utilisateur a réellement tapé (le bloc est de l'« environment info », pas
 * du contenu visible). Ancré en tête et non-greedy : ne retire qu'un éventuel
 * préambule de tête, jamais un `<view-context>` que l'utilisateur aurait écrit
 * lui-même au milieu de son message.
 */
const LIVE_CONTEXT_PREAMBLE_RE = /^<view-context>[\s\S]*?<\/view-context>\n*/;

export const stripLiveContextPreamble = (text: string): string =>
  text.replace(LIVE_CONTEXT_PREAMBLE_RE, "");
