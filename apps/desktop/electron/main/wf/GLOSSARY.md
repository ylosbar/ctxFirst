# Glossaire du moteur de workflow

Ce document recense les concepts manipulés par le module `wf/`. Il est organisé
en couches (domaine → exécution → infra) pour qu'on puisse le lire de haut en
bas en partant de l'idée la plus statique.

> **Convention.** Quand un terme apparaît en `code`, il correspond à un type
> exporté par le module ; les fichiers cités sont relatifs à
> `apps/desktop/electron/main/wf/`.

---

## 1. Définitions statiques (le « plan »)

### `WorkflowTemplate` — *Modèle de workflow*
Fichier : [domain/template.ts](domain/template.ts)

Spécification immuable d'un workflow : la liste des étapes, leurs transitions
(y compris les boucles autorisées), le step d'entrée et les steps de sortie.
C'est la **forme abstraite** d'un processus, pas son exécution.

| Champ | Description |
|---|---|
| `id` (`TemplateId`) | Identifiant logique, ex. `"feature-from-spec"`. |
| `version` (`TemplateVersion`) | Version, ex. `"v1"`. Un template publié est figé. |
| `entryStep` (`StepId`) | Premier step exécuté quand on démarre une instance. |
| `exitSteps` (`StepId[]`) | Steps qui terminent le workflow s'ils sont validés. |
| `steps` (`StepDef[]`) | Définitions des nœuds du graphe. |
| `transitions` (`Transition[]`) | Arêtes orientées entre steps. |
| `status` | `"draft"` (en cours d'écriture) ou `"published"` (figé). |

`validateTemplate(tpl)` vérifie les invariants structurels (entry/exit
existent, pas de cycle non-loop, etc.) et lève `TemplateError`.

> **Workflow-as-data.** Le moteur ne connaît aucun workflow en dur. Ajouter un
> nouveau processus = écrire un nouveau template, pas du code.

---

### `StepDef` — *Définition d'une étape*
Fichier : [domain/template.ts](domain/template.ts)

Un nœud du graphe. C'est une **case statique** : "à cet endroit du workflow,
on appelle un runner de tel kind, avec telle config, et il produira un
artefact de tel kind."

| Champ | Description |
|---|---|
| `id` (`StepId`) | Identifiant local au template, ex. `"generate-patch"`. |
| `name` | Libellé humain. |
| `kind` (`StepKindId`) | Catégorie de runner (`"user.input"`, `"claude_code.invoke"`, `"human.gate"`, …). |
| `actorRole` (`ActorRole`) | Qui agit : `"PO"`, `"Developer"`, `"LLMAgent"`. |
| `skillRef` (`SkillRef?`) | Référence d'un Skill ; obligatoire pour `claude_code.invoke`. |
| `config` | Sac à options propre au runner (le runner sait le parser). |
| `inputKinds` (`ArtifactKind[]`) | Types d'artefacts attendus en entrée *depuis le graphe*. |
| `outputKind` (`ArtifactKind`) | Type d'artefact que le step produira. |
| `humanGateRequired` | Si `true`, le step se met en pause après exécution. |

> ⚠ `inputKinds` ne décrit que ce qui vient **du graphe**. Le step d'entrée
> (`user.input`) reçoit ses données via `seedArtifacts` et déclare donc
> `inputKinds: []`.

---

### `Transition` — *Arête entre deux steps*
Fichier : [domain/template.ts](domain/template.ts)

Une flèche orientée `from → to`. Le flag `isLoop` distingue deux familles :

- `isLoop: false` : transition **séquentielle**, suivie automatiquement quand
  le step `from` est `validated`. Aucun cycle non-loop n'est autorisé.
- `isLoop: true` : transition **de retour en arrière** (boucle de feedback).
  Elle n'est jamais empruntée automatiquement ; seul `OpenFeedbackLoop` peut
  la déclencher.

---

### `StepKindId` — *Catégorie de runner*
Fichier : [domain/template.ts](domain/template.ts)

Chaîne libre qui sert de clé dans le `StepRunnerRegistry`. Les kinds livrés
en standard :

| Kind | Runner | Rôle |
|---|---|---|
| `"user.input"` | [plugins/user-input.ts](plugins/user-input.ts) | Promeut un seed artifact en sortie typée du graphe. |
| `"claude_code.invoke"` | [plugins/claude-code-invoke.ts](plugins/claude-code-invoke.ts) | Invoque un LLM avec un Skill comme system prompt. |
| `"human.gate"` | [plugins/human-gate.ts](plugins/human-gate.ts) | Met l'instance en pause `awaiting-human`. |

Ajouter un kind = écrire un nouveau `StepRunner` et l'enregistrer ; rien à
toucher dans le domaine ni l'orchestrateur.

---

### `ActorRole` — *Rôle attendu sur un step*
Valeurs : `"PO"`, `"Developer"`, `"LLMAgent"`.

Sert de pré-câblage RBAC : indique qui est censé valider/exécuter un step.
Utilisé en v2 pour autoriser/refuser les `human.gate` selon l'utilisateur.

---

### `Skill` — *Prompt versionné*
Fichier : [domain/skill.ts](domain/skill.ts)

Un Skill est un **prompt système** versionné, identifié par un `SkillRef`
(format `"name@version"`). Immuable par version : publier une version =
créer un nouveau `SkillRef`. Consommé par les steps `claude_code.invoke` via leur
`config.skillRef`.

| Champ | Description |
|---|---|
| `ref` (`SkillRef`) | Identifiant canonique, ex. `"implement-from-spec@v2"`. |
| `body` | Texte du prompt système, envoyé verbatim au LLM. |
| `meta` | Métadonnées libres (langue cible, kind de sortie attendu…). |

---

### `ArtifactKind` — *Type d'artefact*
Fichier : [domain/artifact.ts](domain/artifact.ts)

Union fermée des types d'artefacts compris par le workflow courant
(`Markdown`, `LinearRef`, `LinearTicket`, `Path`, `PathList`, `MarkdownList`,
`RunExport`). Étendre cette union (ou la transformer en registre) pour de
nouveaux workflows.

C'est le contrat de typage qui relie un `outputKind` de step `A` aux
`inputKinds` de ses successeurs.

---

## 2. Exécution (le « run »)

### `WorkflowInstance` — *Exécution concrète d'un template*
Fichier : [domain/instance.ts](domain/instance.ts)

Une instance, c'est **un run du template**. Si tu lances 3 fois
`feature-from-spec@v1`, tu as 3 `WorkflowInstance` distinctes, chacune avec
son `WorkflowId`.

| Champ | Description |
|---|---|
| `id` (`WorkflowId`) | Identifiant de l'instance (a.k.a. `instanceId`). |
| `templateId` + `templateVersion` | Template **figé au démarrage** ; même si le template est republié, l'instance reste cohérente. |
| `status` (`InstanceStatus`) | `"running"`, `"awaitingHuman"`, `"completed"`, `"failed"`. |
| `seedArtifacts` (`ArtifactId[]`) | Inputs initiaux fournis par l'utilisateur (cf. `StartInstance`). |
| `executions` (`StepExecution[]`) | Historique chronologique de toutes les exécutions de step. |
| `createdAt` | ISO-8601. |

> 🧠 Le `WorkflowInstance` n'est **pas stocké tel quel**. Il est *projeté* à
> partir du log d'events (cf. `domain/projection.ts`). On peut le
> reconstruire en rejouant la suite d'events.

---

### `StepExecution` — *Une exécution d'un step dans une instance*
Fichier : [domain/instance.ts](domain/instance.ts)

C'est l'unité granulaire d'historique. Un même `StepId` peut donner
plusieurs `StepExecution` dans la même instance (boucle de feedback : chaque
re-tentative crée une nouvelle exécution).

| Champ | Description |
|---|---|
| `id` (`StepExecId`) | Identifiant unique de cette exécution. |
| `stepId` (`StepId`) | Quelle case du template est exécutée. |
| `instanceId` (`WorkflowId`) | À quelle instance appartient cette exécution. |
| `status` (`StepExecStatus`) | Voir ci-dessous. |
| `inputArtifacts` (`ArtifactId[]`) | Artefacts effectivement injectés (résolus par `buildInputs`). |
| `outputArtifact` (`ArtifactId?`) | Sortie produite, si terminé. |
| `runs` (`RunId[]`) | Identifiants de runs LLM associés (vide si non-LLM). |
| `humanFeedback` | Le feedback collé par l'humain, si l'exécution a été `looped`. |
| `loopFrom` (`StepExecId?`) | Si cette exécution est née d'une boucle, l'`id` de l'exécution qui l'a déclenchée. |
| `error` | Message d'erreur si `status === "failed"`. |

### `StepExecStatus`

```
pending  → l'orchestrateur ne l'a pas encore lancée
running  → un runner s'exécute
awaitingHuman → en pause sur un human.gate, attend une décision
validated → terminée OK et approuvée (auto ou humain)
looped   → invalidée par une FeedbackLoop ; sa sortie reste lisible
failed   → le runner a throw
```

Les transitions entre ces états sont pilotées par les events (cf. § 3) et
matérialisées par la projection.

---

### `InstanceStatus` — *État global de l'instance*

```
running        → au moins un step en running ou pending
awaitingHuman  → au moins un step en awaitingHuman
completed      → un exit step est validated
failed         → au moins un step failed et plus rien à exécuter
```

C'est un **agrégat** dérivé des `StepExecution`s, pas une valeur posée à la
main.

---

### `Artifact` — *Payload typé qui circule entre les steps*
Fichier : [domain/artifact.ts](domain/artifact.ts)

Un Artifact, c'est une **donnée nommée et adressable**. Les steps n'échangent
jamais de chaînes en clair : ils produisent des `Artifact`s, et le step
suivant lit le contenu via le store.

| Champ | Description |
|---|---|
| `id` (`ArtifactId`) | Identifiant opaque. |
| `kind` (`ArtifactKind`) | Type logique, ex. `"Markdown"`. |
| `hash` (`ArtifactHash`) | SHA-256 du contenu → permet la déduplication de stockage. |
| `storageRef` | Référence opaque (ex. chemin filesystem) utilisée par le store. |
| `metadata` (`Record<string,string>`) | Métadonnées libres (model utilisé, tokens, sourceKind…). |
| `createdAt` | ISO-8601. |

> Le **contenu** n'est pas embarqué dans l'`Artifact` : on passe par
> `ArtifactStore.get(id)` pour le récupérer. Cela évite de balader des
> charges utiles potentiellement énormes dans les events.

---

### `RunRecord` — *Trace d'un appel LLM*
Fichier : [application/ports/outbound/run-log.ts](application/ports/outbound/run-log.ts)

Une ligne dénormalisée par invocation LLM. Sert aux dashboards
coût/latence/tokens. Plusieurs `RunRecord` peuvent être attachés à la même
`StepExecution` (par exemple si le runner fait plusieurs appels), mais en
pratique le runner `claude_code.invoke` actuel n'en émet qu'un.

| Champ | Description |
|---|---|
| `id` (`RunId`) | Identifiant unique du run. |
| `stepExecId` | Auquel step exec appartient ce run. |
| `provider` | Fournisseur LLM (ex. `"anthropic"`). |
| `model` | Modèle utilisé (ex. `"claude-opus-4-7"`). |
| `promptHash` | SHA-256 du prompt assemblé → corrélation / cache. |
| `tokensIn`, `tokensOut` | Usage token. |
| `costUsd?` | Si remonté par le provider. |
| `latencyMs` | Durée totale de l'appel. |
| `outputRef?` | `ArtifactId` produit (en string). |

---

### `FeedbackLoop` — *Demande humaine de retour en arrière*
Fichier : [domain/feedback.ts](domain/feedback.ts)

Quand un humain rejette la sortie d'un step (typiquement sur un
`human.gate`), il **ouvre une boucle** : le système doit ré-exécuter un step
amont en lui injectant le feedback humain.

