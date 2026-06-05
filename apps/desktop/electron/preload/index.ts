/**
 * Preload — pont sécurisé entre le renderer (React) et le process main (Node).
 *
 * Le contextBridge expose `window.api` côté renderer ; chaque méthode est un
 * simple forwarder vers `ipcRenderer.invoke` (RPC unaire) ou `ipcRenderer.on`
 * (souscription d'événements main → renderer). Aucune logique métier ici :
 * tout traitement réside dans les handlers du main process.
 */
import { contextBridge, ipcRenderer } from "electron";
import type { DevLogLine } from "@shared/dev-log";

/** Arguments du démarrage d'une instance de workflow (template + seeds). */
type WfStartArgs = {
  templateRef: string;
  seeds: ReadonlyArray<{ kind: string; content: string }>;
  /** Répertoire de travail initial pour les side-effects natifs du run (cwd CLI). */
  cwd?: string;
};
/** Identifie l'étape d'instance ciblée par une décision utilisateur. */
type WfDecisionArgs = { instanceId: string; stepExecId: string };
/** Statut de la clé API Linear stockée côté main (jamais la clé en clair). */
type LinearApiKeyStatus = { hasKey: boolean; lastFour: string | null };
/** Statut du token GitLab stocké côté main (jamais le token en clair). */
type GitLabTokenStatus = { hasToken: boolean; lastFour: string | null };
/** Statut OpenRouter stocké côté main (clé encodée, modèle par défaut en clair). */
type OpenRouterStatus = {
  hasApiKey: boolean;
  lastFour: string | null;
  defaultModel: string;
  models: string[];
};
/** Résultat d'un test de connexion OpenRouter (renvoyé tel quel côté UI). */
type OpenRouterTestResult =
  | { ok: true; model: string; latencyMs: number }
  | { ok: false; error: string };
/**
 * Payload du modal d'édition du prompt système chat. `value` = valeur éditée
 * par l'utilisateur (ou `null` si jamais personnalisé) ; `defaultValue` = le
 * préambule par défaut ; `toolsSection` = la liste des tools auto-ajoutée
 * (read-only côté UI, prévisualisation du prompt effectif).
 */
type ChatSystemPrompt = {
  value: string | null;
  defaultValue: string;
  toolsSection: string;
  /** Cap dur côté store (en caractères). Au-delà : troncature silencieuse. */
  maxChars: number;
};
/** Snapshot du cycle de vie du serveur MCP local (renvoyé par `mcp:getStatus`). */
type McpServerStatus = {
  running: boolean;
  url: string | null;
  error: string | null;
};
/** Typologie d'un paramètre de tool MCP, suffisante pour générer un formulaire. */
type McpToolParamInfo = {
  name: string;
  description: string;
  kind: "string" | "number" | "boolean" | "json";
  optional: boolean;
};
/** Métadonnée statique d'un tool exposé par le serveur MCP local. */
type McpToolInfo = {
  name: string;
  title: string;
  description: string;
  group: "template" | "skill" | "run";
  parameters: ReadonlyArray<McpToolParamInfo>;
};
/** Résultat d'une invocation in-app d'un tool MCP (`mcp:invokeTool`). */
type McpInvokeResult =
  | { ok: true; text: string; durationMs: number }
  | { ok: false; error: string; durationMs: number };
/**
 * Snapshot d'un plugin chargé, tel que renvoyé par `plugin:list`. Le main est
 * la source de vérité ; le renderer reçoit un payload sérialisable utilisable
 * directement par la SettingsPage et les loaders renderer (phase 2).
 */
type PluginListEntry = {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  source: "builtin" | "user";
  state: "active" | "pending" | "disabled" | "failed";
  declaredPermissions: ReadonlyArray<string>;
  grantedPermissions: ReadonlyArray<string>;
  networkHosts: ReadonlyArray<string>;
  /** Relative path to the renderer entry, or `null` if the plugin has none. */
  renderer: string | null;
  contributions: {
    stepKinds: ReadonlyArray<{ id: string; label: string; icon?: string }>;
  };
  methods: ReadonlyArray<string>;
  error?: string;
};

/** Permission catalog entry returned by `plugin:listPermissions`. */
type PluginPermissionEntry = {
  id: string;
  label: string;
  rationale: string;
  sensitive: boolean;
};
/**
 * Snapshot du contexte de vue actif (Phase B). Phase A : toujours `null`
 * côté UI — le type reste exporté pour que le port renderer puisse le
 * référencer sans dupliquer la définition.
 */
type ChatViewContextSnapshot = {
  scope: string;
  label: string;
  data: Record<string, unknown>;
  preferredTools?: ReadonlyArray<string>;
};
/** Index d'une session de chat (renvoyé par `chat:listSessions`). */
type ChatSessionSummary = {
  id: string;
  title: string;
  createdAt: string;
  model: string;
};
/** Session de chat complète (renvoyée par `chat:createSession` et `chat:openSession`). */
type ChatSession = {
  id: string;
  title: string;
  createdAt: string;
  initialContext: ChatViewContextSnapshot | null;
  model: string;
  jsonlPath: string;
  /** Snapshot du base prompt système à la création. `null` = défaut. */
  systemPrompt: string | null;
};
/** Entry replayée à la réouverture d'une session. */
type ChatEntry =
  | { type: "user_message"; entryId: string; text: string; timestamp: string }
  | { type: "assistant_message"; entryId: string; text: string; timestamp: string };
