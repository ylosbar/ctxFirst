# Spec — Node `gitlab.files.fetch` (« GitLab Files Fetch »)

> Statut : validée (décisions figées §15) · Cible : `apps/desktop` (workflow engine + studio) · Auteur : (à compléter)

## 1. Objectif

Récupérer **plusieurs fichiers** d'un dépôt GitLab via l'API REST (`/api/v4`),
sans cloner le repo. Le node est le **pendant distant de `files.load`** :

- `files.load` lit N fichiers sous un **répertoire de base local** (`path.resolve(base, subpath)`).
- `gitlab.files.fetch` lit N fichiers sous un **préfixe de dépôt** (`basePath`),
  chaque fichier étant exprimé en **chemin relatif** (`subpath`) joint à ce `basePath`.

Chaque fichier est exposé sur **son propre port de sortie nommé**, typé `Markdown`
ou `Json` (kinds text-envelope), via un outcome `produced-many` — exactement comme
`files.load`.

Cas d'usage : charger d'un coup `docs/spec.md`, `docs/api.json`, `CLAUDE.md`… d'un
repo GitLab (réf épinglée) pour alimenter un agent en aval, sans étape `git.clone`
ni `workspace.set`.

## 2. Identité

| Élément | Valeur |
| --- | --- |
| Step kind | `gitlab.files.fetch` |
| Fichier runner | `apps/desktop/electron/main/wf/plugins/gitlab-files-fetch.ts` |
| Factory | `createGitlabFilesFetchRunner(deps: GitLabApiDeps)` |
| Label (FR) | « GitLab : récupérer des fichiers » |
| Famille / catégorie | `system` / `system` (comme les autres `gitlab.*`) |
| Icône (lucide) | `FileDown` ou `CloudDownload` (cohérent avec `FolderDown` de `files.load`) |
| Helpers réutilisés | `gitlab-api.ts` (`gitlabRequest`, `resolveGitLabToken`, `normalizeBaseUrl`, `encodeProjectId`), `file-load.ts` (cœur de stockage, voir §6) |

## 3. Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | `in` | `Json`, `*` | **Optionnel**, non consommé. Enveloppe JSON pouvant fournir dynamiquement `project` / `ref` / `basePath` (l'input l'emporte sur la config — même logique que `gitlab.mr.create`). |
| Output | `<slot.port>` | `Markdown` \| `Json` | Un port **par slot**, dans l'ordre de déclaration ; le premier est `primary`. `description = "<filePath joint> → <outputKind>"`. |

Tant qu'aucun slot valide n'est déclaré, `resolveSpec` renvoie une signature
**permissive** (`outputs: []`) — comme `files.load` / `file.load` / `webhook.call`.

## 4. Configuration

| Clé | Type | Défaut | Description |
| --- | --- | --- | --- |
| `project` | `string` | — | Id numérique **ou** chemin `group/project`. **Requis** (config ou input `in.project`). |
| `ref` | `string` | branche par défaut du repo | Branche / tag / SHA. Optionnel (config ou input `in.ref`). Vide ⇒ paramètre `ref` omis, GitLab utilise la branche par défaut. **Recommandé d'épingler** pour la reproductibilité. |
| `baseUrl` | `string` | `https://gitlab.com` | Instance GitLab (sans slash final, via `normalizeBaseUrl`). |
| `basePath` | `string` | `""` (racine du repo) | Préfixe **relatif au dépôt** (POSIX). Sert de base au listing : chaque `subpath` de slot lui est joint. Normalisé (pas de slash initial, `.`/`..` réduits). |
| `slots` | `Array<{ port, subpath, outputKind }>` | `[{ port: "out", subpath: "", outputKind: "Markdown" }]` | ≥ 1 slot. Identique à `files.load`. |

### `slots[i]`

| Champ | Type | Règle |
| --- | --- | --- |
| `port` | `string` | Non vide, match `^[a-zA-Z_][a-zA-Z0-9_-]*$`, unique dans le node. |
| `subpath` | `string` | Non vide. Chemin **relatif au dépôt**, joint à `basePath`. Ne peut pas remonter au-dessus de `basePath` (anti-traversal `..`). |
| `outputKind` | `"Markdown" \| "Json"` | Kinds text-envelope uniquement (réutilise `isFileLoadKind`). |

`buildDefaultConfig` (step-kinds.ts) :

```ts
buildDefaultConfig: () => ({
  project: "",
  ref: "",
  baseUrl: "",
  basePath: "",
  slots: [{ port: "out", subpath: "", outputKind: "Markdown" }],
}),
```

