# Spec — Node `select.markdown` : injection conditionnelle d'un fragment Markdown (sans diamant de branch)

> Statut : à valider · Cible : `apps/desktop` (moteur wf + studio) · Origine : simplification du template `plan-implement@v1`.

## Context / Objectif

Le moteur ne sait faire de l'**injection conditionnelle** d'un fragment dans un prompt que via un **diamant `branch.json`** : router `true`/`false`, charger le contexte sur la branche `true`, puis **reconverger** sur le nœud aval. Or la reconvergence est coûteuse à modéliser à cause de deux contraintes du moteur :

1. **Fan-in mono-port = throw au runtime** (`port "<p>" got <n> edges; isList=false`, [instance-orchestrator.ts](../apps/desktop/electron/main/wf/application/orchestrator/instance-orchestrator.ts) ~l.438). Pour reconverger un diamant, les deux branches doivent atterrir sur des **ports distincts** du nœud aval.
2. **`validateBranchKindOrphans`** : *tout* port d'un `branch.*` doit avoir une arête sortante → la branche `false` doit pointer quelque part même quand elle n'apporte aucune donnée.

Résultat dans `plan-implement@v1` (cf. son sous-graphe design-system) : `branch.json(besoin_design_system)` → `true` charge le DS, `false` est un **fil de contrôle pur** vers un autre port, et `concat.markdown` aval lit ses vraies valeurs via `readsFrom` (la variable l'emporte sur l'arête) pendant que les ports ne servent que de déclencheurs. C'est correct mais **illisible** : le schéma a une double-sortie, une reconvergence sur deux ports, et un usage de `readsFrom` comme neutraliseur de passthrough — trois mécanismes qui n'existent que pour contourner les contraintes ci-dessus.

User story : *« Je veux injecter un fragment Markdown dans un prompt **seulement si** un flag du lot courant est vrai, sans dessiner un diamant de branch ni reconverger sur deux ports. »*

**Stratégie courte** : créer un step kind **passe-plat mono-sortie** `select.markdown` qui lit un booléen (JSONPath) dans une entrée `cond` et **produit toujours** sur un unique port `out` — le body de l'entrée `value` si le flag est vrai, sinon du Markdown vide. Comme il produit toujours (`kind: "produced"`, jamais `produced-on-port`), il n'y a **aucun port mort, aucun fan-in à reconverger, aucun diamant**. Le sous-graphe conditionnel redevient une épine dorsale linéaire.

## Goals

1. Un nouveau step kind `select.markdown` apparaît dans le picker, famille `transform`, catégorie `control`.
2. Signature **statique** : deux entrées — `cond` (`*`, primary) et `value` (`Markdown`, optionnelle) — et **une** sortie `out` (`Markdown`, primary).
3. Config `{ path: string }` = JSONPath d'un **scalaire booléen** dans `cond` (mirror de `branch.json.config.path`).
4. À l'exécution :
   - parse `cond` en JSON, évalue `path`, coerce le scalaire en booléen (cf. § Truthiness) ;
   - **vrai** → émet un artefact `Markdown` dont le body = body de `value` (ou vide si `value` non câblée) ;
   - **faux** → émet un artefact `Markdown` **vide** (`body: ""`).
5. **Toujours** `produced` sur `out`. Jamais de port mort, jamais de skip en cascade. → aucune contrainte de reconvergence en aval.
6. Sûr en boucle : ne commence pas par `branch.` → passe `inferIterationScopes` sans déclencher `loop-branch-in-scope`. C'est la primitive « fragment optionnel piloté par un flag du lot courant » utilisable directement dans un `loop.foreach`.
7. ~~Le renderer obtient sa signature **gratuitement** via `wf:listNodeSpecs` (dérivé du runner enregistré) — aucun `case` à ajouter dans `resolve-node-spec.ts`.~~ **Correction (impl.)** : faux. `listNodeSpecs` appelle `resolveSpec({})` (config vide) ; comme `select.markdown.resolveSpec` throw sans `config.path`, le moteur retombe sur un fallback permissif `input?`/`out`. Le renderer dessine donc des ports génériques tant qu'un `case "select.markdown"` n'override pas `base` avec les ports statiques `cond`/`value`/`out` dans [resolve-node-spec.ts](../apps/desktop/shared/wf/resolve-node-spec.ts). Ce `case` est **requis** (ports statiques, indépendants de la config — contrairement aux `branch.*` qui dépendent de `cases`).