/** Événements de session Pi relayés au renderer via `chat:event`. */
type ChatEvent =
  | { type: "text_delta"; sessionId: string; entryId: string; delta: string }
  | { type: "message_complete"; sessionId: string; entryId: string; text: string }
  | {
      type: "tool_call_start";
      sessionId: string;
      entryId: string | null;
      toolCallId: string;
      toolName: string;
      args: unknown;
    }
  | {
      type: "tool_call_update";
      sessionId: string;
      toolCallId: string;
      partial: unknown;
    }
  | {
      type: "tool_call_complete";
      sessionId: string;
      toolCallId: string;
      result: unknown;
      isError: boolean;
    }
  | {
      type: "tool_confirmation_request";
      sessionId: string;
      toolCallId: string;
      toolName: string;
      args: unknown;
    }
  | {
      type: "tool_confirmation_resolved";
      sessionId: string;
      toolCallId: string;
      approved: boolean;
    }
  | {
      type: "context_usage";
      sessionId: string;
      tokens: number | null;
      contextWindow: number;
      percent: number | null;
    }
  | {
      type: "session_ended";
      sessionId: string;
      reason: "completed" | "aborted" | "error";
      error?: string;
    };
/** Réouvre une boucle de workflow vers une étape antérieure, avec raison. */
type WfLoopArgs = {
  instanceId: string;
  stepExecId: string;
  toStepId: string;
  reason: string;
  /** Commentaires de review ancrés à des plages de lignes (1-indexées, inclusives). */
  comments?: ReadonlyArray<{
    anchor: { startLine: number; endLine: number };
    body: string;
  }>;
};

/**
 * Relance un run terminé/en échec à partir d'une node (rewind & replay).
 * `configOverride` est un patch de config ponctuel appliqué à la node cible
 * pour ce replay uniquement (sans toucher au template).
 */
type WfRerunArgs = {
  instanceId: string;
  stepExecId: string;
  configOverride?: Record<string, unknown>;
};