## 5. Sémantique de chemin (⚠ différence majeure avec `files.load`)

Les chemins de dépôt sont **POSIX** (séparateur `/`), indépendants de l'OS hôte.
**Ne pas** utiliser `ctx.deps.path.resolve` / `path.sep` (sémantique système de
fichiers, backslashes sous Windows) — ce serait faux pour un chemin de repo.

Helper pur dédié, `joinRepoPath(basePath: string, subpath: string): string` :

1. Concatène `basePath` + `/` + `subpath`, split sur `/`.
2. Ignore les segments vides et `.`.
3. `..` dépile le dernier segment ; **erreur** si ça remonte au-dessus de la racine
   (i.e. au-dessus de la base ⇒ évasion refusée, comme le containment de `files.load`).
4. Rejoint avec `/`, **sans slash initial** (chemin relatif au repo).

Exemples (`basePath = "docs"`) :
- `subpath = "spec.md"` → `docs/spec.md`
- `subpath = "api/openapi.json"` → `docs/api/openapi.json`
- `subpath = "../README.md"` → **erreur** (sort de `basePath` — refusé, voir §11).
- `subpath = "../../etc"` → **erreur** (sort de `basePath` / racine repo).

Règle d'évasion (**décidée**) : tout `subpath` dont la jointure normalisée sort de
`basePath` est refusé, avant tout appel réseau. Cohérence stricte avec le containment
de `files.load`. Si `basePath` est vide, la base est la racine du repo.

Le `file_path` ainsi obtenu est **URL-encodé entièrement** via `encodeURIComponent`
(les `/` deviennent `%2F`, comme l'exige l'API GitLab).

## 6. Réutilisation — extraire `textToArtifact` de `file-load.ts`

`readFileToArtifact` (file-load.ts) fait : lecture fs → check vide → validation JSON
early-fail → `putArtifactPayload`. Les 3 dernières étapes sont indépendantes de la
source. Refactor proposé :

```ts
// file-load.ts
export const textToArtifact = async (
  ctx: RunContext,
  body: string,
  outputKind: FileLoadKind,
  source: string,
  meta: Record<string, string>,
): Promise<Artifact> => {
  if (body.length === 0) throw new Error(`${source}: file is empty`);
  if (outputKind === "Json") {
    try { JSON.parse(body); }
    catch { throw new Error(`${source}: file is not valid JSON`); }
  }
  const payload = { format: FILE_LOAD_FORMATS[outputKind], body } as ArtifactPayload<FileLoadKind>;
  return putArtifactPayload(ctx.deps.artifactStore, outputKind, payload, meta);
};
```

`readFileToArtifact` appelle ensuite `textToArtifact` après le `readTextFile` +
`assertAbsolute`. `gitlab.files.fetch` appelle `textToArtifact` directement avec le
corps récupéré en HTTP (méta `source`, `project`, `ref`, `filePath`, `byteLength`).

> Alternative : ne pas refactorer et dupliquer ~8 lignes. L'extraction est préférée
> (DRY, validation JSON identique entre local et distant).

## 7. API GitLab utilisée

Endpoint « raw file » :

```
GET {baseUrl}/api/v4/projects/{encProject}/repository/files/{encFilePath}/raw?ref={ref}
```

- `encProject = encodeProjectId(project)` (déjà dans gitlab-api.ts).
- `encFilePath = encodeURIComponent(joinRepoPath(basePath, subpath))`.
- `ref` : query param ; omis si vide (GitLab → branche par défaut).
- Auth : header `PRIVATE-TOKEN` (géré par `gitlabRequest`).
- Réponse : **corps brut** dans `res.text`. `res.ok` / `res.status` pour les erreurs.
  - `404` ⇒ erreur explicite : fichier introuvable (`filePath` + `ref`).
  - autre `!ok` ⇒ `HTTP {status}` + `res.text.slice(0, 300)`.

