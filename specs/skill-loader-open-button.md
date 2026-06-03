# Spec — Bouton « Ouvrir la skill » dans la node Skill Loader

> Statut : à valider · Cible : `apps/desktop` (studio / inspecteur) · Auteur : (à compléter)

## 1. Objectif

Dans l'inspecteur de la node `skill.loader`, ajouter un **petit bouton à côté
du `<Select>` de skill** qui ouvre la skill sélectionnée **dans le workbench,
exactement comme depuis l'explorer** : pas de nouvelle vue, pas de modale —
l'éditeur de skill existant est réutilisé.

Cas d'usage : depuis une node Skill Loader, l'auteur veut consulter / éditer la
skill qu'il vient de choisir sans avoir à la retrouver à la main dans l'explorer.

## 2. Comportement attendu

| Situation | Bouton |
| --- | --- |
| Une skill est sélectionnée (`config["skillRef"]` non vide) | **Visible**. Clic ⇒ ouvre l'éditeur de skill, focus dessus. |
| Aucune skill choisie (valeur vide) | **Masqué**. |
| Valeur de transition `__create__` | Non concerné (géré par `onRequestCreateSkill`, inchangé). |

L'ouverture se fait via l'URI `skill://{ref}` passée à `workbench.openEditor` —
le **même chemin** que l'explorer (cf. §4).

## 3. Identité

| Élément | Valeur |
| --- | --- |
| Step kind concerné | `skill.loader` |
| Fichier modifié (logique) | [`apps/desktop/src/ui/components/templates/StepInspector.tsx`](../apps/desktop/src/ui/components/templates/StepInspector.tsx) |
| Fichiers modifiés (i18n) | `apps/desktop/src/ui/i18n/messages/fr.json`, `…/en.json` |
| Icône (lucide) | `ExternalLink` (déjà importée dans le fichier) |
| API réutilisée | `workbench.openEditor(uri, { focus: true })` |
| URI cible | `skill://{skillRef}` |

## 4. Précédents réutilisés (aucune nouvelle plomberie)

L'implémentation ne fait que **réassembler du code déjà présent** :

1. **Ouverture façon explorer** — `build-tree.ts` construit l'URI
   `skill://{skill.ref}` pour chaque skill, et l'explorer ouvre la feuille via
   `wb.openEditor(uri, { focus: true })`. L'éditeur de skills est enregistré sur
   le schéma `skill://` dans `features/skills/contributions.ts`. On vise donc le
   **même éditeur**, pas une nouvelle vue.

2. **Pattern bouton « ouvrir l'éditeur »** — déjà présent dans le même fichier,
   sous-composant `WorkflowCallConfig`, pour « ouvrir le sous-workflow » :

   ```tsx
   <Button
     variant="ghost"
     size="sm"
     className="self-start gap-1.5 text-xs"
     onClick={() => workbench.openEditor(templateUriFor(refKey), { focus: true })}
   >
     <ExternalLink className="size-3.5" />
     {t("template.stepInspector.workflowCall.openSub")}
   </Button>
   ```

3. **Layout champ + bouton inline** — déjà présent juste au-dessus dans le même
   bloc (champ « path »), via un conteneur `<div className="flex … gap-2">`
   contenant l'input et un `<Button>`.

## 5. Modifications

### 5.1 `StepInspector.tsx`

- Ajouter dans le corps du composant `StepInspector` :
  `const workbench = useWorkbench();`
  (le hook est **déjà importé** ; il n'est aujourd'hui utilisé que dans
  `WorkflowCallConfig`, pas dans `StepInspector` lui-même).

- Dans le bloc `step.kind === "skill.loader"`, encapsuler le `<Select>` existant
  et le nouveau bouton dans un conteneur flex, puis ajouter le bouton
  conditionné à `skillRef` :

  ```tsx
  const skillRef = (config["skillRef"] as string | undefined) ?? "";
  // …
  {skillRef ? (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="self-start gap-1.5 text-xs"
      onClick={() => workbench.openEditor(`skill://${skillRef}`, { focus: true })}
    >
      <ExternalLink className="size-3.5" />
      {t("template.stepInspector.skillLoader.open")}
    </Button>
  ) : null}
  ```

### 5.2 i18n

Ajouter la clé `template.stepInspector.skillLoader.open` :

- `fr.json` → `"open": "Ouvrir la skill"`
- `en.json` → `"open": "Open skill"`

## 6. Hors périmètre

- Le cas `__create__` (création d'une nouvelle skill) reste géré par
  `onRequestCreateSkill` — **inchangé**.
- Aucune modification du store workbench, du preload ni de l'IPC :
  `openEditor` est déjà l'API publique utilisée partout pour ouvrir un éditeur.
- Pas de changement du modèle de données de la node (`skillRef` inchangé).

## 7. Vérification

- Sélectionner une skill dans une node Skill Loader ⇒ le bouton apparaît ⇒ clic
  ⇒ la skill s'ouvre comme un onglet/éditeur, identique à une ouverture depuis
  l'explorer.
- Aucune skill sélectionnée ⇒ bouton absent.
- `yarn lint` + `yarn typecheck` OK.
