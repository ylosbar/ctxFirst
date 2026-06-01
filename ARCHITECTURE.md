<!-- GÉNÉRÉ depuis `ARCHITECTURE.json` par `scripts/architecture.js` — NE PAS ÉDITER À LA MAIN. -->
# ARCHITECTURE.md

> **Produit : CtxFirst** — Piloter des workflows LLM pas à pas, avec validations humaines aux moments clés et boucles de feedback pour itérer sans tout recommencer.
> Monorepo : `ctxfirst-desktop-monorepo`. Surface principale : [apps/desktop](apps/desktop) (@ctxfirst/desktop), app Electron.

## 0. But de ce document

Ce fichier (sa source `ARCHITECTURE.json`) a deux usages :

1. Onboarding humain & LLM — comprendre l'organisation du code avant toute modification structurante.
2. Juge anti-drift — comparer une PR / l'état du code à ce document pour détecter une dérive architecturale.

**Règles d'écriture** :
- Citer les fichiers (paths) et les symboles (types, fonctions, ports). Éviter les numéros de ligne : ils dérivent et rendraient le juge faux-positif.
- Un invariant doit porter sur une structure stable (nom de fichier, nom de symbole, sens d'import), pas sur une coordonnée fragile.
- Si une affirmation n'est plus vraie dans le code, c'est le code qui gagne : corriger ce document, ne pas inventer.

Précédence en cas de conflit : `code` > `this-document` > `specs`.

---

## 1. Vue d'ensemble
<!-- ctx:ctx.overview | scopes: archi.monorepo -->

CtxFirst est une application desktop Electron. L'utilisateur conçoit des templates de workflow (graphes de nœuds typés), les exécute en instances (« runs »), et intervient à des points de validation humaine. Les nœuds appellent des LLM (Claude Code, Codex, OpenRouter), des outils (shell, git, Linear, webhooks) et s'échangent des artifacts typés. Un nœud llm.judge peut rejeter une sortie et rouvrir une boucle vers un nœud amont, qui réessaie avec le feedback injecté.

Trois piliers conceptuels dictent l'architecture :

- Event sourcing — tout l'état d'exécution dérive d'un log d'événements append-only. L'état lisible est une projection pure de ce log. Rejouable, auditable.
- Artifacts, pas de session — les nœuds communiquent uniquement par artifacts typés, jamais par session LLM partagée. Chaque step repart d'un contexte neuf (context engineering). C'est un invariant permanent du design.
- Hexagonal (ports & adapters) — domain → application (ports) → adapters. Appliqué des deux côtés (main ET renderer). La dépendance ne pointe jamais vers l'extérieur.

---

## 2. Monorepo & workspaces
<!-- ctx:ctx.monorepo | scopes: archi.monorepo -->

Yarn workspaces ([apps/](apps/)*, [packages/](packages/)*). Voir [package.json](package.json).

```text
tauri-app/                         (← nom historique du repo ; ce n'est PAS du Tauri/Rust)
├── apps/
│   ├── desktop/   @ctxfirst/desktop  ← app Electron — WORKSPACE PRINCIPAL
│   ├── api/       @ctxfirst/api      ← serveur Hapi, placeholder (webhooks dev :3001)
│   └── web/       @ctxfirst/web      ← scaffolding Vite/React/Tailwind, pas de feature
├── packages/
│   └── plugin-sdk/ @ctxfirst/plugin-sdk    ← types pour auteurs de plugins (main + renderer)
├── doc/                                ← doc fonctionnelle (FR) : runs, templates, plugins…
├── specs/                             ← specs de features (souvent en avance sur le code)
├── scripts/                          ← audits (markdown-links, raw-jsx, large-components…)
├── skills/                           ← skills Claude Code locales au repo
└── justfile, eslint.config.js, CLAUDE.md
```

⚠️ Branding mixte, normal : produit = CtxFirst, scope npm des apps = @ctxfirst/*, scope du SDK plugin = @ctxfirst/*, clés de persistance préfixées ctxfirst: / wf_ / ctxfirst_. Ce n'est pas une incohérence à « corriger ». [apps/api](apps/api) et [apps/web](apps/web) sont secondaires et à l'état de scaffolding.

---

## 3. Stack technique
<!-- ctx:ctx.stack | scopes: archi.monorepo -->

| Domaine | Choix |
| --- | --- |
| Shell applicatif | Electron + electron-vite (dev HMR renderer, relaunch sur main/preload) |
| Renderer | React 18 + TypeScript, bundle Vite |
| Layout fenêtre | dockview-react (workbench façon VSCode), react-resizable-panels |
| Éditeur de graphe | @xyflow/react (React Flow) pour le template editor |
| State client | zustand (stores), @tanstack/react-query (cache serveur, invalidation event-driven) |
| Routing | react-router v7 en HashRouter (synchronisé au workbench) |
| Design system | shadcn/ui sur @base-ui/react + Tailwind (class-variance-authority, tailwind-merge) |
| Éditeurs de code | CodeMirror 6 (@uiw/react-codemirror) ; terminal @xterm/xterm |
| Validation/schémas | zod v4 (+ @sinclair/typebox ponctuel) |
| Persistance | better-sqlite3 (WAL) + store d'artifacts sur disque (content-addressed) |
| Cron | croner |
| Sandbox parsers | quickjs-emscripten (mode code) |
| Agent de chat | @earendil-works/pi-coding-agent (« Pi ») |
| Intégration outils | @modelcontextprotocol/sdk (serveur MCP in-app) |
| i18n | i18next / react-i18next |
| Tests | Vitest (config côté desktop) ; Storybook pour le DS |
| Lint | ESLint 9 flat config — encode des règles d'architecture |

---

## 4. Les trois process Electron
<!-- ctx:ctx.process-model | scopes: archi.process-isolation -->

- Main — [apps/desktop/electron/main/index.ts](apps/desktop/electron/main/index.ts). Process Node.js. Seul à toucher au natif : SQLite (better-sqlite3), child_process (spawn de CLI/LLM), fs, shell.openExternal, dialogs. Crée la BrowserWindow, enregistre les handlers ipcMain.handle, monte le moteur de workflow et les sous-systèmes.
- Preload — [apps/desktop/electron/preload/index.ts](apps/desktop/electron/preload/index.ts). Pont contextBridge. Expose window.api, typé via export type Api = typeof api. Aucune logique métier : du forwarding ipcRenderer.invoke / ipcRenderer.on.
- Renderer — [apps/desktop/src/](apps/desktop/src/). React. Ne parle au main que via window.api.*, et uniquement depuis les adapters de [apps/desktop/src/infrastructure/electron/](apps/desktop/src/infrastructure/electron/).

Code partagé main ↔ renderer (types & helpers purs, sans accès natif) sous [apps/desktop/shared/](apps/desktop/shared/).

---

## 4. Sécurité de la BrowserWindow
<!-- ctx:ctx.security | scopes: archi.process-isolation -->

contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true. CSP stricte dans [apps/desktop/index.html](apps/desktop/index.html) — toute nouvelle origine (API, CDN font, websocket) doit y être ajoutée.

---

## 5. Architecture hexagonale (principe commun)
<!-- ctx:ctx.hexagonal | scopes: archi.hexagonal -->

Le même schéma de dépendances s'applique au backend ([electron/main/wf/](apps/desktop/electron/main/wf/), [chat/](apps/desktop/electron/main/chat/), [explorer/](apps/desktop/electron/main/explorer/)) et au renderer ([src/](apps/desktop/src/)) :

```text
        domain  ◄─────  application  ◄─────  adapters / infrastructure
      (types &        (use-cases +          (implémentations concrètes :
       règles          PORTS = interfaces    SQLite, FS, LLM CLI, window.api…)
       pures)          outbound)
                            ▲
                            │  composition root
                            └── instancie les adapters et les injecte
```

Règle de dépendance (la plus importante du repo) :

- domain n'importe que domain. Jamais application, jamais adapters.
- application importe domain et ses propres ports (interfaces). Jamais un adapter concret.
- adapters implémentent les ports et peuvent importer domain (types). C'est la seule couche qui touche au natif/IO.
- Un unique composition root par sous-système instancie les adapters et câble le tout.

Cette règle est partiellement encodée dans ESLint (eslint.config.js) : renderer ↛ Node builtins, sens de dépendance hexagonale, convention de composant React.

---

## 6.1. [wf/domain](apps/desktop/electron/main/wf/domain) — types et règles pures
<!-- ctx:ctx.wf-domain | scopes: archi.backend.wf -->

Types et règles pures, immuables, sans IO. Racine : [apps/desktop/electron/main/wf/domain/](apps/desktop/electron/main/wf/domain/). Entités clés :

| Fichier | Concept |
| --- | --- |
| [domain/ids.ts](apps/desktop/electron/main/wf/domain/ids.ts) | IDs brandés (phantom types) : TemplateId, TemplateVersion, StepId, StepExecId, WorkflowId (= instance), ArtifactId, ArtifactHash, EventId, RunId, LoopId, SkillRef. |
| [domain/template.ts](apps/desktop/electron/main/wf/domain/template.ts) | WorkflowTemplate (spec immuable versionnée), StepDef (kind, config, inputKinds, outputKind, writesTo/readsFrom, humanGateRequired), Transition (from/to, fromPort/toPort, isLoop, scopeOf), TemplateVariable. |
| [domain/instance.ts](apps/desktop/electron/main/wf/domain/instance.ts) | WorkflowInstance (agrégat racine ; templateVersion figée au lancement), StepExecution (inputs, outputs par port, runs[], iterationKey, humanFeedback, loopFrom), statuts. |
| [domain/events.ts](apps/desktop/electron/main/wf/domain/events.ts) | DomainEvent — union fermée append-only : InstanceStarted, StepStarted, StepProducedArtifact, VariableAssigned, StepAwaitingHumanGate, StepValidated, StepFailed, StepSkipped, LoopOpened/LoopClosed, IterationStarted, WorkspaceChanged, InstanceCompleted. Chaque event porte un eventId (dédup au replay). |
| [domain/projection.ts](apps/desktop/electron/main/wf/domain/projection.ts) | Réducteur pur events → InstanceState (+ InstanceSummary, IterationRecord). Maintient openLoops, iterations, variables. |
| [domain/artifact.ts](apps/desktop/electron/main/wf/domain/artifact.ts) | ArtifactKind (la grammaire des types), Artifact (métadonnées : id, kind, hash, storageRef ; le contenu vit ailleurs). |
| [domain/artifact-schema.ts](apps/desktop/electron/main/wf/domain/artifact-schema.ts) (+ [artifact-schema-hash.ts](apps/desktop/electron/main/wf/domain/artifact-schema-hash.ts)) | ArtifactKindDescriptor (schéma Zod compilé, JSON schema, sample, hash structurel), ArtifactSchemaRef. Le hash structurel donne l'identité ensembliste d'un kind. |
| [domain/parse-artifact.ts](apps/desktop/electron/main/wf/domain/parse-artifact.ts) (+ [artifact-serializer.ts](apps/desktop/electron/main/wf/domain/artifact-serializer.ts)) | (dé)sérialisation + validation des payloads contre le schéma du kind. |
| [domain/judge-feedback.ts](apps/desktop/electron/main/wf/domain/judge-feedback.ts) (+ [feedback.ts](apps/desktop/electron/main/wf/domain/feedback.ts)) | JudgeOutput/JudgeVerdict (approved|rejected, summary, commentaires ancrés en lignes), ReviewComment. |
| [domain/skill.ts](apps/desktop/electron/main/wf/domain/skill.ts) | Skill — prompt système réutilisable versionné (name@version). |
| [domain/parser.ts](apps/desktop/electron/main/wf/domain/parser.ts) | ParserRecord — transformation d'artifact, mode declarative ou code. |
| [domain/channel.ts](apps/desktop/electron/main/wf/domain/channel.ts) | Channel — partition multi-tenant ; DEFAULT_CHANNEL_ID = "personal". |
| [domain/schedule.ts](apps/desktop/electron/main/wf/domain/schedule.ts) | WorkflowSchedule — déclenchement cron d'un template. |
| [domain/BuiltIns/](apps/desktop/electron/main/wf/domain/BuiltIns/) | Définitions des kinds built-in (un fichier par kind) : String, Number, Boolean, Url, Email, DateTime, LinearRef, Markdown, Json, Path, PathList, MarkdownList, RunExport. |

---

## 6.2. [wf/application](apps/desktop/electron/main/wf/application) — ports, use-cases, orchestrateur
<!-- ctx:ctx.wf-application | scopes: archi.backend.wf -->

- Ports outbound — [application/ports/outbound/](apps/desktop/electron/main/wf/application/ports/outbound/). Interfaces implémentées par les adapters (un fichier = un port) : artifact-schema-registry, artifact-store, channel-context, channel-icon-store, channel-registry, clock, environment, event-bus, event-log, file-system, hash, id-generator, linear-gateway, llm-gateway, llm-session-store, logger, notifier, parser-registry, parser-runtime, path, run-log, schedule-registry, shell-gateway, skill-registry, step-kind-suggestions, template-registry.
- Use-cases — [application/use-cases/](apps/desktop/electron/main/wf/application/use-cases/). ~30 use-cases (chacun colocalisé avec son .test.ts). Fabriques make…(deps) => async (input) => …. Les mutateurs émettent des DomainEvent (append log puis publish bus) ; les lecteurs lisent la projection en mémoire. Aussi des migrations de données idempotentes.
- Orchestrateur — [application/orchestrator/](apps/desktop/electron/main/wf/application/orchestrator/). La machine à états : s'abonne au bus, applique chaque event à l'EngineState, puis sur StepValidated calcule les successeurs, résout & valide les inputs, appelle le runner, traduit le StepOutcome, gère boucles, inférence de scopes d'itération (foreach) et propagation de StepSkipped. Sérialisation par instance (chaîne de promesses).
- Services — [application/services/](apps/desktop/electron/main/wf/application/services/). Dont le context-assembler (assemble systemPrompt/userPrompt + historique de boucle en markdown, calcule un hash de corrélation pour le RunLog).
- Scheduler — [application/scheduler/](apps/desktop/electron/main/wf/application/scheduler/). start() (catch-up + arme les crons via croner), reload(), stop().
- Step runner (contrat) — [application/step-runner.ts](apps/desktop/electron/main/wf/application/step-runner.ts). Définit NodeSpec (inputs: PortSpec[], outputs: OutputPort[], passthrough?), RunContext (inputs résolus, loopHistory, attempt, workspace.cwd, deps), StepOutcome (produced | produced-many | produced-on-port | produced-pending-human | awaiting-human | workspace-set). resolveSpec(ctx) permet aux runners polymorphes de déterminer leur kind de sortie.

---

## 6.3. [wf/adapters](apps/desktop/electron/main/wf/adapters) — implémentations concrètes des ports
<!-- ctx:ctx.wf-adapters | scopes: archi.backend.wf -->

- SQLite : artifact-store (métadonnées + blob FS content-addressed), artifact-schema-registry, event-log, event-bus (in-memory + persistance llm-session pour replay), template-registry (+ seeds), skill-registry (+ seeds), parser-registry, channel-registry, schedule-registry, run-log.
- LLM : [adapters/llm/](apps/desktop/electron/main/wf/adapters/llm/) — claude-code, codex-cli, openrouter, fake-llm (tests). Implémentent LLMGateway (streaming).
- Parser runtime : [adapters/parser-runtime/](apps/desktop/electron/main/wf/adapters/parser-runtime/) — interpréteur declarative + sandbox quickjs (mode code), dispatcher par mode, audit.
- Intégrations : linear (GraphQL), shell (child_process.spawn), notifier.
- Utilitaires natifs : clock, id-generator (crypto.randomUUID), hash (sha256), path, environment, file-system, logger, channel-context (in-memory), channel-icon-store (FS), step-kind-suggestions.

---

## 6.4. [wf/composition-root.ts](apps/desktop/electron/main/wf/composition-root.ts)
<!-- ctx:ctx.wf-composition-root | scopes: archi.backend.wf -->

Point d'entrée unique où tous les adapters sont instanciés et injectés dans les use-cases / l'orchestrateur. C'est ici (et seulement ici) que application rencontre adapters.

---

## 6.5. Modèle d'exécution
<!-- ctx:ctx.wf-execution-model | scopes: archi.backend.wf -->

```text
Template (spec, versionné)
   └─ lancé → Instance (= WorkflowId, templateVersion figée, seedArtifacts, channelId figé)
                 └─ chaque nœud parcouru → StepExecution (inputs typés → outputs par port)
                       └─ chaque appel LLM/outil → Run (provider, model, tokens, coût, latence)
```

Les steps ne partagent pas de session : la donnée circule par artifacts (résolus via les transitions et les slots variables). Une transition isLoop: true n'est jamais parcourue automatiquement — seul open-feedback-loop (humain) ou un rejet de juge la traverse.

---

## 6.6. Event sourcing & projection
<!-- ctx:ctx.wf-event-sourcing | scopes: archi.backend.wf -->

- Tout passe par [domain/events.ts](apps/desktop/electron/main/wf/domain/events.ts) → append-only dans wf_events (port event-log) et publish sur event-bus.
- L'EngineState (application) maintient une projection incrémentale par instance (mise à jour O(1) par event) puis matérialise un InstanceState immuable caché.
- Au boot, rejouer le log reconstruit tout l'état. Les events sont idempotents par eventId.

---

## 6.7. Artifacts & kinds (la grammaire)
<!-- ctx:ctx.wf-artifacts-grammar | scopes: archi.backend.wf, archi.shared -->

Un kind décrit le type d'un artifact. La grammaire (partagée, [shared/wf/artifact-kind-grammar.ts](apps/desktop/shared/wf/artifact-kind-grammar.ts)) :

- Primitifs / raffinements : String → Url, Email, DateTime, LinearRef ; Number ; Boolean.
- Enveloppes (format + corps) : Markdown, Json, Path, PathList, MarkdownList, RunExport.
- Paramétriques (synthétisés à la résolution) : List<T>, OneOf<A,B,…>, et le sucre Success<T> / Error<E>. Profondeur bornée.
- Dynamiques extensibles : user:<id>@<version> (types utilisateur éditables, SQLite) et plugin:<pluginId>:<id>@<version> (contribués par plugin, lecture seule).

Le typage des ports (portAccepts, [shared/wf/port-accepts.ts](apps/desktop/shared/wf/port-accepts.ts)) gère : wildcard *, raffinement (Url ⊆ String), covariance (List<Url> ⊆ List<String>), élargissement vers OneOf, et égalité par hash structurel. Le ArtifactSchemaRegistry est la seule source de vérité des kinds (built-ins + user + plugin + synthétisés), et compile JSON Schema → Zod à la résolution.

Note legacy : MarkdownList/PathList sont canonicalisés vers List<Markdown>/List<Path> ; loop.foreach/loop.collect sont génériques sur List<T> (via config.itemKind). Double payload toléré : legacy {bodies}/{paths} vs canonique {items}.

---

## 6.8. Catalogue des step kinds — [wf/plugins/](apps/desktop/electron/main/wf/plugins/)
<!-- ctx:ctx.wf-step-kinds | scopes: archi.backend.wf -->

Chaque runner = un fichier implémentant le contrat StepRunner. Catalogue actuel (source de vérité = le dossier) :

| Famille | Runners |
| --- | --- |
| Entrée / variables | user-input, workspace-set |
| LLM | claude-code-invoke, codex-invoke, openrouter-invoke, llm-judge |
| Validation / branchement | format-validate, branch-bool, branch-match |
| Données / transform | json-transform, transform-run, render-markdown, concat-markdown, file-load-markdown |
| Boucles / itération | loop-foreach, loop-collect |
| Humain | human-gate |
| Skills | skill-loader |
| Shell / env | shell-exec, shell-exec-formatter, shell-env |
| Git / CI | git-exec, git-commit-push, git-worktree-create, git-worktree-remove, gitlab-pipeline-wait |
| Intégrations externes | webhook-call, export-run (+ Linear via plugin built-in) |

Référence fonctionnelle détaillée des nœuds : [doc/node_reference.md](doc/node_reference.md).

---

## 6.9. Judge, boucles de feedback, retry
<!-- ctx:ctx.wf-judge-loops | scopes: archi.backend.wf -->

- llm.judge valide un artifact « subject » et route vers les ports approved / rejected / exhausted. Sa sortie suit JudgeOutput ([domain/judge-feedback.ts](apps/desktop/electron/main/wf/domain/judge-feedback.ts)).
- Sur rejet avec retries restants : l'orchestrateur émet LoopOpened (auteur llm.judge:<stepId>) vers le nœud amont, qui réessaie. L'historique de boucle (verdict + commentaires) est réinjecté en markdown dans le prompt via le context-assembler.
- Sur rejet épuisé : route vers exhausted (typiquement câblé à un human.gate).
- Retries bornés : le nombre de tentatives est plafonné (spec [specs/llm-judge-bounded-retries.md](specs/llm-judge-bounded-retries.md)).
- Validation des artifacts : modes strict (throw → StepFailed) / log-only (warn, payload dégradé) / off.

---

## 6.10. Channels (multi-tenant)
<!-- ctx:ctx.wf-channels | scopes: archi.backend.wf -->

Toutes les entités (templates, skills, types, parsers, instances, schedules) sont partitionnées par Channel. Channel par défaut "personal", non supprimable. L'instance fige son channelId au lancement. Contexte courant via le port channel-context.

---

## 6.11. Scheduler
<!-- ctx:ctx.wf-scheduler | scopes: archi.backend.wf -->

WorkflowSchedule (cron 5 champs + timezone + seeds figés) → le SchedulerService arme les jobs croner, fait un catch-up au boot, et déclenche start-instance à chaque tick. Audit des exécutions en base.

---

## 6.12. Parsers
<!-- ctx:ctx.wf-parsers | scopes: archi.backend.wf -->

Transforment un artifact brut en payload simplifié avant injection LLM. Mode declarative (opérations interprétées) ou code (sandbox QuickJS). Registre + runtime sont des ports ; les parsers utilisateur sont éditables, les parsers plugin lecture seule.

---

## 7.1. Chat (« Pi ») — [electron/main/chat/](apps/desktop/electron/main/chat/)
<!-- ctx:ctx.chat | scopes: archi.backend.chat -->

Sous-système hexagonal indépendant (domain / [application/ports/outbound](apps/desktop/electron/main/wf/application/ports/outbound) / adapters). Un ChatService ([chat/chat-service.ts](apps/desktop/electron/main/chat/chat-service.ts)) pilote un agent Pi (@earendil-works/pi-coding-agent).

- Domain : ChatSession (id, titre, modèle, chemin JSONL, snapshot du system prompt), ChatViewContextSnapshot (contexte de la vue active injecté dans les messages).
- Persistance : SQLite ne stocke que les métadonnées de session ; le contenu de la conversation vit dans un fichier JSONL géré par Pi sur disque.
- Ports : agent-session-gateway (Pi), chat-session-store (SQLite), agent-tool-provider (outils custom exposés à Pi).
- Flux : chat:sendMessage (IPC) → service injecte le liveContext → Pi émet des events streamés → callback → win.webContents.send("chat:event", …) → renderer abonné via api.chat.onEvent.

---

## 7.2. Plugins
<!-- ctx:ctx.plugins | scopes: archi.backend.plugins -->

Trois faces :

- Main — [electron/main/plugins/](apps/desktop/electron/main/plugins/) : loader (scan → autorisation par grants → activation onload(api)), registry en mémoire (active/pending/disabled/failed), et une PluginApi filtrée par permissions et re-vérifiée à chaque appel (révocation à chaud). Permissions : fs:read/fs:write, network, secrets, engine:read, engine:steps, notifications.
- Renderer — [src/plugins/](apps/desktop/src/plugins/) : charge les bundles renderer.js, expose une UiPluginApi (pages, onglets de settings, invoke, subscribe).
- SDK — [packages/plugin-sdk/](packages/plugin-sdk/) (@ctxfirst/plugin-sdk) : contrats type-only miroir des deux api, plus des helpers (defineMain), un namespace react et des primitives UI partagées.

Un plugin = un dossier avec manifest.json (zod-validé : id, version, main, renderer, permissions, networkHosts, contributions → stepKinds / artifactSchemas / parsers / routes / nav). Built-ins : [plugins-builtin/](apps/desktop/plugins-builtin/) — hello-world, kanban, linear. Doc : [doc/04-plugins.md](doc/04-plugins.md).

---

## 7.3. Persistance — [electron/main/db/](apps/desktop/electron/main/db/)
<!-- ctx:ctx.persistence | scopes: archi.backend.persistence -->

- SQLite (better-sqlite3, WAL, FK on) dans le userData. Migrations versionnées. Tables préfixées wf_* (events, artifacts (métadonnées), runs, templates, skills, parsers, channels, schedules, llm_session_events, …), plus app_settings, chat_sessions, grants plugins, dossiers explorer.
- Store d'artifacts : le contenu des artifacts n'est pas en base — il est sur disque, content-addressed (sha256), dédupliqué. La base ne porte que kind + hash + storageRef.

---

## 7.4. MCP — [electron/main/mcp/](apps/desktop/electron/main/mcp/)
<!-- ctx:ctx.mcp | scopes: archi.backend.mcp -->

Serveur MCP in-app (@modelcontextprotocol/sdk, HTTP stateless local) exposant des outils ctxfirst_* (templates, node specs, skills, artifact kinds, run artifacts). Invocable aussi in-process (sans HTTP) via IPC, et utilisé comme customTools par l'agent Pi.

---

## 7.5. Settings — [electron/main/settings/](apps/desktop/electron/main/settings/)
<!-- ctx:ctx.settings | scopes: archi.backend.settings -->

SettingsStore sur app_settings. Secrets (clés Linear, OpenRouter) chiffrés via Electron safeStorage (fallback plain: si keychain indisponible). Stocke aussi modèle OpenRouter par défaut, liste de modèles, system prompt du chat, channel actif. clearAll() = factory reset.

---

## 7.6. Explorer — [electron/main/explorer/](apps/desktop/electron/main/explorer/)
<!-- ctx:ctx.explorer | scopes: archi.backend.explorer -->

Sous-système hexagonal pour l'organisation en dossiers (runs/templates). Ports + adapter folder-repo.

---

## 8. Couche partagée — [apps/desktop/shared/wf/](apps/desktop/shared/wf/)
<!-- ctx:ctx.shared | scopes: archi.shared -->

Modules purs importables des deux côtés (main ET renderer) sans casser l'isolation (aucun accès natif). Ils encodent la logique de typage et de rendu identique côté moteur et côté UI :

| Module | Rôle |
| --- | --- |
| [types.ts](apps/desktop/shared/wf/types.ts) | PortKindMatcher, PortView, OutputPortView, NodeSpecView, TemplateVariableView — vues partagées des specs de nœuds. |
| [artifact-kind-grammar.ts](apps/desktop/shared/wf/artifact-kind-grammar.ts) | Parsing/construction des kinds paramétriques (List<>, OneOf<>, Success/Error). |
| [port-accepts.ts](apps/desktop/shared/wf/port-accepts.ts) | portAccepts() — règle d'acceptation d'un kind par un port (wildcard, raffinement, covariance, hash). |
| [structural-hash.ts](apps/desktop/shared/wf/structural-hash.ts) | Hash structurel d'un schéma = identité ensembliste des kinds. |
| [resolve-node-spec.ts](apps/desktop/shared/wf/resolve-node-spec.ts) | Résolution d'un NodeSpec par id de kind (consomme le registre plugin). |
| [render-artifact-markdown.ts](apps/desktop/shared/wf/render-artifact-markdown.ts) / [display-content.ts](apps/desktop/shared/wf/display-content.ts) | Rendu/projection markdown d'un artifact. |
| [placeholders.ts](apps/desktop/shared/wf/placeholders.ts) | Substitution {{champ}} pour les schémas user / skills. |
| [derive-kind-sample.ts](apps/desktop/shared/wf/derive-kind-sample.ts) / [simplified-schema-to-shape-text.ts](apps/desktop/shared/wf/simplified-schema-to-shape-text.ts) | Échantillon & description de forme d'un schéma. |
| [layout.ts](apps/desktop/shared/wf/layout.ts) | Persistance de la disposition du template editor (positions, viewport). |
| [run-export.ts](apps/desktop/shared/wf/run-export.ts) / [token-usage.ts](apps/desktop/shared/wf/token-usage.ts) / [channel-icon-image.ts](apps/desktop/shared/wf/channel-icon-image.ts) | Export d'un run, agrégation de tokens, image d'icône de channel. |

La plupart sont colocalisés avec leur .test.ts.

---

## 9. Contrat IPC
<!-- ctx:ctx.ipc | scopes: archi.ipc -->

Câblage en trois points :

- ipcMain.handle("name", …) dans un module de [electron/main/ipc/](apps/desktop/electron/main/ipc/), découpé par feature : wf, chat, plugins, settings, system, devlog, shell, explorer, mcp, maintenance.
- Exposition dans [electron/preload/index.ts](apps/desktop/electron/preload/index.ts) via ipcRenderer.invoke("name", …) à l'intérieur de l'objet api (type publié export type Api = typeof api).
- Appel renderer via window.api.<method>(…) uniquement depuis un adapter de [src/infrastructure/electron/](apps/desktop/src/infrastructure/electron/).

Streaming main → renderer : event.sender.send("event-name", payload) dans le handler ; le preload expose un subscribe qui wrappe ipcRenderer.on/off et retourne une fonction de désabonnement. Canaux d'events notables : wf:event, wf:llmSession, chat:event, devlog:line, wf:folders:changed, wf:channelChanged.

---

## 10.1. Hexagonal côté renderer
<!-- ctx:ctx.fe-hexagonal | scopes: archi.frontend -->

Mêmes couches qu'au backend :

- domain — [src/domain/](apps/desktop/src/domain/) : types purs (workflow, chat, settings, explorer, plugin).
- [application/ports](apps/desktop/electron/main/wf/application/ports) — [src/application/ports/](apps/desktop/src/application/ports/) : interfaces *-gateway (workflow, chat, settings, system, plugin, folder, dev-log) + task-repository.
- [application/use-cases](apps/desktop/electron/main/wf/application/use-cases) — [src/application/use-cases/](apps/desktop/src/application/use-cases/) : ~57 fabriques fines make…(gateway) qui appellent les ports.
- [infrastructure/electron](apps/desktop/src/infrastructure/electron) — [src/infrastructure/electron/](apps/desktop/src/infrastructure/electron/) : les adapters electron-*-gateway qui, eux seuls, appellent window.api.*. Pendant [infrastructure/mock](apps/desktop/src/infrastructure/mock) pour dev/tests.

---

## 10.2. Injection de dépendances — [src/ui/di/](apps/desktop/src/ui/di/)
<!-- ctx:ctx.fe-di | scopes: archi.frontend -->

build-services est le composition root du renderer : il crée les adapters createElectron*Gateway, les câble aux use-cases make*, et retourne un objet Services (type dans [services.ts](apps/desktop/src/ui/di/services.ts)), fourni via React Context (services-provider). Les hooks consomment Services, jamais les ports directement.

---

## 10.3. Workbench (dockview) — [src/ui/workbench/](apps/desktop/src/ui/workbench/)
<!-- ctx:ctx.workbench | scopes: archi.frontend -->

UI façon VSCode, construite sur dockview-react. (Remplace l'ancien modèle « AppShell/routing » : tout ARCHITECTURE antérieur décrivant un AppShell est obsolète.) Pièces :

- Registry — [workbench/registry.ts](apps/desktop/src/ui/workbench/registry.ts) : registre de contributions avec pub/sub. Quatre types : ActivityContribution (barre d'activité, ordre, route éventuelle, mode launcher), ViewContribution (vue de sidebar left/right/bottom, éligibilité whenEditor/activity, lifecycle persistant ou contextuel), EditorTypeContribution (type d'éditeur par scheme d'URI, rendu d'onglet, getChatContext), FeatureHostContribution (Providers/Overlays scoping une feature).
- Store — [workbench/store.ts](apps/desktop/src/ui/workbench/store.ts) : zustand (editors, activeEditor, activeActivity, handle dockviewApi). Prefs persistées en localStorage sous la clé ctxfirst:workbench:v1 ([workbench/prefs.ts](apps/desktop/src/ui/workbench/prefs.ts)).
- Reconciler — [workbench/dock-reconciler.ts](apps/desktop/src/ui/workbench/dock-reconciler.ts) : moteur de cycle de vie des vues (sélection de la vue primaire, auto-show/hide selon autoShow + lifecycle).
- Sync routeur — [workbench/WorkbenchRouterSync.tsx](apps/desktop/src/ui/workbench/WorkbenchRouterSync.tsx) : mapping bidirectionnel URL HashRouter ↔ éditeur ouvert. ⚠️ Toute activité routée doit être déclarée en dur ici (uriFromUrl/urlFromUri), sinon cliquer son icône ne fait rien.
- Shell : [Workbench.tsx](apps/desktop/src/ui/workbench/Workbench.tsx), [WorkbenchDock.tsx](apps/desktop/src/ui/workbench/WorkbenchDock.tsx) (le <DockviewReact>), [ActivityBar.tsx](apps/desktop/src/ui/workbench/ActivityBar.tsx). ActivityBar et WorkbenchDock lisent le registre via useSyncExternalStore pour capter les enregistrements tardifs (plugins).

---

## 10.4. Features & contributions — [src/ui/features/](apps/desktop/src/ui/features/)
<!-- ctx:ctx.fe-features | scopes: archi.frontend -->

Une feature = un dossier auto-contenu avec un contributions.ts qui enregistre activités/vues/éditeurs dans le registre. Features : overview, explorer, runs, schedules, templates, skills, artifact-schemas, chat, terminal, settings. L'enregistrement se fait par import side-effect (un register-contributions importe chaque contributions.ts). chat et terminal sont des vues globales en mode launcher (toggle, pas d'activité plein écran).

---

## 10.5. Stores, query, i18n, channels
<!-- ctx:ctx.fe-stores-query | scopes: archi.frontend -->

- Stores — [src/ui/stores/](apps/desktop/src/ui/stores/) : zustand par préoccupation (appearance, template-canvas, skill-editor, artifact-schema-editor, run-panel, review-editor, runs, explorer-view…). Les stores *-editor/*-canvas exposent le handle lu par getChatContext.
- Query — [src/ui/query/](apps/desktop/src/ui/query/) : react-query avec staleTime: Infinity ; un WorkflowEventsBridge écoute le flux wf:event et invalide les queries (cache event-driven, pas de polling).
- Hooks — [src/ui/hooks/](apps/desktop/src/ui/hooks/) : useWorkflow, useSkills, useWorkflowTemplates, useInstanceList, useAwaitingHumanInbox… consomment Services.
- i18n — [src/ui/i18n/](apps/desktop/src/ui/i18n/) : i18next ; ESLint i18next/no-literal-string actif. (Migration en cours : StepInspector, StepNode, StepInfoPanel pas encore migrés ; warnings pré-existants.)
- Channels — [src/ui/channels/](apps/desktop/src/ui/channels/) : sélecteur de channel actif, dialogs de création/édition.

---

## 10.6. Design system & composants
<!-- ctx:ctx.fe-design-system | scopes: archi.frontend -->

- [src/components/ui/](apps/desktop/src/components/ui/) : primitives shadcn/ui sur @base-ui/react (button, card, input, select, dialog, popover, tooltip…), avec stories Storybook.
- [src/ui/components/](apps/desktop/src/ui/components/) : composants métier réutilisables (ArtifactView, StepInfoPanel, LlmSessionPanel, WorkflowStartForm, badges, toolbar…).
- Migration en cours des <button>/<input>/<select>/<textarea> bruts vers le DS — audit [scripts/audit-raw-jsx-elements.js](scripts/audit-raw-jsx-elements.js).

---

## 11. Conventions de code
<!-- ctx:ctx.conventions | scopes: archi.conventions -->

- Composant React : const arrow-function + export default sur une ligne séparée. Jamais de function ni d'export default inline.
- Analyse de code TS/TSX : utiliser l'AST du compilateur TypeScript, pas du regex/grep.
- Markdown du repo (optimisé LLM) : pas de mention nue nom.ext en prose — soit lien markdown, soit backticks. Audit [scripts/audit-markdown-links.js](scripts/audit-markdown-links.js).
- Types d'API backend : jamais écrits à la main — toujours générés depuis le schéma (cf. [CLAUDE.md](CLAUDE.md) § [apps/api](apps/api)).
- Tests : colocalisés (*.test.ts(x)), Vitest.
- Ne pas démarrer les serveurs de dev (yarn dev, storybook, …) sauf demande explicite.

```tsx
const Composant = (props: PropsType) => { /* … */ }