| Champ | Description |
|---|---|
| `id` (`LoopId`) | Identifiant de la boucle. |
| `instanceId` | Sur quelle instance. |
| `fromStepExec` (`StepExecId`) | L'exécution rejetée (en aval). |
| `toStepId` (`StepId`) | La case à ré-exécuter (en amont). |
| `reason` | Texte libre saisi par l'humain — réinjecté dans le prochain prompt sous `## Historique de boucle`. |
| `author` | Qui a ouvert la boucle. |
| `openedAt`, `closedAt?` | `closedAt` est posé quand le step cible a re-produit une sortie. |

Cycle : `LoopOpened` → `StepStarted` (avec `loopFrom`) → … → `LoopClosed`.

---

## 3. Couche événements (la « source de vérité »)

### `DomainEvent` — *Mutation atomique du système*
Fichier : [domain/events.ts](domain/events.ts)

**Tout** changement d'état passe par un event appendé au log puis publié sur
le bus. Le `WorkflowInstance` est ensuite *projeté* (replay du log) — il
n'existe pas de mutation directe de l'instance.

Variantes :

| Type d'event | Émis par | Conséquence côté projection |
|---|---|---|
| `InstanceStarted` | `StartInstance` | Crée l'instance et fixe `seedArtifacts`. |
| `StepStarted` | Orchestrateur (au moment d'invoquer un runner) | Ajoute un `StepExecution` `running`. |
| `StepProducedArtifact` | Orchestrateur (après `StepOutcome` `produced`) | Pose l'`outputArtifact`. |
| `StepAwaitingHumanGate` | Orchestrateur (après `StepOutcome` `awaiting-human`) | Passe l'exec en `awaitingHuman`. |
| `StepValidated` | Auto pour les non-gated, ou `SubmitHumanDecision(approve)` | Passe l'exec en `validated`, déclenche la transition. |
| `StepFailed` | Orchestrateur si le runner `throw` | Passe l'exec en `failed`. |
| `LoopOpened` | `OpenFeedbackLoop` | Marque l'exec source `looped`, prévoit une nouvelle exec sur `toStepId`. |
| `LoopClosed` | Orchestrateur quand le step ciblé a re-produit | Pose `closedAt` sur la `FeedbackLoop`. |
| `InstanceCompleted` | Orchestrateur quand un `exitStep` est `validated` | Passe l'instance en `completed`. |

Tous les events partagent `eventId` (UUID stable, idempotence) et `at`
(ISO-8601).

---

### Projection
Fichier : [domain/projection.ts](domain/projection.ts)

Reducer pur `(events: DomainEvent[]) → WorkflowInstance`. Tout l'état
(statut, executions, seedArtifacts, …) est dérivé d'ici. Conséquences :

- **Replay-safe.** Tuer puis relancer l'app → on rejoue le log → état
  identique.
- **Auditable.** Chaque champ a une cause traçable dans l'historique.
- **Pas de désynchronisation.** Pas de cache "à la main" qui peut diverger.

---

## 4. Identifiants

Fichier : [domain/ids.ts](domain/ids.ts)

Tous les identifiants sont des `Brand<string, "...">` : strings au runtime,
nominaux à la compilation. Ça empêche un `StepId` d'être passé à la place
d'un `WorkflowId`, etc.

| ID | Désigne |
|---|---|
| `TemplateId` | Un `WorkflowTemplate` (ex. `"feature-from-spec"`). |
| `TemplateVersion` | Une version d'un template (ex. `"v1"`). |
| `StepId` | Une **case** dans le template (ex. `"generate-patch"`). |
| `StepExecId` | Une **exécution** de cette case dans une instance donnée. |
| `WorkflowId` | Une `WorkflowInstance` (a.k.a. `instanceId`). |
| `ArtifactId` | Un `Artifact` stocké. |
| `ArtifactHash` | SHA-256 du contenu d'un artefact. |
| `SkillRef` | `name@version` d'un Skill. |
| `RunId` | Une trace `RunRecord` (un appel LLM). |
| `LoopId` | Une `FeedbackLoop`. |
| `EventId` | Un `DomainEvent` (déduplication de replay). |

Hiérarchie pratique :

```
TemplateId ─────────── (le plan, statique)
   └── StepId ──────── (case dans le plan)

WorkflowId ─────────── (un run du plan, dynamique)
   ├── seedArtifacts → [ArtifactId, …]
   └── executions    → [StepExecution, …]
                          ├── id      = StepExecId   ← une exécution physique
                          ├── stepId  = StepId       ← quelle case
                          ├── runs    = [RunId, …]   ← appels LLM
                          └── output  = ArtifactId
```

---

## 5. Plomberie d'exécution

### `StepRunner` — *Plug-in d'exécution d'un step*
Fichier : [application/step-runner.ts](application/step-runner.ts)

Stratégie qui sait exécuter un step d'un `kind` donné. Contrat :

```ts
interface StepRunner {
  readonly kind: StepKindId;
  run(ctx: RunContext): Promise<StepOutcome>;
}
```

L'orchestrateur appelle `registry.resolve(step.kind).run(ctx)`. Toutes les
dépendances (LLM, store, horloge, IDs, bus de chunks) passent par
`ctx.deps` — aucun import direct. Conséquence : runners testables sans
réseau ni LLM réel.

### `RunContext` — *Contexte injecté à chaque `run()`*
Composé par l'orchestrateur :

| Champ | Description |
|---|---|
| `instanceId`, `stepId`, `stepExecId` | Identités (cf. § 4). |
| `step` (`StepDef`) | La case en cours. |
| `inputs` | Artefacts résolus, prêts à l'emploi (`{kind, content}`). |
| `loopHistory` | Tentatives précédentes + feedback humain (réinjectées dans le prompt). |
| `deps` | Ports outbound autorisés (LLM, store, skills, run-log, clock, ids, bus de chunks). |

### `StepOutcome` — *Ce que retourne un runner*

```ts
| { kind: "produced"; artifact: Artifact; runs?: RunId[] }
| { kind: "awaiting-human"; actorRole: string }
```

L'orchestrateur traduit l'outcome en event (`StepProducedArtifact` ou
`StepAwaitingHumanGate`) puis avance ou se met en pause.

### `StepRunnerRegistry`
Map `StepKindId → StepRunner`. Enregistrement idempotent (le dernier gagne).
Mis en place à la composition root ([composition-root.ts](composition-root.ts)).

---

### `ContextAssembler` — *Construction pure du prompt LLM*
Fichier : [application/services/context-assembler.ts](application/services/context-assembler.ts)

Fonction pure qui produit `{ systemPrompt, userPrompt, hash }` à partir du
Skill, des inputs et de l'historique de boucle. Mêmes entrées ⇒ même
sortie ⇒ même `hash` (SHA-256 de `system + " " + user`). Ce hash est
réutilisé dans le `RunRecord.promptHash` pour cache et corrélation.

---

## 6. Frontière externe (ports outbound)

L'archi hexagonale isole le domaine derrière des **ports**. Le runner
`claude_code.invoke` ne sait pas que le LLM est Anthropic ou que les artefacts sont
sur disque ; il parle aux ports.

| Port | Rôle | Adapter |
|---|---|---|
| `ArtifactStore` | Stocke et relit les artefacts (content-addressed). | SQLite + filesystem. |
| `LLMGateway` | Invoque un LLM en streaming, renvoie `output + métriques`. | Anthropic SDK. |
| `SkillRegistry` | Résout un `SkillRef` en `Skill`. | SQLite ou seeds. |
| `RunLog` | Persiste les `RunRecord`. | Table SQLite `wf_runs`. |
| `EventLog` | Append-only des `DomainEvent`. | Table SQLite. |
| `EventBus` | Publication in-memory des events. | Émitteur Node. |
| `LlmChunkBus` | Stream des deltas LLM vers l'UI. | IPC main → renderer. |
| `TemplateRegistry` | CRUD des `WorkflowTemplate`. | SQLite + seeds. |
| `ClockPort` | `now()` (déterministe en test). | `Date.now()` en prod. |
| `IdGenerator` | `newId()`. | `crypto.randomUUID()` en prod. |

---

## 7. Cas d'usage (use-cases inbound)

Commandes externes qui font entrer des intentions dans le système. Chacune
finit par appender un ou plusieurs events.

| Use-case | Effet | Event(s) émis |
|---|---|---|
| `StartInstance` | Lance un nouveau workflow à partir d'un template + seeds. | `InstanceStarted` |
| `SubmitHumanDecision` | Approuve ou rejette une exécution `awaitingHuman`. | `StepValidated` ou `LoopOpened` |
| `OpenFeedbackLoop` | Force un retour en arrière sur un step amont. | `LoopOpened` |

L'orchestrateur ([application/orchestrator/instance-orchestrator.ts](application/orchestrator/instance-orchestrator.ts))
réagit aux events publiés et émet à son tour `StepStarted`,
`StepProducedArtifact`, `StepFailed`, `LoopClosed`, `InstanceCompleted`.

---

## 8. Lecture rapide d'un run

Pour un run de `feature-from-spec@v1` avec une boucle de feedback :

```
InstanceStarted(wf_abc, template=feature-from-spec@v1, seed=[art_seed])
  └─ projection: seedArtifacts = [art_seed], status = running

StepStarted(wf_abc, se_001, capture-spec)
StepProducedArtifact(se_001, art_spec)
StepValidated(se_001, by="auto")          ← non-gated → auto
  └─ projection: executions += {id:se_001, stepId:capture-spec, validated, output:art_spec}

StepStarted(wf_abc, se_002, generate-patch, inputs:[art_spec])
  → runner claude_code.invoke
    → RunRecord(run_A, model, promptHash, tokens…)
StepProducedArtifact(se_002, art_patch_v1)
StepValidated(se_002, by="auto")

StepStarted(wf_abc, se_003, validate-patch)
  → runner human.gate
StepAwaitingHumanGate(se_003, role=Developer)
  └─ projection: status = awaitingHuman

LoopOpened(loop_1, from=se_003, to=generate-patch, reason="use async/await")
  └─ projection: se_003.status = looped

StepStarted(wf_abc, se_004, generate-patch, inputs:[art_spec], loopFrom=se_003)
  → runner claude_code.invoke (cette fois loopHistory non-vide)
    → RunRecord(run_B, …)
StepProducedArtifact(se_004, art_patch_v2)
StepValidated(se_004, by="auto")
LoopClosed(loop_1)

StepStarted(wf_abc, se_005, validate-patch)
StepAwaitingHumanGate(se_005, role=Developer)
  ── humain approuve ──
StepValidated(se_005, by="user@example.com")
InstanceCompleted(wf_abc, finalArtifact=art_patch_v2)
```

À tout moment de la séquence, l'état complet est reconstructible en rejouant
les events depuis le début.