`gitlabRequest` est réutilisable tel quel : il pose `Accept: application/json` (ignoré
par l'endpoint `/raw`) et renvoie `text` = contenu brut. Pas de modification de
`gitlab-api.ts` nécessaire.

## 8. Comportement runtime

1. `readSlots(config)` — valide (≥ 1, ports/subpaths/outputKind) ; même validateur que `files.load`, throw explicite par règle.
2. Résout `project` : `in.project` (string/num) → `config.project`. Erreur si absent.
3. Résout `ref` : `in.ref` → `config.ref` → `""` (défaut repo).
4. Résout `basePath` : `in.basePath` → `config.basePath` → `""`, puis normalise.
5. `baseUrl = normalizeBaseUrl(config.baseUrl)`.
6. `token = resolveGitLabToken(ctx, deps, "gitlab.files.fetch")`.
7. Pour chaque slot (**séquentiel** — décidé) :
   - `filePath = joinRepoPath(basePath, slot.subpath)` (anti-traversal).
   - `GET …/repository/files/{encFilePath}/raw?ref=…`.
   - `!ok` ⇒ throw (404 ou HTTP n).
   - `artifact = textToArtifact(ctx, res.text, slot.outputKind, "gitlab.files.fetch", { source, project, ref, filePath, byteLength })`.
   - push `{ port: slot.port, artifact }`.
8. `return { kind: "produced-many", artifacts: produced }`.

Log info au début : `[gitlab.files.fetch] project=… ref=… base=… (N files)`.

## 9. Sécurité

- Token résolu à l'exécution (settings chiffrés via `getAccessToken`, fallback env
  `GITLAB_TOKEN`) — **jamais** dans le template. Identique à `git.clone` / `gitlab.mr.*`.
- Token dans le header `PRIVATE-TOKEN`, **jamais dans l'URL** ⇒ `res.text`/`status`
  sûrs à logger.
- Anti-traversal sur `joinRepoPath` : un `subpath` ne peut pas remonter au-dessus de
  la racine du repo (et, par décision §5/§11, pas au-dessus de `basePath`).
- Utilise le `fetch` global du main process (pas de CSP renderer à toucher — même
  régime que `webhook.call` / `gitlab.*`).

## 10. Touchpoints (fichiers à créer / modifier)

| # | Fichier | Action |
| --- | --- | --- |
| 1 | `apps/desktop/electron/main/wf/plugins/gitlab-files-fetch.ts` | **Créer** le runner + `joinRepoPath`. |
| 2 | `apps/desktop/electron/main/wf/plugins/file-load.ts` | Extraire `textToArtifact` (export), brancher `readFileToArtifact` dessus. |
| 3 | `apps/desktop/electron/main/wf/composition-root.ts` | `import { createGitlabFilesFetchRunner }` + `runners.register(createGitlabFilesFetchRunner({ getAccessToken: getGitLabAccessToken }))`. |
| 4 | `apps/desktop/src/ui/components/templates/step-kinds.ts` | Ajouter le `StepKindMeta` (`id: "gitlab.files.fetch"`, label, icône, famille `system`, `buildDefaultConfig`). |
| 5 | `apps/desktop/src/domain/workflow/types.ts` | Ajouter `\| "gitlab.files.fetch"` à l'union `StepKindId`. |
| 6 | `apps/desktop/shared/wf/resolve-node-spec.ts` | Ajouter `case "gitlab.files.fetch":` — **miroir exact** du case `files.load` (slots → ports), `inputs` = `[{ name: "in", kinds: ["Json","*"], optional: true }]`. |
| 7 | `apps/desktop/src/ui/components/templates/StepInspector.tsx` | Bloc d'édition : champs `project` / `ref` / `baseUrl` / `basePath` + réutiliser un éditeur de slots calqué sur `FilesLoadSlotsEditor` (les slots sont identiques ; ajouter ce kind à la liste ligne ~70 et au dispatch ~765). |
| 8 | `apps/desktop/src/ui/i18n/messages/{en,fr}.json` | Clés `template.stepInspector.gitlabFilesFetch.*` (voir §12). |
| 9 | `apps/docs/src/content/docs/{en,fr}/nodes/gitlab-files-fetch.md` | Doc utilisateur (format §14). Lier depuis l'overview + `see also` de `git-clone` / `files.load`. |
| 10 | `apps/desktop/electron/main/wf/plugins/gitlab-files-fetch.test.ts` | Tests runner (voir §13). |
| 11 | `apps/desktop/shared/wf/resolve-node-spec.test.ts` | Cas `gitlab.files.fetch` (base permissive + slots → ports). |

> `listNodeSpecs` (MCP `ctxfirst_list_node_specs`) itère sur les runners enregistrés
> et appelle `resolveSpec` — l'enregistrement (#3) suffit à l'exposer au catalogue
> et au chat. Pas de liste statique à maintenir en plus.

## 11. Tableau de validation (messages d'erreur)

