# Analyse du système de typage / schema / kind — forces & frictions UX

> Revue de design du système de types d'artifacts de CtxFirst, côté moteur et côté éditeur de templates. Objectif : distinguer ce qui est puissant de ce qui peut freiner l'adoption.

## Vue d'ensemble du système

Le projet implémente un **système de types structurel, versionné et covariant** par-dessus un graphe de dataflow. Le cœur tient en quelques pièces :

- `ArtifactKind` — une union ouverte encodée en **string** : built-ins (`String`, `Markdown`, `Json`…), kinds utilisateur (`user:x@v1`), plugin (`plugin:linear:issue@v1`), et des **constructeurs paramétriques** (`List<T>`, `OneOf<A,B>`, `Success<T>`, `Error<E>`, `record:<hash>`) — [artifact.ts:35](../apps/desktop/electron/main/wf/domain/artifact.ts#L35)
- `ArtifactKindDescriptor` — le descripteur unifié avec schéma Zod compilé, JSON Schema, `extends` (refinement) et `structuralHash` — [artifact-schema.ts:46](../apps/desktop/electron/main/wf/domain/artifact-schema.ts#L46)
- `portAccepts` / `transitionTypable` — la relation de sous-typage partagée main↔renderer — [port-accepts.ts:112](../apps/desktop/shared/wf/port-accepts.ts#L112)
- `NodeSpec` / `resolveSpec` — la signature typée de chaque step, résolue dynamiquement depuis la config — [step-runner.ts:230](../apps/desktop/electron/main/wf/application/step-runner.ts#L230)

---

## Ce qui est bien / puissant

**1. Le sous-typage structurel + content-addressing est rare et élégant.**
Le `structuralHash` (règle 6 de `portAccepts`) fait que deux records de schéma identique sont interchangeables *peu importe leur id/version/source*. Ça résout silencieusement le problème classique des systèmes nominaux : un `user:order@v1` et un `plugin:shopify:order@v1` de même forme se branchent l'un sur l'autre sans cast. C'est une décision de design forte et juste.

**2. La covariance bien pensée.** `List<X> ⊆ List<Y>` ssi `X ⊆ Y`, plus la covariance par refinement via `extends`, plus l'élargissement de sommes (`A → OneOf<A,B>` autorisé, l'inverse refusé car il faut un `branch.match`). C'est la *bonne* direction d'asymétrie — élargissement sûr autorisé, narrowing forcé explicite. Peu de no-code tools ont une théorie de types aussi cohérente.

**3. `resolveSpec` dynamique = polymorphisme propre.** La signature d'un step est *calculée* depuis `config.outputKind` ou depuis `template.variables` (plutôt que figée), ce qui permet à un `claude_code.invoke` d'être typé sans dupliquer 12 runners. Et le même code de validation tourne au runtime (orchestrateur) et dans l'éditeur — une seule source de vérité pour « ça branche ou pas ».

**4. Garde-fous anti-divergence.** Wildcard `*` sur les entrées LLM, `passthrough` pour les nœuds side-effect, `MAX_KIND_DEPTH`/`MAX_SUM_VARIANTS` qui bornent la grammaire, le `seen` set qui protège `portAccepts` contre un registre corrompu. Le système est défensif aux bons endroits.

**5. Modèle d'extensibilité cohérent.** Plugins, kinds user, et built-ins passent tous par le *même* `ArtifactKindDescriptor` et le même registre. Pas de chemin privilégié. Bon pour la maintenabilité long-terme.

---

## Ce qui peut freiner l'adoption (UX)

Classé par sévérité décroissante.

### 🔴 1. Créer un kind = écrire du JSON Schema à la main
[ArtifactSchemaEditor.tsx](../apps/desktop/src/ui/features/artifact-schemas/ArtifactSchemaEditor.tsx) impose `id`, `version`, `name` **et** un `simplifiedSchema` JSON tapé à la main. Pas de form-builder (« ajouter un champ : nom + type »). Pour un utilisateur non-dev, JSON Schema est un mur. C'est *le* point de friction n°1 : le système de types est plus exigeant à l'entrée que la plupart des outils que les utilisateurs connaissent (Zapier/n8n typent rarement, Airtable a un form-builder).
**Risque concret :** les gens vont tout mettre en `Markdown`/`Json` pour éviter l'éditeur, et la théorie de types ne sert plus à rien.

### 🔴 2. Les types paramétriques ne sont pas constructibles en UI (sauf `List`)
Le picker de variable offre un `<Select>` scalaire + une checkbox `isList` ([VariableEditorModal.tsx](../apps/desktop/src/ui/features/templates/VariableEditorModal.tsx)). Mais `OneOf<A,B>`, `Success<T>`, `Error<E>` doivent être **tapés en raw string** ou passés par MCP. Or ce sont exactement les types qui modélisent le réel (un appel réseau réussit ou échoue). Une algèbre de types riche dont ~60 % est inaccessible à la souris. Soit la rendre constructible, soit assumer qu'elle est réservée aux power-users/MCP et le documenter.

### 🟠 3. Les erreurs de type sont invisibles, pas expliquées
Quand deux ports sont incompatibles, le nœud **n'apparaît tout simplement pas** dans les suggestions de drop ([EdgeDropSuggestions.tsx](../apps/desktop/src/ui/components/templates/EdgeDropSuggestions.tsx)), et les dropdowns de wiring sont pré-filtrés. Côté « on ne peut pas faire d'erreur », c'est bien. Côté **apprentissage**, c'est un piège : l'utilisateur ne comprend pas *pourquoi* le nœud qu'il cherche n'est pas là. Pas de message « `Markdown` ne se branche pas sur un port `Json` — insère un step de conversion ». L'absence silencieuse est pire qu'une erreur claire pour la courbe d'adoption. Les `StepKindSuggestion` (`suggestedFor`) sont la brique parfaite pour transformer ces dead-ends en code-actions « insérer un convertisseur » — mais ce n'est branché que sur plugins, pas sur les mismatches de type.

### 🟠 4. `extends` (refinement) n'a aucune UI
Le commentaire l'admet dans [ArtifactSchemaEditor.tsx](../apps/desktop/src/ui/features/artifact-schemas/ArtifactSchemaEditor.tsx) (« refinement editing is §2 follow-up »). Une des règles de covariance les plus puissantes (règle 5 de `portAccepts`) ne peut être exploitée que via MCP. La hiérarchie de refinement existe dans le moteur mais reste un concept fantôme pour l'utilisateur du GUI : de la puissance payée (complexité du code) mais pas encaissée (valeur user).

### 🟡 5. Charge cognitive : id + version + name + structuralHash + extends
L'utilisateur doit comprendre la différence entre `id` (immuable), `version`, `name` (affiché), `structuralHash` (chip `record:…` qui bouge tout seul). Beaucoup de concepts pour « je veux décrire une commande Shopify ». Le `structuralHash` affiché est utile aux experts mais peut inquiéter un débutant (« c'est quoi ce hash, dois-je m'en occuper ? »). À cacher derrière un disclosure « avancé ».

### 🟡 6. Le versionnage immuable peut piéger
`id` et `version` sont figés après save. Bon pour la stabilité, mais si quelqu'un se trompe d'un champ il doit créer `@v2` et re-câbler. Sans UX de migration/duplication (« dériver une v2 »), le versionnage devient une corvée plutôt qu'une sécurité.

---

## Synthèse / priorités

| # | Friction | Effort | Impact adoption |
|---|----------|--------|-----------------|
| 1 | Form-builder de schéma (champ→type) en complément du JSON brut | Moyen | **Très élevé** |
| 3 | Messages d'erreur de type explicites + code-action « insérer un convertisseur » | Faible-Moyen | **Élevé** |
| 2 | Builder UI pour `OneOf`/`Success`/`Error` (ou doc explicite « power-user ») | Moyen | Élevé |
| 4 | UI pour `extends` (sinon retirer la promesse côté GUI) | Moyen | Moyen |
| 5 | Cacher `structuralHash`/`version` derrière « options avancées » | Faible | Moyen |
| 6 | « Dériver une nouvelle version » depuis un kind existant | Faible | Moyen |

**Diagnostic en une phrase :** le moteur de types est plus mature et plus correct que son interface ne le laisse exploiter. Tout l'écart d'adoption se joue sur le **chemin d'entrée** (créer un kind = JSON à la main) et la **pédagogie de l'échec** (incompatibilités silencieuses). La théorie de types est un atout — mais aujourd'hui elle taxe l'utilisateur (concepts, JSON) avant de le récompenser. Tant que créer un type coûte plus cher que tricher avec `Markdown`/`Json`, les gens tricheront.