## Non-goals (volontairement exclus)

- **Pas de routage** : `select.markdown` n'est pas un `branch.*`. Il ne crée pas de ports nommés dynamiques, ne tue aucune branche. Pour router le flux de contrôle, utiliser `branch.json`.
- **Pas de N valeurs / N conditions** : un seul flag, un seul fragment. Pour choisir parmi plusieurs fragments, chaîner plusieurs `select.markdown` ou utiliser un `branch.match` en amont.
- **Pas de coercion de kinds non-Markdown en sortie** : la sortie est toujours `Markdown`. Si `value` est un `Json`, son `body` (chaîne) est injecté tel quel (cohérent avec `concat.markdown` qui accepte `Markdown|Json` sur ses fragments et émet du Markdown).
- **Pas de transformation du fragment** : passe-plat strict. Pour transformer, chaîner un `transform.run`/`concat.markdown`.
- **Pas de truthiness « JS-loose »** sur objets/tableaux : `path` doit pointer un **scalaire** (cf. § Truthiness) ; un match objet/tableau → `StepFailed` (comme `branch.json.coerceVerdict`).
- **Pas de preview live** dans l'inspector (v1) : champ texte simple pour `path`, vérification au runtime via le studio.

## Format / Données / Modèle

### Config

```ts
type SelectMarkdownConfig = {
  path: string; // JSONPath non vide vers un scalaire booléen dans `cond`
};
```