| Règle | Erreur |
| --- | --- |
| `slots` absent / vide | `gitlab.files.fetch requires config.slots[] (≥ 1)` |
| slot non-objet | `gitlab.files.fetch: each slot must be an object` |
| `port` vide / mauvais format | `… port name must be a non-empty string` / `… port "X" must match /…/` |
| `port` dupliqué | `… duplicate port "X"` |
| `subpath` vide | `… port "X" needs a non-empty subpath` |
| `outputKind` non supporté | `… unsupported outputKind "X" (only Markdown and Json…)` |
| `project` absent | `gitlab.files.fetch: missing \`project\` (numeric id or \`group/project\` path).` |
| `subpath` sort de `basePath` | `gitlab.files.fetch: subpath "X" escapes the base path` |
| Fichier 404 | `gitlab.files.fetch: file not found "<filePath>" at ref "<ref>"` |
| Autre HTTP !ok | `gitlab.files.fetch: HTTP <status> fetching "<filePath>": <text…>` |
| Corps vide | (via `textToArtifact`) `gitlab.files.fetch: file is empty` |
| JSON invalide (`outputKind=Json`) | (via `textToArtifact`) `gitlab.files.fetch: file is not valid JSON` |

**Décidé** — tout `subpath` qui sort de `basePath` (même s'il resterait dans le repo)
est **refusé**, avant appel réseau. Cohérence stricte avec le containment de
`files.load`.

## 12. i18n (clés à ajouter, miroir de `filesLoad`)

```
template.stepInspector.gitlabFilesFetch.project.label / .description
template.stepInspector.gitlabFilesFetch.ref.label / .description
template.stepInspector.gitlabFilesFetch.baseUrl.label / .description
template.stepInspector.gitlabFilesFetch.basePath.label / .description   (« Base path » / préfixe repo, les subpaths y sont relatifs)
template.stepInspector.gitlabFilesFetch.slots.label / .description / .add
template.stepInspector.gitlabFilesFetch.slots.slotTitle / .portLabel / .kindLabel / .subpathLabel
template.stepInspector.gitlabFilesFetch.slots.portPlaceholder / .subpathPlaceholder
```

À fournir en `en.json` **et** `fr.json`.

## 13. Tests (`gitlab-files-fetch.test.ts`)

`fetch` mocké (réponses raw par `filePath`). Couvrir :

- 1 slot Markdown → `produced-many` à 1 port, payload `{ format: "markdown", body }`, méta `filePath`/`ref`/`project`.
- N slots → ordre des ports préservé, premier `primary` (via resolveSpec).
- `basePath` + `subpath` → `file_path` envoyé = jointure attendue, **encodé `%2F`**.
- `ref` épinglé vs vide → présence/absence du query param `ref`.
- `project` depuis input `in` l'emporte sur config ; absent ⇒ throw.
- `outputKind=Json` + corps non-JSON ⇒ throw (early-fail).
- 404 ⇒ erreur « file not found » nommant fichier + ref.
- `subpath` évasif (`../…`) ⇒ throw avant tout appel réseau.
- Token absent (ni settings ni env) ⇒ throw de `resolveGitLabToken`.
- Header `PRIVATE-TOKEN` posé, token **absent de l'URL**.

`resolve-node-spec.test.ts` : base permissive sans slot valide ; slots → ports
ordonnés, premier `primary`.

## 14. Doc utilisateur (`gitlab-files-fetch.md`)

Format identique aux docs de nodes existantes (frontmatter `title`/`description`,
kind backtické, paragraphe, screenshot, sections **Ports** / **Configuration** /
**Security** / **Runtime behavior** / **Example** / **See also**). `See also` :
`files.load` (pendant local), `git.clone` (alternative par clone complet), overview.

## 15. Décisions

1. **Évasion `basePath`** : **refusée**. Tout `subpath` dont la jointure sort de
   `basePath` lève une erreur avant appel réseau (cohérence stricte avec `files.load`,
   §5 / §11).
2. **Parallélisme** : fetch **séquentiel** sur les slots (§8). Pas de `Promise.all`.
3. **Kinds de sortie** : limités à **`Markdown` et `Json`** (text-envelope, via
   `isFileLoadKind`), comme `files.load`. Pas de binaire/base64.
4. **`basePath` (et `project` / `ref`)** : résolus depuis l'**input `in`** (enveloppe
   JSON) **avec fallback sur la config** de la node — l'input l'emporte. Les champs
   restent donc saisissables en dur dans l'éditeur.
5. **Nom du kind** : **`gitlab.files.fetch`** (validé, cohérent avec `gitlab.mr.*`).
