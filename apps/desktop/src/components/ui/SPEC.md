# UI Components — Spec

Spécification d'écriture des composants du design system desktop
([apps/desktop/src/components/ui/](.)) et de leurs stories Storybook.

À lire avant d'ajouter ou de modifier un composant ici. À respecter
strictement : ce dossier est consommé par toutes les features et toute
divergence devient virale.

---

## 0. Exception à la règle « arrow + default export » de CLAUDE.md

[CLAUDE.md](/CLAUDE.md) impose pour tous les composants React de l'app le pattern
**arrow-function `const` + `export default` sur une ligne séparée**. Ce
dossier `src/components/ui/` est une **exception documentée** :

- Les primitives shadcn upstream (Input, Tooltip, Select, Badge,
  Separator, ScrollArea, Card, Table, …) sont distribuées via la CLI
  shadcn et suivent leur propre convention : `const X =
  React.forwardRef(...)` (ou `const X = (...) => ...`) suivi
  uniquement d'un `export { X, … }` nommé, parfois plusieurs
  composants colocalisés dans un même fichier (sous-composants
  étroitement liés : `Card` / `CardHeader` / `CardFooter`, etc.).
- Aligner ces fichiers sur la règle générale rendrait douloureux les
  réimports depuis shadcn (chaque mise à jour upstream créerait un
  diff stylistique sans valeur produit).
- Les nouveaux composants DS écrits **maison** (cf. §3) suivent en
  revanche la règle complète : arrow + `export default` + exports
  nommés en plus, comme décrit en §8 du présent document.