export default Composant
```

---

## 12. Build, typecheck & pièges connus
<!-- ctx:ctx.build-pitfalls | scopes: archi.conventions -->

- Commandes : voir [CLAUDE.md](CLAUDE.md) § Commandes et justfile.
- ⚠️ yarn typecheck / yarn build desktop échoue actuellement sur 2 erreurs TS2688 pré-existantes (@types/hapi__catbox / shot), sans rapport avec le code applicatif. Le bundle reste vérifiable via electron-vite build direct. (Ne pas attribuer ces erreurs à une modification en cours.)

---

## Invariants anti-drift (checklist du juge)

Liste testable d'invariants structurels. Une PR qui en viole un, sans justification explicite, **dérive**.

### Isolation des process

1. **Le renderer ne touche jamais au natif** `[iso-renderer-no-native]` — _blocker_, scopes: archi.process-isolation, archi.frontend
   Aucun fichier sous [src/](apps/desktop/src/) n'importe child_process, fs, better-sqlite3, electron (hors types), ni un builtin Node. Tout accès natif passe par window.api.

2. **Seuls les adapters appellent window.api** `[iso-window-api-adapters-only]` — _blocker_, scopes: archi.process-isolation, archi.frontend, archi.ipc
   Une référence à window.api.* hors de [src/infrastructure/electron/](apps/desktop/src/infrastructure/electron/) est une violation.

3. **Le preload ne contient pas de logique métier** `[iso-preload-no-business-logic]` — _blocker_, scopes: archi.process-isolation, archi.ipc
   Uniquement du forwarding invoke/on. Tout calcul ou condition métier dans [preload/index.ts](apps/desktop/electron/preload/index.ts) dérive.

4. **Nouvelle origine externe ⇒ CSP mise à jour** `[iso-new-origin-csp]` — _blocker_, scopes: archi.process-isolation
   Un fetch/ws vers une origine absente de la CSP dérive. Toute nouvelle origine (API, CDN font, websocket) doit être ajoutée à connect-src / font-src / etc.

### Hexagonal (les deux côtés)

5. **domain n'importe que domain** `[hex-domain-imports-domain]` — _blocker_, scopes: archi.hexagonal, archi.backend.wf, archi.backend.chat, archi.backend.explorer, archi.frontend
   Tout import depuis un fichier [domain/](apps/desktop/electron/main/wf/domain/) vers [application/](apps/desktop/electron/main/wf/application/), [adapters/](apps/desktop/electron/main/wf/adapters/) ou [infrastructure/](apps/desktop/src/infrastructure/) dérive.

6. **application n'importe jamais un adapter concret** `[hex-app-no-concrete-adapter]` — _blocker_, scopes: archi.hexagonal, archi.backend.wf, archi.backend.chat, archi.backend.explorer, archi.frontend
   application importe seulement domain et ses ports ([application/ports/outbound/](apps/desktop/electron/main/wf/application/ports/outbound/) ou [src/application/ports/](apps/desktop/src/application/ports/)). Jamais un adapter concret.

7. **Câblage adapters ↔ application uniquement au composition root** `[hex-wiring-composition-root-only]` — _blocker_, scopes: archi.hexagonal, archi.backend.wf, archi.backend.chat, archi.frontend
   Instancier un adapter concret dans application, hors composition root, dérive.

8. **Un port = une interface, un dossier d'adapter** `[hex-port-one-interface]` — _blocker_, scopes: archi.hexagonal, archi.backend.wf, archi.backend.plugins, archi.shared
   Une capacité native ajoutée sans port intermédiaire dérive. Un port (interface dans [.../ports/outbound/](apps/desktop/electron/main/wf/application/ports/outbound/)) est implémenté par exactement un dossier d'adapter.

### Moteur de workflow

9. **L'état d'exécution ne se mute que par DomainEvent** `[wf-state-mutated-by-events]` — _blocker_, scopes: archi.backend.wf
   Un use-case qui modifie l'état d'instance sans émettre d'event (append log puis publish bus) dérive. La projection reste une fonction pure sans IO.

10. **Pas de partage de session LLM entre steps** `[wf-no-llm-session-sharing]` — _blocker_, scopes: archi.backend.wf
   Toute donnée inter-step circule par artifacts typés / variables, jamais par une conversation LLM persistée parent↔enfant. Invariant de design permanent.

11. **Le contenu d'un artifact n'est pas en base** `[wf-artifact-content-not-in-db]` — _blocker_, scopes: archi.backend.wf, archi.backend.persistence
   Le contenu est content-addressed sur disque ; la base ne stocke que kind / hash / storageRef.

12. **Un nouveau step kind = un runner dans wf/plugins/** `[wf-new-stepkind-is-runner]` — _blocker_, scopes: archi.backend.wf
   Un nouveau runner respecte le contrat StepRunner/NodeSpec/StepOutcome de [step-runner.ts](apps/desktop/electron/main/wf/application/step-runner.ts). Le domain et l'orchestrateur ne changent pas pour ajouter un kind.

13. **Les kinds passent par le ArtifactSchemaRegistry** `[wf-kinds-via-registry]` — _blocker_, scopes: archi.backend.wf, archi.shared
   Source unique. Pas de table de kinds parallèle ; la grammaire (List<>/OneOf<>/raffinements) reste celle de [shared/wf/artifact-kind-grammar.ts](apps/desktop/shared/wf/artifact-kind-grammar.ts).

14. **L'acceptation de typage des ports passe par portAccepts** `[wf-port-typing-via-portaccepts]` — _blocker_, scopes: archi.backend.wf, archi.shared
   Une comparaison de kinds ad-hoc par égalité de string dérive (elle rate raffinement/covariance/hash).

15. **templateVersion et channelId figés au lancement** `[wf-version-channel-frozen]` — _blocker_, scopes: archi.backend.wf
   templateVersion et channelId sont figés au lancement de l'instance et ne changent jamais ensuite.

16. **Une transition isLoop n'est jamais auto-parcourue** `[wf-loop-not-auto-traversed]` — _blocker_, scopes: archi.backend.wf
   Seules open-feedback-loop (humain) ou un rejet de juge traversent une transition isLoop.

### Frontend / workbench

17. **Toute activité routée est déclarée dans WorkbenchRouterSync** `[fe-routed-activity-declared]` — _blocker_, scopes: archi.frontend
   Une ActivityContribution avec route: doit avoir son mapping uriFromUrl/urlFromUri dans [WorkbenchRouterSync.tsx](apps/desktop/src/ui/workbench/WorkbenchRouterSync.tsx), sinon cliquer son icône ne fait rien.

18. **Une feature s'enregistre via son contributions.ts** `[fe-feature-via-contributions]` — _blocker_, scopes: archi.frontend
   Activités/vues/éditeurs sont enregistrés dans le workbenchRegistry via contributions.ts, importé en side-effect par register-contributions. Brancher une feature en dur dans le shell, hors registre, dérive.

19. **Le renderer consomme Services (DI), pas les ports directement** `[fe-consume-services-di]` — _blocker_, scopes: archi.frontend
   Un composant/hook qui instancie un gateway au lieu de lire le contexte Services dérive.

20. **Cache react-query invalidé par events, pas par polling** `[fe-query-invalidated-by-events]` — _blocker_, scopes: archi.frontend
   La source d'invalidation est WorkflowEventsBridge sur wf:event. Ajouter du polling sur des données déjà couvertes par le flux d'events dérive.

### Conventions

21. **Composant React = const arrow + export default sur ligne séparée** `[conv-react-component-style]` — _warning_, scopes: archi.conventions, archi.frontend
   Une function Component ou un export default inline dérive.

22. **Pas de type d'API backend écrit à la main** `[conv-no-handwritten-api-types]` — _blocker_, scopes: archi.conventions
   Génération depuis le schéma uniquement (cf. [CLAUDE.md](CLAUDE.md) § [apps/api](apps/api)).

23. **Pas de mention nue nom.ext en prose markdown** `[conv-no-bare-filename-markdown]` — _warning_, scopes: archi.conventions
   Une mention de fichier en prose doit être un lien markdown ou en backticks.

### Méta

24. **Ce document suit le code** `[meta-doc-follows-code]` — _info_, scopes: archi.meta
   Si un invariant contredit le code réel et que le code est intentionnel, c'est ce document qu'il faut mettre à jour — pas le code qu'il faut « réparer ». Le juge signale la divergence ; l'humain tranche.

---

## Zones mouvantes (ne pas figer)

Le juge doit y être **tolérant** :
- **i18n-migration** (archi.frontend) — Migration i18n des composants template (StepInspector, StepNode, StepInfoPanel) — warnings pré-existants, pas des régressions.
- **raw-jsx-migration** (archi.frontend) — Migration JSX brut → design system (audit raw-jsx en cours).
- **secondary-workspaces** (archi.monorepo) — [apps/api](apps/api) / [apps/web](apps/web) : scaffolding, pas encore couplés au desktop ; le backend distant futur sera en Node, repo séparé, non implémenté.
- **specs-ahead-of-code** (archi.meta) — Specs en avance sur le code : [specs/](specs/) décrit des features parfois non encore (entièrement) implémentées — une spec n'est pas une preuve d'existence dans le code.
- **legacy-artifact-payloads** (archi.backend.wf) — Payloads legacy d'artifacts ({bodies}/{paths} vs {items}) : double support transitoire toléré.

---

*Source canonique : `ARCHITECTURE.json`. En cas de doute structurant, `code` prime sur `this-document` prime sur `specs`.*
