/**
 * Adapter `@earendil-works/pi-coding-agent` du port `AgentSessionGateway`.
 *
 * Pi tourne dans le main process Electron. On l'isole de tout filesystem
 * "utilisateur" (pas de `~/.pi/...`, pas de SYSTEM.md/AGENTS.md du cwd) en
 * passant des managers `inMemory()` et un `DefaultResourceLoader` qui désactive
 * skills/themes/extensions/context-files. Le seul output sur disque est le
 * fichier JSONL de session, persisté sous `<userData>/pi-sessions/`.
 *
 * Le modèle est construit à la main (pas de `getModel(...)` car le SDK n'a
 * pas de catalogue OpenRouter typé statiquement — l'utilisateur saisit l'id
 * exact dans Settings).
 */
import type { Model } from "@earendil-works/pi-ai";
import type { AgentMessage, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import path from "node:path";
import { Type, type TSchema } from "@sinclair/typebox";
import type { ChatEvent } from "../chat-event-types";
import type {
  AgentSessionGateway,
  AgentSessionHandle,
} from "../application/ports/outbound/agent-session-gateway";
import type {
  AgentToolProvider,
  LocalToolParam,
  LocalToolSpec,
} from "../application/ports/outbound/agent-tool-provider";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

type Deps = {
  /** Résout la clé OpenRouter à chaque création de session. */
  getOpenRouterApiKey: () => Promise<string | null>;
  /**
   * cwd "neutre" passé à Pi (header de session + ResourceLoader). N'est pas
   * censé être lu (les flags `no*` du ResourceLoader désactivent les scans),
   * mais Pi en a besoin pour ses APIs internes.
   */
  cwd: string;
  /**
   * Phase B : provider des tools locaux exposés au LLM via `customTools`.
   * Découplé du `WfEngine` / module `mcp` — l'adapter ne voit que ce port.
   */
  toolProvider: AgentToolProvider;
};

/**
 * Construit un `Model<openai-completions>` pour un id OpenRouter arbitraire.
 * OpenRouter expose une API OpenAI-compatible — le provider `openai-completions`
 * de pi-ai sait la consommer pourvu que `baseUrl` pointe vers OpenRouter.
 *
 * On ne dispose pas (et n'a pas besoin) des vrais coûts/contextWindow par
 * modèle : 200k / 8k sont des bornes safe pour la v1, Pi tronque/compacte si
 * besoin via sa propre logique.
 */
const makeOpenRouterModel = (modelId: string): Model<"openai-completions"> => ({
  id: modelId,
  name: modelId,
  api: "openai-completions",
  provider: "openrouter",
  baseUrl: OPENROUTER_BASE_URL,
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 200_000,
  maxTokens: 8192,
  headers: {
    "HTTP-Referer": "https://ctxfirst.com/ctxfirst",
    "X-Title": "CtxFirst Desktop",
  },
});

/**
 * Parse le model id stocké en SQLite. v1 : on accepte soit "openrouter:<id>"
 * (préfixé), soit juste "<id>" (assumé OpenRouter). Les autres providers
 * arriveront en suivi (cf. spec §13).
 */
const parseModel = (raw: string): { provider: "openrouter"; modelId: string } => {
  const trimmed = raw.trim();
  if (trimmed.startsWith("openrouter:")) {
    return { provider: "openrouter", modelId: trimmed.slice("openrouter:".length) };
  }
  return { provider: "openrouter", modelId: trimmed };
};

/**
 * Extrait le texte concaténé d'un message assistant Pi (ignore les blocs
 * `thinking` et `toolCall`).
 */
const extractAssistantText = (msg: AgentMessage): string => {
  if (msg.role !== "assistant") return "";
  let out = "";
  for (const part of msg.content) {
    if (part.type === "text") out += part.text;
  }
  return out;
};

/**
 * Mapper les événements bruts Pi (AgentSessionEvent) vers notre projection
 * stable ChatEvent. Retourne `null` pour les events qu'on ignore en Phase A
 * (queue updates, compaction, retries, thinking-level changes, …).
 */
const mapPiEvent = (
  ev: AgentSessionEvent,
  sessionId: string,
  entryIdOf: (msg: AgentMessage) => string,
): ChatEvent | null => {
  switch (ev.type) {
    case "message_update": {
      // Pi nous donne le message partiel courant + l'event diff bas-niveau.
      // On émet l'accumulation textuelle complète comme "delta" et on laisse
      // l'UI faire le diff (plus simple que de tracer l'offset précédent ici).
      if (ev.message.role !== "assistant") return null;
      const text = extractAssistantText(ev.message);
      return {
        type: "text_delta",
        sessionId,
        entryId: entryIdOf(ev.message),
        delta: text,
      };
    }
    case "message_end": {
      if (ev.message.role !== "assistant") return null;
      return {
        type: "message_complete",
        sessionId,
        entryId: entryIdOf(ev.message),
        text: extractAssistantText(ev.message),
      };
    }
    case "tool_execution_start":
      return {
        type: "tool_call_start",
        sessionId,
        entryId: null,
        toolCallId: ev.toolCallId,
        toolName: ev.toolName,
        args: ev.args,
      };
    case "tool_execution_update":
      return {
        type: "tool_call_update",
        sessionId,
        toolCallId: ev.toolCallId,
        partial: ev.partialResult,
      };
    case "tool_execution_end":
      return {
        type: "tool_call_complete",
        sessionId,
        toolCallId: ev.toolCallId,
        result: ev.result,
        isError: ev.isError,
      };
    case "agent_end":
      // `willRetry` est sur AgentSessionEvent (le wrapper Pi enrichit
      // l'AgentEvent). Si présent et true, on n'émet pas session_ended —
      // Pi va relancer un tour.
      if ("willRetry" in ev && ev.willRetry) return null;
      return {
        type: "session_ended",
        sessionId,
        reason: "completed",
      };
    default:
      return null;
  }
};

/**
 * Pi attend un schéma TypeBox pour `ToolDefinition.parameters` (`TParams extends TSchema`).
 * On projette chaque `LocalToolParam` en `Type.*` correspondant, en laissant
 * passer `"json"` comme `Type.Unknown()` — la validation forte reste celle du
 * Zod côté `invokeMcpTool`, donc la double validation est volontaire et la
 * source de vérité reste Zod.
 */
const paramToTypeBox = (p: LocalToolParam): TSchema => {
  const base: TSchema =
    p.kind === "string"
      ? Type.String()
      : p.kind === "number"
        ? Type.Number()
        : p.kind === "boolean"
          ? Type.Boolean()
          : Type.Unknown();
  const described = p.description
    ? Type.Unsafe({ ...base, description: p.description })
    : base;
  return p.optional ? Type.Optional(described) : described;
};

const specToParameters = (spec: LocalToolSpec): TSchema =>
  Type.Object(
    Object.fromEntries(spec.params.map((p) => [p.name, paramToTypeBox(p)])),
  );

export const createPiAgentSessionGateway = ({
  getOpenRouterApiKey,
  cwd,
  toolProvider,
}: Deps): AgentSessionGateway => ({
  async createSession({ sessionId, jsonlPath, mode, systemPrompt, model: modelRaw, onEvent }) {
    // Pi est un package ESM-only. Le main process Electron est bundlé en CJS
    // par electron-vite, donc on doit charger le module via dynamic import
    // (sinon `require()` échoue avec ERR_PACKAGE_PATH_NOT_EXPORTED).
    const {
      AuthStorage,
      DefaultResourceLoader,
      ModelRegistry,
      SessionManager,
      SettingsManager,
      createAgentSession,
      defineTool,
    } = await import("@earendil-works/pi-coding-agent");
    const { provider, modelId } = parseModel(modelRaw);

    // ── Auth ──────────────────────────────────────────────────────────
    // AuthStorage en mémoire pour ne jamais toucher `~/.pi/auth.json`.
    // La clé OpenRouter (gérée en core via SettingsStore) est injectée à
    // l'init de chaque session — si l'utilisateur la change en Settings,
    // la prochaine session prendra la nouvelle valeur automatiquement.
    const authStorage = AuthStorage.inMemory();
    if (provider === "openrouter") {
      const key = await getOpenRouterApiKey();
      if (!key) {
        throw new Error(
          "OpenRouter API key is missing. Open Settings → Modèles LLM and paste your key.",
        );
      }
      authStorage.setRuntimeApiKey("openrouter", key);
    }

    // ── Model + registry ──────────────────────────────────────────────
    // ModelRegistry en mémoire (pas de models.json) ; on lui passe
    // l'authStorage pour qu'il sache résoudre la clé du provider à
    // l'exécution.
    const modelRegistry = ModelRegistry.inMemory(authStorage);
    const piModel = makeOpenRouterModel(modelId);

    // ── Session manager ───────────────────────────────────────────────
    // create : on instancie une session fraîche dans `dirname(jsonlPath)`
    // puis on force le chemin de fichier avec `setSessionFile()` — le SDK
    // génère normalement un nom timestampé, mais on veut un fichier dont
    // le chemin est déterministe (et stockable en SQLite) avant tout I/O.
    // open   : on rouvre directement le fichier existant.
    const sessionDir = path.dirname(jsonlPath);
    const sessionManager =
      mode === "create" ? SessionManager.create(cwd, sessionDir) : SessionManager.open(jsonlPath);
    if (mode === "create") {
      sessionManager.setSessionFile(jsonlPath);
    }

    // ── Resource loader ───────────────────────────────────────────────
    // Tous les `no*` sont true : Pi n'embarque rien de l'écosystème
    // (extensions ~/.pi, SYSTEM.md du cwd, skills, themes). Le prompt
    // système est intégralement fourni par nous.
    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir: cwd, // jamais lu, mais le constructeur le veut
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPrompt,
    });
    await resourceLoader.reload();

    const settingsManager = SettingsManager.inMemory();

    // ── Confirmation machinery ────────────────────────────────────────
    // Pendings par session : `toolCallId` ↦ resolver. `execute` d'un tool
    // destructif attend sur `requestConfirmation` jusqu'à ce que l'UI
    // route la réponse via `handle.respondConfirmation`, ou que l'abort
    // signal du tool call déclenche un refus implicite.
    const pending = new Map<string, (approved: boolean) => void>();

    const requestConfirmation = (
      toolCallId: string,
      toolName: string,
      args: Record<string, unknown>,
      signal: AbortSignal | undefined,
    ): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        const settle = (approved: boolean) => {
          if (!pending.has(toolCallId)) return;
          pending.delete(toolCallId);
          onEvent({
            type: "tool_confirmation_resolved",
            sessionId,
            toolCallId,
            approved,
          });
          resolve(approved);
        };
        pending.set(toolCallId, settle);
        // Abort en cours de confirmation ⇒ refus implicite, pas de promesse
        // orpheline. `{ once: true }` pour ne pas garder un listener vivant
        // après la résolution.
        signal?.addEventListener("abort", () => settle(false), { once: true });
        onEvent({
          type: "tool_confirmation_request",
          sessionId,
          toolCallId,
          toolName,
          args,
        });
      });

    // ── Custom tools ──────────────────────────────────────────────────
    // Un `ToolDefinition` Pi par `LocalToolSpec` exposé par le provider. Le
    // schéma TypeBox est volontairement permissif (`Type.Unknown` pour
    // "json") — la vérité de validation reste le Zod de `invokeMcpTool`,
    // qui produit aussi les erreurs lisibles renvoyées au modèle.
    const customTools = toolProvider.list().map((spec) =>
      defineTool({
        name: spec.name,
        label: spec.name,
        description: spec.description,
        parameters: specToParameters(spec),
        async execute(
          toolCallId,
          params,
          signal,
        ): Promise<AgentToolResult<unknown>> {
          const args = (params ?? {}) as Record<string, unknown>;
          if (spec.destructive) {
            const approved = await requestConfirmation(
              toolCallId,
              spec.name,
              args,
              signal,
            );
            if (!approved) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Action « ${spec.name} » refusée par l'utilisateur. N'exécute pas cette opération.`,
                  },
                ],
                details: { denied: true },
              };
            }
          }
          try {
            const { text } = await toolProvider.invoke(spec.name, args);
            return { content: [{ type: "text", text }], details: undefined };
          } catch (err) {
            // Erreur d'invocation (validation Zod ou throw du handler) : on
            // renvoie le message comme content texte. `AgentToolResult` n'a
            // pas de champ `isError` — le wrapper Pi marquera l'exécution
            // en erreur via le `throw` propagé si on `throw` ici. On
            // préfère retourner un content propre pour que le modèle voie
            // le message et puisse rebondir.
            const message = err instanceof Error ? err.message : String(err);
            return {
              content: [
                {
                  type: "text",
                  text: `Erreur lors de l'exécution de ${spec.name}: ${message}`,
                },
              ],
              details: { error: message },
            };
          }
        },
      }),
    );

    const { session } = await createAgentSession({
      cwd,
      authStorage,
      modelRegistry,
      model: piModel,
      resourceLoader,
      sessionManager,
      settingsManager,
      // Phase B : `"builtin"` désactive les built-ins coding (read/bash/edit/
      // write) mais laisse passer les `customTools`. `"all"` les masquerait
      // tous, y compris les custom — c'est ce qui était fait en Phase A.
      noTools: "builtin",
      customTools,
    });

    // entryIdOf : Pi écrit les messages dans le JSONL et leur attribue un id
    // (le `leafId` du SessionManager). Lors d'un message_update / message_end,
    // on relit le leaf courant — Pi vient d'écrire ce message.
    const entryIdOf = (_msg: AgentMessage): string =>
      sessionManager.getLeafId() ?? `${sessionId}:unknown`;

    // Publie la taille de contexte courante estimée par Pi. `getContextUsage`
    // peut renvoyer `undefined` (pas encore d'estimation) — on n'émet alors
    // rien plutôt qu'un zéro trompeur.
    const emitContextUsage = (): void => {
      const usage = session.getContextUsage();
      if (!usage) return;
      onEvent({
        type: "context_usage",
        sessionId,
        tokens: usage.tokens,
        contextWindow: usage.contextWindow,
        percent: usage.percent,
      });
    };

    const unsubscribe = session.subscribe((ev) => {
      try {
        const mapped = mapPiEvent(ev, sessionId, entryIdOf);
        if (mapped) onEvent(mapped);
        // Le contexte n'évolue qu'à la frontière d'un message / tour / compaction
        // (le streaming d'un delta ne change pas la taille du contexte d'entrée).
        if (
          ev.type === "message_end" ||
          ev.type === "agent_end" ||
          ev.type === "compaction_end"
        ) {
          emitContextUsage();
        }
      } catch (err) {
        console.error("[pi-gateway] event mapping failed:", err);
      }
    });

    // Snapshot initial : une session rouverte porte déjà un contexte (replay) ;
    // on en publie la taille sans attendre le prochain tour.
    emitContextUsage();

    const drainPendings = (): void => {
      // Si la session se ferme avec une demande pendante, on résout en refus
      // pour ne pas laisser `execute` hang sur une promesse orpheline.
      // Itère sur une copie : `settle` mute la `Map`.
      for (const settle of [...pending.values()]) settle(false);
    };

    const handle: AgentSessionHandle = {
      sessionId,
      async prompt(text) {
        try {
          await session.prompt(text);
        } catch (err) {
          console.error("[pi-gateway] prompt failed:", err);
          onEvent({
            type: "session_ended",
            sessionId,
            reason: "error",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },
      async abort() {
        // Le signal du tool call en cours déclenchera lui-même le settle(false)
        // d'une éventuelle confirmation pendante via le listener `abort` —
        // mais en filet de sécurité on draine aussi ici (par ex. si Pi
        // n'attache pas le signal aux confirmations en suspens hors execute).
        drainPendings();
        await session.abort();
        onEvent({ type: "session_ended", sessionId, reason: "aborted" });
      },
      async close() {
        drainPendings();
        unsubscribe();
        session.dispose();
      },
      respondConfirmation(toolCallId, approved) {
        pending.get(toolCallId)?.(approved);
      },
    };

    return handle;
  },
});