`buildDefaultConfig: () => ({ path: "$.flag" })` (mirror de `branch.json`, [step-kinds.ts](../apps/desktop/src/ui/components/templates/step-kinds.ts#L265-L279)).

### Ports (spec statique)

```ts
inputs:  [
  { name: "cond",  kinds: ["*"], primary: true },        // l'artifact portant le flag (ex. firstLot Json)
  { name: "value", kinds: ["Markdown", "Json"], optional: true }, // le fragment à injecter
]
outputs: [
  { name: "out", kind: "Markdown", primary: true },      // value-si-vrai | "" sinon
]
```

`value` accepte `Markdown|Json` (mêmes kinds que les fragments de `concat.markdown`) pour pouvoir injecter aussi bien un contexte Markdown qu'un sous-objet JSON sérialisé.

### Truthiness (mirror de `branch-json.ts` `coerceVerdict`, [branch-json.ts#L100-L109](../apps/desktop/electron/main/wf/plugins/branch-json.ts#L100-L109))

Le scalaire matché par `path` est coercé puis testé :

| Valeur matchée | Résultat |
| --- | --- |
| `true` (boolean) / `"true"` (string) | **vrai** |
| `false` / `"false"` / `null` | faux |
| number `0` | faux ; tout autre number → vrai |
| string vide `""` | faux ; toute autre string ≠ `"false"` → vrai |
| objet / tableau | `StepFailed` (`path matched a non-scalar value`) |
| `path` matche 0 ou >1 valeurs | `StepFailed` (comme branch.json, exige exactement 1 match) |

> Décision : truthiness **stricte sur le cas booléen attendu** (`true`/`false`/`"true"`/`"false"`), avec un fallback raisonnable pour number/string afin d'éviter les surprises. Documenter ce tableau dans la description du nœud.

### Outcome runtime

Toujours `{ kind: "produced", artifact }` ([step-runner.ts#L154-L159](../apps/desktop/electron/main/wf/application/step-runner.ts#L154-L159)) sur le port `out`. Jamais `produced-on-port`. Pas de `runs` (pas de LLM).

L'artefact `Markdown` est créé via le même chemin que les autres producteurs de Markdown (`serializeFromString("Markdown", body)` + `putArtifactPayload`, cf. [claude-code-invoke.ts#L114-L115](../apps/desktop/electron/main/wf/plugins/claude-code-invoke.ts#L114-L115)). Body vide = `""`.

## Architecture / câblage

`base` côté renderer vient de `window.api.wf.listNodeSpecs()` ([electron-workflow-gateway.ts#L62](../apps/desktop/src/infrastructure/electron/electron-workflow-gateway.ts#L62)), lui-même dérivé des runners enregistrés. Donc **enregistrer le runner suffit** à propager la signature au canvas / inspector / validateur de ports. Touchpoints :

### 1. Runner `select.markdown`

Créer [apps/desktop/electron/main/wf/plugins/select-markdown.ts](../apps/desktop/electron/main/wf/plugins/select-markdown.ts), calqué sur `branch-json.ts` (lecture JSONPath) + `concat-markdown.ts` (lecture d'inputs nommés + production Markdown).

```ts
/**
 * Runner du step kind "select.markdown".
 *
 * Injection conditionnelle d'un fragment Markdown. Lit un scalaire booléen via
 * JSONPath (`config.path`) dans l'entrée `cond` ; émet sur l'unique port `out`
 * le body de l'entrée `value` si le flag est vrai, sinon du Markdown vide.
 *
 * TOUJOURS `produced` (jamais de port mort) : aucun fan-in à reconverger en
 * aval, contrairement à un diamant `branch.json`. Déterministe, sans LLM.
 */
import { JSONPath } from "jsonpath-plus";
import { putArtifactPayload } from "../application/artifact-io";
import { serializeFromString } from "../domain/artifact-serializer";
import type { NodeSpec, StepOutcome, StepRunner } from "../application/step-runner";

const readPath = (config: Readonly<Record<string, unknown>>): string => {
  const raw = config["path"];
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error(
      "select.markdown requires `config.path: string` (a non-empty JSONPath into the `cond` JSON)",
    );
  }
  return raw;
};

// Mirror branch-json.ts stripCodeFence + coerce, mais retourne un booléen.
const coerceTruthy = (value: unknown, path: string): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (value === null) return false;
  if (typeof value === "string") return value !== "" && value !== "false";
  throw new Error(`select.markdown: path "${path}" matched a non-scalar value`);
};

const bodyOf = (input: { payload: unknown; content: string }): string => {
  const p = input.payload as { body?: unknown } | null;
  return p && typeof p.body === "string" ? p.body : input.content;
};

export const createSelectMarkdownRunner = (): StepRunner => ({
  kind: "select.markdown",

  resolveSpec({ config }): NodeSpec {
    readPath(config);
    return {
      title: "Select (Markdown)",
      description:
        "Injecte le fragment `value` si le flag JSONPath de `cond` est vrai, sinon du Markdown vide. Toujours produit (pas de branchement).",
      inputs: [
        { name: "cond", kinds: ["*"], primary: true },
        { name: "value", kinds: ["Markdown", "Json"], optional: true },
      ],
      outputs: [{ name: "out", kind: "Markdown", primary: true }],
    };
  },

  async run(ctx): Promise<StepOutcome> {
    const path = readPath(ctx.step.config);
    const cond = ctx.inputs.find((i) => i.port === "cond") ?? ctx.inputs[0];
    if (!cond) throw new Error("select.markdown: missing artifact on input port `cond`");

    let data: unknown;
    try {
      data = JSON.parse(bodyOf(cond));
    } catch (err) {
      throw new Error(
        `select.markdown: cond input is not valid JSON (${(err as Error).message})`,
      );
    }

    const matches = JSONPath<unknown[]>({ path, json: data as object, wrap: true });
    if (matches.length !== 1) {
      throw new Error(
        `select.markdown: path "${path}" matched ${matches.length} values (expected exactly 1)`,
      );
    }
    const truthy = coerceTruthy(matches[0], path);

    const value = ctx.inputs.find((i) => i.port === "value");
    const body = truthy && value ? bodyOf(value) : "";

    const payload = serializeFromString("Markdown", body);
    const artifact = await putArtifactPayload(ctx.deps.artifactStore, "Markdown", payload, {
      source: "select.markdown",
      condPath: path,
      injected: String(truthy && !!value),
    });
    return { kind: "produced", artifact };
  },
});
```

Points :
- Lecture des inputs nommés via `ctx.inputs.find((i) => i.port === "...")` — pattern de [concat-markdown.ts#L46](../apps/desktop/electron/main/wf/plugins/concat-markdown.ts#L46).
- `value` absente + flag vrai → body vide (dégradé gracieux, pas d'erreur). Choix : ne pas exiger `value` pour rester utilisable comme « garde » seule.
- Réutiliser `stripCodeFence` de `branch-json.ts` si on veut tolérer un `cond` fencé (sortie `shell.exec`). À factoriser dans un util partagé ou copier le helper (3 lignes) — la duplication existe déjà entre `branch.json` et `json.transform`.

### 2. Enregistrement dans le composition root

[composition-root.ts](../apps/desktop/electron/main/wf/composition-root.ts) — import ~l.122 (à côté de `createBranchJsonRunner`) et `runners.register(createSelectMarkdownRunner());` ~l.500-523 (à côté de `runners.register(createBranchJsonRunner());`). Pas de dépendance injectée (import direct `jsonpath-plus`, déjà au workspace).

### 3. Catalogue UI (picker)

[step-kinds.ts](../apps/desktop/src/ui/components/templates/step-kinds.ts) — ajouter dans `STEP_KIND_CATALOG`, à côté de `branch.json` (l.265-279) :

```ts
{
  id: "select.markdown",
  label: "Select (Markdown)",
  description:
    "Injecte un fragment Markdown si un flag JSONPath est vrai, sinon rien. Passe-plat, jamais de branchement — remplace un diamant branch.json d'injection conditionnelle.",
  defaultActor: "Developer",
  defaultHumanGateRequired: false,
  icon: ToggleRight, // ou SquareAsterisk — lucide, vérifier l'import dispo dans le fichier
  family: "transform",
  category: "control",
  buildDefaultConfig: () => ({ path: "$.flag" }),
},
```

`polymorphismOf` ([step-kinds.ts#L704-L720](../apps/desktop/src/ui/components/templates/step-kinds.ts#L704-L720)) : **ne rien ajouter** (comme `branch.json`, retourne `null` — pas de discriminateur scalaire `outputKind`/`inputKind`).

### 4. Inspector — éditeur de config `path`

[StepInspector.tsx](../apps/desktop/src/ui/components/templates/StepInspector.tsx) :

- **(a)** Ajouter `"select.markdown"` à `KINDS_WITH_CONFIG` (l.59-85).
- **(b)** Bloc de dispatch (à côté de `branch.json`, l.1150) :
  ```tsx
  {step.kind === "select.markdown" ? (
    <SelectMarkdownConfigEditor config={config} setConfig={setConfig} />
  ) : null}
  ```
- **(c)** Composant `SelectMarkdownConfigEditor`, calqué sur `BranchJsonConfigEditor` (l.2366-2407) mais **sans** `BranchCasesEditor` (un seul champ `path`) :
  ```tsx
  const SelectMarkdownConfigEditor = ({ config, setConfig }: Props) => {
    const t = useT();
    const path = (config["path"] as string | undefined) ?? "";
    return (
      <FormField
        label={t("template.stepInspector.selectMarkdown.path.label")}
        description={t("template.stepInspector.selectMarkdown.path.description")}
      >
        <Input
          className="font-mono text-xs"
          placeholder="$.flag"
          value={path}
          onChange={(e) => setConfig({ path: e.target.value })}
        />
      </FormField>
    );
  };
  ```

### 5. i18n

Ajouter dans [fr.json](../apps/desktop/src/ui/i18n/messages/fr.json) / [en.json](../apps/desktop/src/ui/i18n/messages/en.json) :
- `template.stepInspector.selectMarkdown.path.label` → fr « Champ booléen (JSONPath) » / en « Boolean field (JSONPath) ».
- `template.stepInspector.selectMarkdown.path.description` → fr « Le fragment `value` n'est injecté que si ce chemin vaut vrai. » / en « The `value` fragment is injected only when this path is truthy. »

### 6. Catalogue MCP — automatique

`wf:listNodeSpecs` ([wf.ts](../apps/desktop/electron/main/ipc/wf.ts)) dérive des runners enregistrés → `select.markdown` apparaît dans `ctxfirst_list_node_specs` dès §2, sans modification.

## Test plan

Unitaires — `apps/desktop/electron/main/wf/plugins/select-markdown.test.ts`, calqué sur [branch-json.test.ts](../apps/desktop/electron/main/wf/plugins/branch-json.test.ts) (stub `ArtifactStore`, `buildCtx`, factory d'input `cond`/`value`) :

- flag `true` + `value` câblée → `out.body === value.body` ; outcome `kind === "produced"`.
- flag `false` + `value` câblée → `out.body === ""`.
- flag `true` + `value` absente → `out.body === ""` (pas d'erreur).
- `path` matche `"true"`/`"false"`/`0`/`1`/`""`/`"x"` → table de truthiness ci-dessus.
- `path` matche un objet → `StepFailed` (`non-scalar`).
- `path` matche 0 ou 2 valeurs → `StepFailed`.
- `cond` non-JSON → `StepFailed`.
- `config.path` vide/absent → throw `resolveSpec`.
- `cond` fencé (```` ```json … ``` ````) → toléré si on copie `stripCodeFence`.

Manuel (`yarn dev`) :
- Picker : « Select (Markdown) » présent en catégorie *Control*, insérable, 2 entrées (`cond`, `value`) + 1 sortie (`out`), pas d'erreur de validation à l'insertion.
- Câbler `cond` ← un `Json`, `value` ← un `concat.markdown` Markdown, éditer `path` dans l'inspector. Run avec flag vrai puis faux ; vérifier le body de `out`.
- Studio : itérer sur `path` avec différents `cond` sans relancer un workflow entier.

Compile-time : `yarn workspace @ctxfirst/desktop typecheck` + `yarn lint`.

## Risques / Nuances

- **Fragment vide ⇒ wrapper vide en aval.** Quand le flag est faux, `out` = Markdown vide. Si l'aval est un `concat.markdown` avec un `entries[port].header/footer` (ex. `<design_system>`), le wrapper est **quand même** appliqué autour du vide → `<design_system></design_system>` dans le prompt. Aujourd'hui `concat.markdown` ne skippe que les ports **sans arête** (`if (!input) continue;`, [concat-markdown.ts#L160](../apps/desktop/electron/main/wf/plugins/concat-markdown.ts#L160)), pas les bodies vides.
  - **Mitigation recommandée (petit changement compagnon)** : étendre la condition de skip à `if (!input || bodyOf(input).length === 0) continue;` dans `concat.markdown` mode `concat`. Effet : un fragment vide n'émet ni contenu ni header/footer. Bénéfice général (pas seulement ici). À couvrir par un test `concat-markdown.test.ts` (« port câblé mais body vide → omis »). **Décision à prendre** : faire ce changement, ou accepter les balises vides (le LLM les tolère).
- **Coût d'évaluation eager.** `select.markdown` ne décide pas s'il faut *charger* `value` : l'amont qui produit `value` (ex. `files.load` DS + `concat`) s'exécute **toujours**, même flag faux — contrairement au diamant `branch.json` qui skippait la branche. Ici, lectures de fichiers locaux → négligeable. Si un jour `value` est coûteuse (appel réseau, LLM), préférer un vrai `branch.json`. Documenter ce trade-off dans la description du nœud.
- **`jsonpath-plus` sandbox.** Comme `branch.json`/`json.transform`, ne jamais passer `sandbox: false`. Tester qu'une expression piégée (`?(@.x > process.exit())`) échoue proprement sans crasher le main.
- **Truthiness implicite.** Le fallback number/string peut surprendre. Mitigation : documenter le tableau dans la description + recommander que `path` pointe un vrai booléen.

## Hors périmètre / changements compagnons (specs séparées si retenus)

Ces deux changements faisaient partie de la simplification de `plan-implement@v1` mais sont **indépendants** de ce node :

1. **`config.skillRef` sur `claude_code.invoke`** (mirror de `openrouter.invoke`, [openrouter-invoke.ts#L88-L108](../apps/desktop/electron/main/wf/plugins/openrouter-invoke.ts#L88-L108)) : injecter le body d'une skill comme **system prompt** (le slot `systemPrompt` de `assemble` est aujourd'hui toujours vide, [claude-code-invoke.ts#L98](../apps/desktop/electron/main/wf/plugins/claude-code-invoke.ts#L98)). Supprime les paires `skill.loader → concat.markdown` (−2 à −3 steps). À spécifier à part.
2. **Skip des fragments à body vide dans `concat.markdown`** — cf. § Risques ci-dessus.

### Récriture cible de `plan-implement@v1`

Une fois `select.markdown` (+ skillRef) en place, le sous-graphe DS passe d'un diamant à une épine dorsale linéaire :

```
… json.transform(firstLot)
files.load(DS composer+registry) → concat-ds → designSystemContext (var)
select.markdown(cond=firstLot, path=$[0].besoin_design_system, value=designSystemContext) → dsFragment
concat.markdown(main=spec, lot, dsFragment) → workspace.set → claude_code.invoke(skillRef=agent-lot)
```

Plus de `branch.json`, plus de double-sortie sur `json.transform`, plus de reconvergence sur deux ports, plus de `readsFrom`-neutraliseur. Cible : **13 → ~10 steps**, **17 → ~11 transitions**, **une seule divergence en moins** (zéro diamant).