Concrètement : si tu reprends un composant tel quel depuis
[ui.shadcn.com](https://ui.shadcn.com), garde son shape d'export
upstream. Si tu écris un composant DS de zéro, applique §3 / §8 et
fournis le `export default` en plus du nommé.

Aucune feature en dehors de `components/ui/` n'a le droit d'utiliser
cette exception : la règle `CLAUDE.md` s'applique strictement partout
ailleurs.

---

## 1. Périmètre & emplacement

- Tous les composants visuels réutilisables vivent dans
  [apps/desktop/src/components/ui/](.).
- Un composant DS est **présentationnel** : il ne connaît ni le domaine,
  ni les ports/adapters, ni `window.api`. Si tu as besoin d'IPC, de
  state global ou de logique métier → c'est un composant feature, pas
  un composant DS.
- Pas de wrapper "smart" dans ce dossier. Pas d'effets de bord, pas de
  `useEffect` qui parle au monde extérieur, pas de `fetch`.
- Un fichier = un composant principal (+ ses sous-composants
  étroitement couplés, comme `Card` / `CardHeader`).
- Les tokens visuels partagés entre plusieurs composants DS vivent
  dans un fichier dédié à côté (cf. [step-status.ts](step-status.ts)) —
  pas dans une feature.

## 2. Nommage

- Fichier : `kebab-case.tsx` (ou `.ts` pour un fichier de tokens sans
  JSX).
- Composant : `PascalCase`, identique au nom de fichier
  (`expandable-card.tsx` → `ExpandableCard`).
- Story : `kebab-case.stories.tsx` collocée à côté du composant.
- Variants `cva` : `<name>Variants` exporté nommément
  (`badgeVariants`, `buttonVariants`, …) pour permettre la
  composition.

## 3. Squelette de composant

Toujours **arrow-function const + export par défaut sur ligne séparée**
(règle `CLAUDE.md` projet), plus exports nommés pour le composant, les
variants et le type des props.

```tsx
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const fooVariants = cva(
  "base classes communes à toutes les variantes",
  {
    variants: {
      variant: {
        default: "…",
        outline: "…",
      },
      size: {
        default: "h-8 px-2.5 text-sm",
        sm: "h-7 px-2 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

type FooProps = React.ComponentProps<"div"> &
  VariantProps<typeof fooVariants> & {
    icon?: React.ReactNode
  }

const Foo = ({ className, variant, size, icon, children, ...props }: FooProps) => {
  return (
    <div
      data-slot="foo"
      className={cn(fooVariants({ variant, size }), className)}
      {...props}
    >
      {icon !== undefined ? (
        <span data-slot="foo-icon" className="shrink-0">
          {icon}
        </span>
      ) : null}
      {children}
    </div>
  )
}

export default Foo
export { Foo, fooVariants }
export type { FooProps }
```

Règles structurelles **non négociables** :

1. **`data-slot="<name>"`** sur la racine et sur chaque sous-élément
   adressable (header, body, icon, actions, …). Ces attributs sont la
   surface stable pour les sélecteurs Tailwind (`has-data-[slot=…]`,
   `group-data-[slot=…]`) et pour cibler depuis l'extérieur sans
   dépendre des classes internes. Toujours en kebab-case, préfixé par
   le nom du composant pour les sous-éléments
   (`callout`, `callout-icon`, `callout-body`, `callout-actions`).
2. **`cn(…)`** pour composer les classes — jamais de concaténation
   manuelle. La `className` reçue en prop arrive **en dernier** pour
   pouvoir surcharger.
3. **`variant` vs `tone`** :
   - `variant` = forme visuelle (default, outline, ghost, link,
     destructive, secondary).
   - `tone` = sémantique colorée orthogonale (`neutral` / `info` /
     `warning` / `success` / `accent` / `danger`). Si un composant
     expose les deux, `tone` doit court-circuiter `variant`
     (cf. [badge.tsx:64](badge.tsx#L64)).
4. **`size`** : nommer les paliers `xs` / `sm` / `default` / `lg` (et
   `icon`, `icon-sm`, … pour les boutons icon-only). Toujours définir
   un `defaultVariants`.
5. **Slots optionnels** : `prop !== undefined` (jamais `prop &&`) pour
   accepter `0`, chaîne vide ou `false` comme contenu valide. Voir
   [empty-state.tsx:30](empty-state.tsx#L30).
6. **`className` accepté partout** et fusionné via `cn()`. Un composant
   DS sans cette prop est cassé pour l'override local.
7. **Sous-éléments** : préférer une API par props nommées
   (`title`, `description`, `actions`, `trailing`, …) à
   `children` quand le layout interne est figé
   (cf. [page-header.tsx](page-header.tsx),
   [empty-state.tsx](empty-state.tsx)). Garder `children` pour les
   conteneurs libres (`Card`, `Section`, `Callout`).

## 4. Couleurs & tokens

- **Aucune classe couleur brute** (`text-blue-600`, `bg-amber-500/10`, …)
  ne doit apparaître hors de `components/ui/`. Si un statut/état a
  besoin de couleur, il **doit** passer par un composant DS (`Badge
  tone=…`, `Callout tone=…`) ou par les tables dans
  [step-status.ts](step-status.ts).
- À l'intérieur du DS, n'utiliser que les variables sémantiques
  Tailwind (`bg-primary`, `text-muted-foreground`, `border-input`,
  `text-destructive`, …) **sauf** pour les tones qui ont besoin de
  couleurs vives — et dans ce cas, copier exactement la palette tones
  déjà utilisée par `Badge` / `Callout` (mêmes opacités, mêmes
  variantes dark).
- Toujours fournir le pendant `dark:` pour les couleurs vives
  (`text-blue-700 dark:text-blue-400`).

## 5. Icônes

- Source unique : `lucide-react`. Pas de SVG inline, pas d'autre
  librairie.
- Taille gérée par le parent via un sélecteur Tailwind
  (`[&_svg]:size-4`, `[&_svg:not([class*='size-'])]:size-3`) — ne pas
  forcer une `className` sur l'icône au site d'appel.
- Pour positionner une icône inline (avant/après un texte), utiliser
  l'attribut **`data-icon="inline-start"` / `"inline-end"`** sur le
  SVG. Le composant gère le padding via
  `has-data-[icon=inline-start]:pl-…` (cf.
  [badge.tsx:8](badge.tsx#L8), [button.tsx:24](button.tsx#L24)).
- Si une icône a une valeur par défaut sémantique (`Callout` →
  `Info` / `AlertTriangle` / `CheckCircle` / `XCircle`), exposer la
  prop `icon` pour la surcharger ; `icon={null}` doit pouvoir la
  masquer (avec `aria-hidden`).

## 6. Forwarding & primitives

- Composant qui doit recevoir une `ref` DOM (input, textarea,
  scrollable …) : `React.forwardRef` + `displayName`
  (cf. [input.tsx](input.tsx), [search-input.tsx](search-input.tsx)).
- Composant qui doit pouvoir devenir un autre élément (lien, bouton de
  formulaire, item de menu, …) : utiliser
  **`@base-ui/react/use-render`** + `mergeProps` et exposer la prop
  `render` plutôt qu'un `asChild` maison
  (cf. [badge.tsx:65](badge.tsx#L65)). Les primitives interactives
  (`Button`, `Tooltip`, `Select`, …) viennent de `@base-ui/react/*`.
- État interne contrôlable : pattern controlled/uncontrolled standard
  (cf. [expandable-card.tsx:38](expandable-card.tsx#L38)) — props
  `value` / `defaultValue`, `open` / `defaultOpen`, etc.

## 7. Accessibilité

- Tout composant interactif doit être **focus-visible** (les classes
  `focus-visible:border-ring focus-visible:ring-[3px]
  focus-visible:ring-ring/50` sont la base à reprendre).
- Forwarder `aria-invalid` et y réagir visuellement
  (`aria-invalid:border-destructive`).
- Pour les états sémantiques visibles (`ErrorState`, `Callout
  tone=danger`), poser `role="alert"`.
- Pour un déclencheur expand/collapse, fournir `aria-expanded` (cf.
  [expandable-card.tsx:75](expandable-card.tsx#L75)).
- Toute icône purement décorative à côté d'un libellé visible doit
  être `aria-hidden` ou ne pas avoir de `aria-label`. Toute icône
  porteuse de sens (boutons icon-only) doit avoir un `aria-label`
  exploité par le site d'appel.

## 8. Exports

Le bloc d'exports type final, dans cet ordre exact :

```ts
export default Foo                    // export par défaut
export { Foo, fooVariants }           // nommés (composant + variants)
export type { FooProps }              // types
```

L'export par défaut **et** l'export nommé sont fournis : le default
permet l'import paresseux, l'export nommé permet `import { Foo } from
"@/components/ui/foo"` (forme préférée dans le code feature).

## 9. Anti-patterns à refuser

- `function Foo(...)` ou `export default function Foo()`. Toujours
  arrow + export sur ligne séparée.
- Concaténation de classes via template strings au lieu de `cn()`.
- Couleurs brutes (`text-blue-…`) dans une feature.
- `prop && <slot>` : casse les valeurs falsy légitimes.
- Logique métier (`fetch`, accès `window.api`, hooks de domaine) à
  l'intérieur d'un composant DS.
- Gérer les marges externes (`mt-4`, `mb-2`) **dans** le composant
  DS : c'est au consommateur de positionner. Le composant DS gère
  son padding interne uniquement.
- Dépendre des classes internes d'un autre composant DS — passer
  toujours par ses props ou ses `data-slot`.

---

## 10. Stories Storybook

Chaque composant DS **doit** avoir une story collocée
`<name>.stories.tsx`. Storybook tourne en local
([apps/desktop/.storybook/](/apps/desktop/.storybook/)) avec autodocs et
addon a11y activés — toute story qui casse l'a11y check est un bug à
corriger.

### 10.1 Squelette de meta

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite"

import { Foo } from "./foo"

const meta = {
  title: "UI/Foo",                 // toujours préfixé "UI/"
  component: Foo,
  parameters: {
    layout: "centered",            // "padded" si le composant prend
                                    // toute la largeur (table, page-header)
  },
  tags: ["autodocs"],              // génère la page docs MDX automatique
  argTypes: {
    variant: {
      control: "inline-radio",
      options: ["default", "outline", "ghost"],
    },
    size: {
      control: "inline-radio",
      options: ["default", "sm"],
    },
    children: { control: "text" },
  },
  args: {
    children: "Foo",
  },
} satisfies Meta<typeof Foo>

export default meta
type Story = StoryObj<typeof meta>
```

Règles :

- **`title: "UI/<Name>"`** — un seul niveau de namespace, jamais
  `"Components/UI/Foo"` ni `"DS/Foo"`.
- **`tags: ["autodocs"]`** systématique — la page Docs est
  l'inventaire visuel de référence.
- **`satisfies Meta<typeof Foo>`** (pas `as`) pour garder le typage
  strict des `args`.
- Couvrir **chaque variant exposé par `cva`** dans `argTypes` avec un
  `control: "inline-radio"`. Si une option `undefined` est légitime
  (ex. `tone` qui désactive la coloration → retombe sur `variant`),
  inclure `undefined` dans `options`.
- Définir des `args` par défaut suffisants pour rendre le composant
  visible sans config — la story `Default` doit être lisible telle
  quelle.

### 10.2 Stories à fournir

L'ensemble minimal pour chaque composant :

1. **`Default`** — story vide (`export const Default: Story = {}`),
   utilise les `args` du meta. Doit suffire à voir le composant.
2. **Une story par axe de variation** : `Variants`, `Tones`, `Sizes`,
   `Densities`, … Chacune rend la grille complète des valeurs côte à
   côte via `render`, en propageant `{...args}` pour rester pilotée
   par les controls.

   ```tsx
   export const Variants: Story = {
     render: (args) => (
       <div className="flex flex-wrap items-center gap-2">
         <Foo {...args} variant="default">Default</Foo>
         <Foo {...args} variant="outline">Outline</Foo>
         <Foo {...args} variant="ghost">Ghost</Foo>
       </div>
     ),
   }
   ```

3. **Une story par cas notable** que la grille ne montre pas :
   - icône inline-start / inline-end ;
   - élément interactif intégré (bouton de close, input éditable,
     menu trigger) → cf. `Dismissible` dans
     [badge.stories.tsx:161](badge.stories.tsx#L161) ;
   - `render` prop (composant rendu en `<a>`, `<Link>`, …) → cf.
     `AsLink` dans [badge.stories.tsx:147](badge.stories.tsx#L147) ;
   - état contrôlé externe pour les composants stateful
     (`ExpandableCard` open/closed) ;
   - état d'erreur, état vide, état chargement pour les composants
     qui en ont (`EmptyState`, `LoadingState`, `ErrorState` →
     une story chacun).
4. **Une story par overflow / cas limite** dès qu'il existe :
   - texte très long (truncate) ;
   - container étroit / large ;
   - dark mode si le composant a un comportement spécifique (le
     theme switch global suffit dans la majorité des cas).

### 10.3 Conventions par story

- Nommer les exports en `PascalCase` (`Variants`, `WithIconStart`,
  `AsLink`). Pour un libellé humain plus parlant, surcharger via
  `name` (`name: "With icon (start)"`).
- Les stories composées (qui rendent plusieurs variantes en grille)
  utilisent **toujours** `render: (args) => …` et propagent `{...args}`
  pour rester contrôlables.
- Une story qui démontre un cas figé (icône précise, contenu précis)
  utilise `args:` plutôt qu'une string en dur dans `render`, dès lors
  que le contenu est pilotable depuis les controls.
- Pas de fixtures partagées entre stories : chaque story est lisible
  isolément.
- Pas d'état React local dans une story sauf besoin réel d'un cas
  contrôlé (et alors `useState` directement dans `render`).
- Pas de wrapper `<div className="p-4 bg-…">` pour faire joli — si le
  composant a besoin d'un fond pour être lisible, c'est un signal
  qu'il manque une variant ou que la prévisualisation `layout`
  n'est pas la bonne.

### 10.4 Exemple de référence

[badge.stories.tsx](badge.stories.tsx) couvre tous les patterns
ci-dessus (axes `Variants`/`Tones`/`Sizes`, story `Mono` figée,
`WithIconStart`/`WithIconEnd`, `AsLink` via render-prop, `Dismissible`
avec un bouton imbriqué). À reprendre comme gabarit.

---

## 11. Checklist avant de merger

Composant :

- [ ] Arrow-function const + export par défaut sur ligne séparée.
- [ ] `data-slot` sur la racine et sur chaque sous-élément adressable.
- [ ] `className` accepté en prop et fusionné via `cn()` en dernier.
- [ ] Variants définis via `cva` avec `defaultVariants`.
- [ ] `tone` distinct de `variant` si le composant a des sémantiques
      colorées.
- [ ] Slots optionnels testés avec `!== undefined`.
- [ ] Aucune classe couleur brute (`text-<color>-<n>`) en dehors d'un
      `tone` du DS.
- [ ] Icônes `lucide-react` uniquement, positionnement via
      `data-icon`.
- [ ] Focus-visible et `aria-invalid` câblés si interactif.
- [ ] Exports : `default`, `{ Component, componentVariants }`,
      `type { ComponentProps }`.

Story :

- [ ] `title: "UI/<Name>"`, `tags: ["autodocs"]`, `satisfies Meta`.
- [ ] `argTypes` couvrent **tous** les variants `cva`.
- [ ] `args` par défaut rendent la story `Default` lisible sans
      toucher aux controls.
- [ ] Une story par axe de variation (grille).
- [ ] Une story par cas notable non visible dans les grilles.
- [ ] Pas de classe couleur brute dans le `render` (sauf à
      illustrer un cas DS).
- [ ] La page Docs autogénérée est lisible.