const api = {
  /**
   * Demande au main d'ouvrir une URL externe dans le navigateur par défaut
   * via `shell.openExternal`. Le main valide le schéma (http/https only) ;
   * passer une URL non-http(s) fait rejeter la promesse.
   */
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke("open_external", { url }),

  /** Sous-API "system" : interactions natives basiques (pickers, dialogs, …). */
  system: {
    /**
     * Ouvre un dialog natif de sélection de répertoire. Renvoie le chemin
     * absolu choisi, ou `null` si l'utilisateur annule. Le main est seul
     * habilité à ouvrir le dialog (le renderer est sandboxé).
     */
    pickDirectory: (
      args?: { defaultPath?: string; title?: string },
    ): Promise<string | null> =>
      ipcRenderer.invoke("system:pickDirectory", args ?? {}),

    /**
     * Ouvre un dialog natif de sélection de fichier. Renvoie le chemin
     * absolu choisi, ou `null` si l'utilisateur annule. Le main est seul
     * habilité à ouvrir le dialog (le renderer est sandboxé).
     */
    pickFile: (args?: {
      defaultPath?: string;
      title?: string;
      filters?: ReadonlyArray<{ name: string; extensions: ReadonlyArray<string> }>;
    }): Promise<string | null> => ipcRenderer.invoke("system:pickFile", args ?? {}),

    /**
     * Combine `pickFile` + lecture UTF-8 dans un seul aller-retour IPC. Le
     * renderer est sandboxé et ne peut pas lire le fichier lui-même, donc
     * cette variante évite un IPC supplémentaire (`readTextFile`) pour les
     * call-sites qui ont besoin du contenu immédiatement (import JSON, …).
     */
    pickAndReadTextFile: (args?: {
      defaultPath?: string;
      title?: string;
      filters?: ReadonlyArray<{ name: string; extensions: ReadonlyArray<string> }>;
    }): Promise<{ path: string; content: string } | null> =>
      ipcRenderer.invoke("system:pickAndReadTextFile", args ?? {}),

    /**
     * Ouvre un dialog natif d'enregistrement de fichier puis écrit le contenu
     * texte fourni à l'emplacement choisi. Renvoie le chemin absolu écrit, ou
     * `null` si l'utilisateur annule. Le main est seul habilité à écrire sur
     * disque (le renderer est sandboxé).
     */
    saveTextFile: (args: {
      content: string;
      defaultFileName?: string;
      title?: string;
      filters?: ReadonlyArray<{ name: string; extensions: ReadonlyArray<string> }>;
    }): Promise<string | null> =>
      ipcRenderer.invoke("system:saveTextFile", args),

    /**
     * Variante binaire de `saveTextFile` : ouvre un dialog natif puis écrit
     * un buffer (Uint8Array / ArrayBuffer) tel quel sur disque. Utilisé par
     * l'export PNG (pixels) à la différence du SVG (texte UTF-8).
     */
    saveBinaryFile: (args: {
      content: Uint8Array | ArrayBuffer;
      defaultFileName?: string;
      title?: string;
      filters?: ReadonlyArray<{ name: string; extensions: ReadonlyArray<string> }>;
    }): Promise<string | null> =>
      ipcRenderer.invoke("system:saveBinaryFile", args),

    /**
     * Window controls — the BrowserWindow is frameless+transparent, so the
     * renderer paints its own buttons and forwards the action to the main
     * process. `onMaximizedChange` lets the UI swap the maximize/restore icon
     * when the WM toggles the state itself (Super+Up, double-click drag…).
     */
    window: {
      minimize: (): Promise<void> =>
        ipcRenderer.invoke("system:window:minimize"),
      maximizeToggle: (): Promise<void> =>
        ipcRenderer.invoke("system:window:maximizeToggle"),
      close: (): Promise<void> => ipcRenderer.invoke("system:window:close"),
      isMaximized: (): Promise<boolean> =>
        ipcRenderer.invoke("system:window:isMaximized"),
      onMaximizedChange: (
        listener: (maximized: boolean) => void,
      ): (() => void) => {
        const handler = (_: unknown, value: boolean) => listener(value);
        ipcRenderer.on("system:window:maximizedChange", handler);
        return () => {
          ipcRenderer.off("system:window:maximizedChange", handler);
        };
      },
    },
  },

  /**
   * Sous-API "devLog" : capture + streaming des logs du process main
   * (stdout/stderr en dev) et de la console renderer. Consommée par la vue
   * `terminal.devlog` du bottom dock — read-only.
   */
  devLog: {
    /** Snapshot du ring buffer (les dernières N lignes capturées). */
    getBuffer: (): Promise<DevLogLine[]> =>
      ipcRenderer.invoke("devlog:getBuffer"),
    /**
     * S'abonne au stream de lignes ; renvoie une fonction de désabonnement.
     * Le main envoie `devlog:line` à chaque nouvelle ligne capturée.
     */
    onLine: (listener: (line: DevLogLine) => void): (() => void) => {
      const handler = (_e: unknown, line: DevLogLine) => listener(line);
      ipcRenderer.on("devlog:line", handler);
      return () => {
        ipcRenderer.off("devlog:line", handler);
      };
    },
  },

  /** Sous-API "settings" : préférences utilisateur persistantes (clés API…). */
  settings: {
    /**
     * Renvoie l'état de la clé API Linear stockée côté main : présence et
     * 4 derniers caractères (pour l'UX). Jamais la clé en clair, qui reste
     * confinée au process main.
     */
    getLinearApiKeyStatus: (): Promise<LinearApiKeyStatus> =>
      ipcRenderer.invoke("settings:getLinearApiKeyStatus"),

    /**
     * Persiste la clé API Linear (chiffrée via `safeStorage` quand possible).
     * Renvoie le nouveau statut.
     */
    setLinearApiKey: (key: string): Promise<LinearApiKeyStatus> =>
      ipcRenderer.invoke("settings:setLinearApiKey", { key }),

    /** Supprime la clé API Linear stockée. */
    clearLinearApiKey: (): Promise<LinearApiKeyStatus> =>
      ipcRenderer.invoke("settings:clearLinearApiKey"),

    /**
     * Sous-API GitLab : access token consommé par le step `git.clone`. Le
     * token reste confiné au main (chiffré via `safeStorage`) ; seul le statut
     * `{ hasToken, lastFour }` traverse l'IPC.
     */
    gitlab: {
      getStatus: (): Promise<GitLabTokenStatus> =>
        ipcRenderer.invoke("settings:gitlab:getStatus"),
      setAccessToken: (token: string): Promise<GitLabTokenStatus> =>
        ipcRenderer.invoke("settings:gitlab:setAccessToken", { token }),
      clearAccessToken: (): Promise<GitLabTokenStatus> =>
        ipcRenderer.invoke("settings:gitlab:clearAccessToken"),
    },

    /**
     * Efface intégralement les réglages utilisateur persistés côté main
     * (clés API, modèles OpenRouter, canal actif, base prompt…). Le renderer
     * doit ensuite nettoyer son propre `localStorage` puis recharger.
     */
    clearAll: (): Promise<void> => ipcRenderer.invoke("settings:clearAll"),

    /**
     * Réinitialisation d'usine : efface tous les réglages user *et* vide la
     * base (toutes les tables) + les données disque, puis tue le process.
     * Ne relance pas : l'utilisateur rouvrira l'app. Ne renvoie jamais — le
     * process est tué par `app.exit`.
     */
    factoryReset: (): Promise<void> => ipcRenderer.invoke("app:factoryReset"),

    /**
     * Sous-API OpenRouter : clé API + modèle par défaut + test de connexion.
     * Le core consomme ces credentials depuis le step runner `openrouter.invoke`
     * et (à venir) le chat Pi.
     */
    openrouter: {
      getStatus: (): Promise<OpenRouterStatus> =>
        ipcRenderer.invoke("settings:openrouter:getStatus"),
      setApiKey: (key: string): Promise<OpenRouterStatus> =>
        ipcRenderer.invoke("settings:openrouter:setApiKey", { key }),
      clearApiKey: (): Promise<OpenRouterStatus> =>
        ipcRenderer.invoke("settings:openrouter:clearApiKey"),
      setDefaultModel: (model: string): Promise<OpenRouterStatus> =>
        ipcRenderer.invoke("settings:openrouter:setDefaultModel", { model }),
      setModels: (models: ReadonlyArray<string>): Promise<OpenRouterStatus> =>
        ipcRenderer.invoke("settings:openrouter:setModels", { models }),
      testConnection: (): Promise<OpenRouterTestResult> =>
        ipcRenderer.invoke("settings:openrouter:testConnection"),
    },

    /**
     * Sous-API chat : base prompt système global, édité depuis la chatbox.
     * Lecture renvoie aussi le défaut et la section tools (read-only) pour
     * que le modal puisse afficher le prompt effectif complet.
     */
    chat: {
      getSystemPrompt: (): Promise<ChatSystemPrompt> =>
        ipcRenderer.invoke("settings:chat:getSystemPrompt"),
      setSystemPrompt: (value: string): Promise<ChatSystemPrompt> =>
        ipcRenderer.invoke("settings:chat:setSystemPrompt", { value }),
    },

    /**
     * Sous-API dev : réglages d'outillage qui n'ont d'effet qu'en mode dev.
     * `perfMonitoring` pilote le sampler mémoire Sentry (gauges périodiques) ;
     * le toggle se persiste partout mais ne démarre/arrête le sampler qu'en dev.
     */
    dev: {
      getPerfMonitoring: (): Promise<boolean> =>
        ipcRenderer.invoke("settings:dev:getPerfMonitoring"),
      setPerfMonitoring: (enabled: boolean): Promise<boolean> =>
        ipcRenderer.invoke("settings:dev:setPerfMonitoring", { enabled }),
    },
  },

  /**
   * Sous-API "mcp" : état du serveur MCP local exposé en HTTP par l'app. Sert
   * au panneau Settings à afficher si le serveur est bien lancé.
   */
  mcp: {
    /** Snapshot courant : serveur en écoute ?, endpoint, dernière erreur. */
    getStatus: (): Promise<McpServerStatus> => ipcRenderer.invoke("mcp:getStatus"),
    /** Catalogue statique des tools exposés par le serveur MCP local. */
    listTools: (): Promise<ReadonlyArray<McpToolInfo>> =>
      ipcRenderer.invoke("mcp:listTools"),
    /**
     * Invoque un tool MCP directement dans le main process (bypass du
     * transport HTTP). Renvoie le `content[*].text` concaténé, ou
     * `{ ok: false, error }` si la validation Zod ou le handler échoue.
     */
    invokeTool: (
      name: string,
      args: Record<string, unknown>,
    ): Promise<McpInvokeResult> =>
      ipcRenderer.invoke("mcp:invokeTool", { name, args }),
  },

  /** Sous-API "workflow" : exécution et édition des templates de workflow. */
  wf: {
    /**
     * Crée et démarre une nouvelle instance d'un template de workflow.
     * Le main retourne l'`instanceId` à utiliser pour toutes les opérations
     * ultérieures (timeline, décisions, suppression…).
     */
    startInstance: (args: WfStartArgs): Promise<{ instanceId: string }> =>
      ipcRenderer.invoke("wf:startInstance", args),

    /**
     * Soumet la décision utilisateur attendue par une étape en pause
     * (typiquement une étape de validation manuelle). Fait avancer
     * l'exécution du workflow vers l'étape suivante.
     */
    submitDecision: (args: WfDecisionArgs): Promise<void> =>
      ipcRenderer.invoke("wf:submitDecision", args),

    /**
     * Réouvre une boucle dans une instance : revient à une étape antérieure
     * (`toStepId`) avec une raison fournie par l'utilisateur, sans casser
     * la traçabilité (l'historique précédent est conservé).
     */
    openLoop: (args: WfLoopArgs): Promise<void> =>
      ipcRenderer.invoke("wf:openLoop", args),

    /**
     * Relance le run à partir d'une node (terminée ou en échec). Toute l'aval
     * transitif est recalculé ; les execs précédentes passent `superseded`. Un
     * `configOverride` optionnel corrige la config de la node cible pour ce
     * replay uniquement.
     */
    rerunFromNode: (args: WfRerunArgs): Promise<void> =>
      ipcRenderer.invoke("wf:rerunFromNode", args),

    /**
     * Récupère la timeline d'exécution d'une instance (séquence d'étapes,
     * statuts, artifacts produits…) pour affichage dans le panneau workflow.
     */
    getTimeline: (args: { instanceId: string }): Promise<unknown> =>
      ipcRenderer.invoke("wf:getTimeline", args),
    getInstanceTree: (args: { instanceId: string }): Promise<unknown> =>
      ipcRenderer.invoke("wf:getInstanceTree", args),

    /** Charge un template de workflow par sa référence stable. */
    getTemplate: (args: { templateRef: string }): Promise<unknown> =>
      ipcRenderer.invoke("wf:getTemplate", args),

    /** Liste tous les templates de workflow disponibles (pour le picker). */
    listTemplates: (): Promise<unknown> =>
      ipcRenderer.invoke("wf:listTemplates"),

    /**
     * Liste la signature de ports (`NodeSpec`) de chaque step kind enregistré
     * dans le moteur. Utilisée par l'éditeur de template pour peupler le picker
     * et colorer les handles. Le contenu ne change qu'au prochain boot.
     */
    listNodeSpecs: (): Promise<unknown> =>
      ipcRenderer.invoke("wf:listNodeSpecs"),

    /**
     * Sauvegarde un template (création ou mise à jour). Le payload `tpl` est
     * typé `unknown` ici : la validation de schéma est faite côté main.
     */
    saveTemplate: (tpl: unknown): Promise<void> =>
      ipcRenderer.invoke("wf:saveTemplate", tpl),

    /**
     * Renomme un template existant (label affiché, sans changer la `templateRef`
     * référencée par les instances déjà créées).
     */
    renameTemplate: (args: { templateRef: string; newName: string }): Promise<void> =>
      ipcRenderer.invoke("wf:renameTemplate", args),

    /** Supprime un template par sa référence `id@version`. */
    deleteTemplate: (args: { templateRef: string }): Promise<void> =>
      ipcRenderer.invoke("wf:deleteTemplate", args),

    /**
     * Charge le layout (positions des nodes + viewport) sauvegardé pour un
     * template. Retourne `null` si aucun layout n'a encore été persisté pour
     * ce couple `(id, version)` — l'éditeur retombe alors sur l'auto-layout BFS.
     */
    getTemplateLayout: (args: { templateRef: string }): Promise<unknown> =>
      ipcRenderer.invoke("wf:getTemplateLayout", args),

    /**
     * Sauvegarde le layout d'un template. Idempotent ; écrase intégralement
     * l'état précédent. Lève si la ligne `(id, version)` n'existe pas encore.
     */
    saveTemplateLayout: (args: {
      templateRef: string;
      layout: unknown;
    }): Promise<void> => ipcRenderer.invoke("wf:saveTemplateLayout", args),

    /** Liste les skills (briques réutilisables de prompt/outil) connus. */
    listSkills: (): Promise<unknown> =>
      ipcRenderer.invoke("wf:listSkills"),

    /** Sauvegarde un skill (création ou mise à jour). */
    saveSkill: (skill: unknown): Promise<void> =>
      ipcRenderer.invoke("wf:saveSkill", skill),

    /** Supprime un skill par sa référence. */
    deleteSkill: (args: { ref: string }): Promise<void> =>
      ipcRenderer.invoke("wf:deleteSkill", args),

    /** Liste toutes les instances de workflow connues (récentes en premier). */
    listInstances: (): Promise<unknown> =>
      ipcRenderer.invoke("wf:listInstances"),

    /**
     * Agrège tous les step executions en attente d'une décision humaine, à
     * travers toutes les instances. Source de la "boîte de réception" de la
     * home : un seul appel pour savoir tout ce sur quoi l'utilisateur doit
     * agir. Trié du plus ancien au plus récent côté main.
     */
    listAwaitingHuman: (): Promise<unknown> =>
      ipcRenderer.invoke("wf:listAwaitingHuman"),

    /** Recherche full-text dans les instances (par titre, contenu, etc.). */
    searchInstances: (args: { query: string }): Promise<unknown> =>
      ipcRenderer.invoke("wf:searchInstances", args),

    /** Supprime définitivement une instance et ses artifacts associés. */
    deleteInstance: (args: { instanceId: string }): Promise<void> =>
      ipcRenderer.invoke("wf:deleteInstance", args),

    /**
     * Assemble et renvoie le bundle JSON autocontenu d'un run (events,
     * executions, artifacts inline, sessions LLM, feedback loops…) pour un
     * export déclenché depuis l'UI, sans dépendre du step `export_run`.
     */
    exportInstance: (args: { instanceId: string }): Promise<unknown> =>
      ipcRenderer.invoke("wf:exportInstance", args),

    /**
     * Récupère un artifact (sortie d'étape : texte, JSON, fichier…) par son ID.
     * Retourne ses métadonnées et son contenu sérialisé pour affichage.
     */
    getArtifact: (
      args: { artifactId: string },
    ): Promise<{ meta: unknown; content: string }> =>
      ipcRenderer.invoke("wf:getArtifact", args),

    /**
     * S'abonne aux événements moteur de workflow (changement d'étape, fin
     * d'instance, artifact produit…) pour rafraîchir la timeline en live.
     *
     * @returns Une fonction de désabonnement.
     */
    onEvent: (listener: (payload: unknown) => void): (() => void) => {
      const handler = (_: unknown, payload: unknown) => listener(payload);
      ipcRenderer.on("wf:event", handler);
      return () => {
        ipcRenderer.off("wf:event", handler);
      };
    },

    /**
     * S'abonne aux événements typés de session LLM produits par une étape de
     * workflow (text-delta, tool-use, tool-result, thinking, …, ciblés par
     * `stepExecId`). Distinct de `onEvent` qui porte les transitions de
     * statut, pour permettre un rendu fin de la session Claude.
     *
     * @returns Une fonction de désabonnement.
     */
    onLlmSession: (
      listener: (payload: unknown) => void,
    ): (() => void) => {
      const handler = (_: unknown, payload: unknown) => listener(payload);
      ipcRenderer.on("wf:llmSession", handler);
      return () => {
        ipcRenderer.off("wf:llmSession", handler);
      };
    },

    /**
     * Récupère le replay des événements de session bufferisés côté main
     * pour un `stepExecId` donné (oldest first). Permet à un panneau
     * ouvert tardivement d'afficher l'historique de la session Claude.
     */
    getLlmSession: (args: { stepExecId: string }): Promise<unknown> =>
      ipcRenderer.invoke("wf:getLlmSession", args),

    /**
     * Renvoie la consommation de tokens / coût agrégée par étape exécutée
     * (table `wf_runs`), pour alimenter le graphe d'évolution de la conso sous
     * la chronologie d'un run. Une seule requête pour tout le run.
     */
    getRunTokenUsage: (args: { instanceId: string }): Promise<unknown> =>
      ipcRenderer.invoke("wf:getRunTokenUsage", args),

    /**
     * Liste tous les types d'artifacts connus du moteur : built-ins, types
     * contribués par les plugins, et types user-defined (table
     * `wf_artifact_schemas`). Le renderer reçoit un payload sérialisable
     * incluant le JSON Schema simplifié — c'est l'unique source pour l'UI
     * de gestion des artifact types (Phase 2 §9.2).
     */
    listArtifactSchemas: (): Promise<unknown> =>
      ipcRenderer.invoke("wf:listArtifactSchemas"),

    /**
     * Valide un contenu littéral contre un kind, via le même registre que
     * `artifactStore.put`. Renvoie `{ ok }` ou `{ ok:false, error }` (message
     * sérialisable) sans rien stocker. Utilisé par l'éditeur de variables pour
     * valider une valeur par défaut à la saisie.
     */
    validateArtifact: (
      kind: string,
      content: string,
    ): Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke("wf:validateArtifact", { kind, content }),

    /**
     * Upsert un artifact type **user** (création ou mise à jour de la version).
     * Le main rejette les ids qui collident avec un built-in et ne touche
     * jamais aux contributions plugin (lues depuis le manifest).
     */
    saveArtifactSchema: (type: unknown): Promise<void> =>
      ipcRenderer.invoke("wf:saveArtifactSchema", type),

    /** Supprime un artifact type user. No-op silencieux si inconnu. */
    deleteArtifactSchema: (
      ref: { id: string; version: string },
    ): Promise<void> => ipcRenderer.invoke("wf:deleteArtifactSchema", ref),

    /**
     * Liste les parsers (plugin + user) avec leur statut `isActive` par type.
     * `forType` est optionnel : sans filtre, retourne tous les parsers connus.
     */
    listParsers: (args?: {
      forType?: { id: string; version: string };
    }): Promise<unknown> => ipcRenderer.invoke("wf:listParsers", args ?? {}),

    /** Upsert un parser user (création ou mise à jour de la version). */
    saveParser: (parser: unknown): Promise<void> =>
      ipcRenderer.invoke("wf:saveParser", parser),

    /** Supprime un parser user. */
    deleteParser: (
      ref: { id: string; version: string },
    ): Promise<void> => ipcRenderer.invoke("wf:deleteParser", ref),

    /**
     * Playground : exécute un parser contre un payload brut et retourne le
     * résultat simplifié. Deux modes — `"saved"` cible un parser persisté par
     * sa ref ; `"inline"` accepte un body non sauvegardé (édition live).
     */
    runParser: (input: unknown): Promise<{ ok: true; simplified: unknown }> =>
      ipcRenderer.invoke("wf:runParser", input),

    /**
     * Liste les step kinds (plugin) dont le manifest a déclaré un
     * `suggestedFor.inputKind === kind`. Consommé par l'éditeur de template
     * pour les code-actions « le plugin Y suggère un node Z pour ce kind ».
     */
    listStepKindSuggestions: (args: {
      inputKind: string;
    }): Promise<unknown> =>
      ipcRenderer.invoke("wf:listStepKindSuggestions", args),

    /**
     * Studio/debug : exécute une node isolée avec des inputs saisis à la main.
     * Pas de persistance — outils sandbox jetable côté main. Les autres
     * side-effects (LLM, shell, Linear, fs) restent réels.
     */
    debugStep: (input: unknown): Promise<unknown> =>
      ipcRenderer.invoke("wf:debugStep", input),

    /**
     * Sous-API "folders" : dossiers user-defined de l'Explorer (organisation
     * libre des Runs / Templates / Prompts / Artifact types par channel).
     * Voir `specs/explorer-folders-dnd.md`.
     */
    folders: {
      list: (args: { channelId: string }): Promise<unknown> =>
        ipcRenderer.invoke("wf:folders:list", args),
      create: (args: {
        channelId: string;
        parentId: string | null;
        name: string;
      }): Promise<unknown> => ipcRenderer.invoke("wf:folders:create", args),
      rename: (args: { id: string; name: string }): Promise<void> =>
        ipcRenderer.invoke("wf:folders:rename", args),
      remove: (args: {
        id: string;
        strategy?: "detach-items" | "cascade";
      }): Promise<void> => ipcRenderer.invoke("wf:folders:delete", args),
      move: (args: { id: string; parentId: string | null }): Promise<void> =>
        ipcRenderer.invoke("wf:folders:move", args),
      listItems: (args: { channelId: string }): Promise<unknown> =>
        ipcRenderer.invoke("wf:folders:listItems", args),
      assign: (args: {
        channelId: string;
        kind: string;
        resourceId: string;
        folderId: string | null;
      }): Promise<void> => ipcRenderer.invoke("wf:folders:assign", args),
      onChanged: (
        listener: (evt: { channelId: string }) => void,
      ): (() => void) => {
        const handler = (_: unknown, evt: { channelId: string }) =>
          listener(evt);
        ipcRenderer.on("wf:folders:changed", handler);
        return () => {
          ipcRenderer.off("wf:folders:changed", handler);
        };
      },
    },

    /**
     * Sous-API "schedules" : planifications cron déclenchant un workflow à
     * intervalles réguliers. Le scheduler tourne dans le main process tant
     * que l'app est ouverte ; au boot, un éventuel run de rattrapage est
     * déclenché si une échéance est tombée pendant que l'app était fermée
     * (cf. specs/workflow-scheduler-cron.md).
     */
    schedules: {
      list: (): Promise<unknown> => ipcRenderer.invoke("wf:listSchedules"),
      save: (draft: unknown): Promise<unknown> =>
        ipcRenderer.invoke("wf:saveSchedule", draft),
      setEnabled: (args: { id: string; enabled: boolean }): Promise<void> =>
        ipcRenderer.invoke("wf:setScheduleEnabled", args),
      remove: (id: string): Promise<void> =>
        ipcRenderer.invoke("wf:deleteSchedule", { id }),
    },

    /** Sous-API "channels" : CRUD et switcher du contexte actif. */
    channels: {
      list: (): Promise<unknown> => ipcRenderer.invoke("wf:listChannels"),
      save: (draft: unknown): Promise<void> =>
        ipcRenderer.invoke("wf:saveChannel", draft),
      remove: (id: string): Promise<void> =>
        ipcRenderer.invoke("wf:deleteChannel", { id }),
      getActive: (): Promise<string> =>
        ipcRenderer.invoke("wf:getActiveChannel"),
      setActive: (id: string): Promise<void> =>
        ipcRenderer.invoke("wf:setActiveChannel", { id }),
      onChanged: (listener: (id: string) => void): (() => void) => {
        const handler = (_: unknown, id: string) => listener(id);
        ipcRenderer.on("wf:channelChanged", handler);
        return () => {
          ipcRenderer.off("wf:channelChanged", handler);
        };
      },
      moveEntity: (input: unknown): Promise<void> =>
        ipcRenderer.invoke("wf:moveEntity", input),
      /**
       * Lit l'image uploadée d'un channel, ou `null` s'il n'en a pas. Le main
       * renvoie un `Buffer` qui traverse le contextBridge en `Uint8Array`.
       */
      getIconImage: (
        id: string,
      ): Promise<{ bytes: Uint8Array; mime: string } | null> =>
        ipcRenderer.invoke("wf:getChannelIconImage", { id }),
    },
  },

  /**
   * Sous-API "plugins" : inspection + invocation des plugins chargés. La
   * découverte (`list`) est sûre par construction ; les méthodes
   * personnalisées passent toutes par le dispatcher unique `plugin:invoke`,
   * routé côté main par `{ pluginId, method }` — pas d'IPC channel par
   * plugin, donc pas de collision possible avec les channels core.
   */
  plugins: {
    /** Liste les plugins chargés (built-in + user) avec leurs contributions. */
    list: (): Promise<ReadonlyArray<PluginListEntry>> =>
      ipcRenderer.invoke("plugin:list"),

    /**
     * Catalogue (statique pendant un boot) des permissions connues. Le dialog
     * d'autorisation et le panneau Settings s'en servent pour rendre l'UX.
     */
    listPermissions: (): Promise<ReadonlyArray<PluginPermissionEntry>> =>
      ipcRenderer.invoke("plugin:listPermissions"),

    /**
     * Invoque une méthode enregistrée par un plugin via `registerIpcHandler`.
     * Le payload `args` est typé `unknown` : la validation est du ressort du
     * plugin ; côté renderer, l'adapter qui consomme cette méthode est
     * responsable du typage et de la validation runtime.
     */
    invoke: (
      pluginId: string,
      method: string,
      args?: unknown,
    ): Promise<unknown> =>
      ipcRenderer.invoke("plugin:invoke", { pluginId, method, args }),

    /**
     * Persiste la réponse de l'utilisateur au dialog d'autorisation et
     * réactive le plugin avec la nouvelle grille de permissions.
     */
    grant: (args: {
      pluginId: string;
      version: string;
      permissions: ReadonlyArray<string>;
      enabled?: boolean;
    }): Promise<PluginListEntry | null> =>
      ipcRenderer.invoke("plugin:grant", args),

    /** Toggle une permission individuelle. Hot — pas besoin de relancer l'app. */
    setPermission: (args: {
      pluginId: string;
      permission: string;
      granted: boolean;
    }): Promise<PluginListEntry | null> =>
      ipcRenderer.invoke("plugin:setPermission", args),

    /** Active/désactive le plugin (sans toucher à la grille des permissions). */
    setEnabled: (args: {
      pluginId: string;
      enabled: boolean;
    }): Promise<PluginListEntry | null> =>
      ipcRenderer.invoke("plugin:setEnabled", args),

    /** Recharge le plugin (utile en dev après modif du code). */
    reload: (args: { pluginId: string }): Promise<PluginListEntry | null> =>
      ipcRenderer.invoke("plugin:reload", args),

    /**
     * Ouvre dans l'explorateur le dossier utilisateur des plugins (ou celui
     * d'un plugin user particulier si `pluginId` est fourni). Pour les
     * built-ins, on retombe sur le dossier user — leur emplacement
     * (asar bundle) n'est pas révélable depuis l'UI.
     */
    openFolder: (args?: { pluginId?: string }): Promise<void> =>
      ipcRenderer.invoke("plugin:openFolder", args ?? {}),
  },

  /**
   * Sous-API "chat" : conversations multi-tour pilotées par Pi
   * (`@earendil-works/pi-coding-agent`) embarqué dans le main process. Le
   * contenu des messages vit dans un fichier JSONL géré par Pi sous
   * `<userData>/pi-sessions/<id>.jsonl` ; SQLite ne garde qu'un index
   * (`chat_sessions`). Voir `specs/global-contextual-chat.md`.
   */
  chat: {
    /** Index des conversations existantes, du plus récent au plus ancien. */
    listSessions: (): Promise<ReadonlyArray<ChatSessionSummary>> =>
      ipcRenderer.invoke("chat:listSessions"),

    /**
     * Crée une nouvelle conversation. Allou un UUID, un fichier JSONL Pi,
     * et persiste la ligne SQLite. Aucun handle Pi ne reste en mémoire à ce
     * stade — il faut appeler `openSession` pour démarrer l'agent.
     */
    createSession: (args: {
      initialContext: ChatViewContextSnapshot | null;
      model: string;
      title?: string;
    }): Promise<ChatSession> =>
      ipcRenderer.invoke("chat:createSession", args),

    /**
     * Ouvre une conversation : instancie un handle Pi côté main et renvoie
     * le replay des messages déjà persistés. Le streaming des futurs
     * événements arrive via `onEvent`. Appeler `closeSession` à la
     * fermeture du panneau pour libérer le handle.
     */
    openSession: (id: string): Promise<{ session: ChatSession; replay: ChatEntry[] }> =>
      ipcRenderer.invoke("chat:openSession", { id }),

    /**
     * Bascule la session sur un autre modèle. Le handle Pi en cours est libéré
     * côté main ; le renderer doit appeler `openSession` après pour relancer
     * l'agent avec le nouveau modèle.
     */
    setSessionModel: (args: {
      sessionId: string;
      model: string;
    }): Promise<ChatSession> =>
      ipcRenderer.invoke("chat:setSessionModel", args),

    /** Libère le handle Pi (la session reste sur disque, peut être rouverte). */
    closeSession: (id: string): Promise<void> =>
      ipcRenderer.invoke("chat:closeSession", { id }),

    /** Supprime définitivement la session (row SQLite + fichier JSONL). */
    deleteSession: (id: string): Promise<void> =>
      ipcRenderer.invoke("chat:deleteSession", { id }),

    /**
     * Envoie un message user à une session déjà ouverte. `liveContext` est
     * le snapshot du contexte de vue capturé au moment du clic Envoyer ;
     * le main l'injecte en préfixe du tour user. `null` quand l'utilisateur
     * est sur une vue sans extracteur de contexte.
     */
    sendMessage: (args: {
      sessionId: string;
      userMessage: string;
      liveContext: ChatViewContextSnapshot | null;
    }): Promise<void> =>
      ipcRenderer.invoke("chat:sendMessage", args),

    /** Annule le tour en cours pour une session. */
    abortSession: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke("chat:abortSession", { sessionId }),

    /**
     * Phase B : route la réponse user (Autoriser / Refuser) vers le `execute`
     * suspendu d'un tool destructif côté main. No-op si la demande n'est plus
     * pendante (réponse en double, race avec abort, fermeture de session).
     */
    respondToolConfirmation: (args: {
      sessionId: string;
      toolCallId: string;
      approved: boolean;
    }): Promise<void> =>
      ipcRenderer.invoke("chat:respondToolConfirmation", args),

    /**
     * S'abonne aux événements de session Pi (text deltas, fin de message,
     * tool calls, fin de session). L'UI filtre par `sessionId` puisque
     * plusieurs conversations peuvent être ouvertes simultanément.
     *
     * @returns Une fonction de désabonnement.
     */
    onEvent: (listener: (event: ChatEvent) => void): (() => void) => {
      const handler = (_: unknown, payload: ChatEvent) => listener(payload);
      ipcRenderer.on("chat:event", handler);
      return () => {
        ipcRenderer.off("chat:event", handler);
      };
    },
  },
};

contextBridge.exposeInMainWorld("api", api);

/**
 * Type publié pour le renderer : `window.api` est typé `Api` via la
 * déclaration globale (cf. `apps/desktop/src/types/global.d.ts` ou équivalent).
 */
export type Api = typeof api;
