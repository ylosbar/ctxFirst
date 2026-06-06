---
name: decompose-god-component
description: "Decompose a React god component (oversized file, too many internal components, too many hooks, high fan-out) into hooks, sub-views and pure helpers WITHOUT behavior change. Behavior-preserving, mechanical, verified between every micro-step. Use when a component is flagged as too large/complex, or when asked to split/refactor a large component while guaranteeing no regression. Works on any React/TypeScript codebase."
trigger: /decompose-god-component
---

# /decompose-god-component

Split a "god" React component into a thin orchestrator + extracted hooks, sub-views and pure helpers, with **zero behavior change** as a hard constraint. This is a *refactor*, not a rewrite: code moves, it is not rephrased.

This skill is codebase-agnostic. It carries the method; **you detect the target project's conventions and commands and follow them** (see § Adapt to the codebase first).

## When to invoke

- A component file is too large / too complex: high line count, many components defined in one file, many hooks in a single body, or high fan-out (many imports).
- A linter, complexity tool, or audit flags it.
- The user asks to "split", "découper", "refactor", or "extract hooks/components from" a large component, *and expects no regression*.

If the user wants new behavior, bugfixes, or other migrations (i18n, design-system, typing) **at the same time** — stop and split the work: do the behavior-preserving decomposition first (this skill), ship it, then layer changes on the smaller surface. Mixing the two destroys the only cheap regression proof you have (see § The regression contract).

## The one rule

> **Move code, do not rewrite it.** Cut a block, paste it into its new home, fix only the import paths and the parameter/return plumbing. JSX, identifiers, conditionals, string literals, hook call order — byte-identical. If you find yourself "improving while moving", you have left refactoring and entered rewriting, and the regression guarantee is void.

Kent Beck's discipline applies: *make the change easy (this part may be hard), then make the easy change.* Each extraction is reversible and verified before the next.

## Adapt to the codebase first

Before any move, discover and write down how *this* project works — you will run these on every micro-step:

- **Type checker**: the command that runs `tsc --noEmit` (e.g. a `typecheck` script). The compiler is your primary regression proof — find it.
- **Test runner + how to run one file**: Jest/Vitest/etc., and the single-file invocation.
- **Render-test idiom**: how component rendering is verified here — React Testing Library + jsdom, a browser test project, or Storybook stories. Use whatever already exists; do not introduce a new framework.
- **Linter**: the command, and especially a "changed files only" mode if present.
- **Component style convention**: arrow-const vs `function`; default vs named export; where the export line goes. Match it exactly — read a few neighboring components.
- **Architecture boundaries**: any layering the repo enforces (e.g. hexagonal/ports-adapters, feature folders, dependency-direction lint rules, "UI may only reach services via DI"). Read the repo's architecture doc if one exists (e.g. `ARCHITECTURE.md`, `docs/`) and its dependency-rule lint config — extraction must not create a new edge that crosses a boundary the codebase forbids.
- **Moving zones**: ongoing migrations (i18n, design-system) with *pre-existing* warnings. Do not "fix" these during the refactor — carry the code verbatim.
- **Branch / PR convention**: naming and the type prefix used for refactors.

## The regression contract — what "no regression" means

Behavior-preservation is proven by independent layers, strongest first. Use the ones the codebase supports; lean hardest on whichever is strongest here.

1. **The type checker is the primary proof.** If every extracted piece keeps *identical types* on its props/params/returns, the compiler proves the wiring end-to-end. A behavior-preserving extraction that type-checks has almost no room to have changed behavior. This is why types are never `any`-ed to "make it compile".
2. **New colocated unit tests on extracted pure logic.** Any pure function pulled out (no JSX, no hooks) gets a colocated test that locks its behavior. This is the one place you *add* tests during the refactor.
3. **Render tests / stories as the UI-regression net.** Each extracted *presentational* sub-component gets a render test (or story) with representative props — using the project's existing idiom. For the god component itself, write **one characterization test/story before you cut anything** (representative props covering the riskiest branches) and keep it green through every step.
4. **Lint / architecture invariants unchanged.** No *new* violations vs. baseline.
5. **Diff discipline.** The moved JSX hunk must be character-identical to the original (modulo import paths and prop threading). Review every extraction's diff with that lens.

**Baselines, not absolutes.** A repo may already have failing type errors, lint warnings, or untranslated strings unrelated to your work. Capture the baseline in Phase 1 and gate on **"no *new* errors/warnings vs. that baseline"**, never on "zero". Lint warnings will *travel* with the code into new files — that is expected and is not a regression.

## Phase 0 — Triage & choose the profile

Measure the component (lines, count of internal components, count of hooks, number of imports) — use the AST / the compiler, not regex, to be accurate. Then classify:

- **Grab-bag file**: one file hosting many sibling components. → The dominant move is **relocating components into their own files**, then extracting shared hooks/helpers.
- **Monolith**: a single component concentrating state, effects and large LOC. → The dominant move is **extracting custom hooks and sub-views** out of one body.

Most real god components are both. Decide the *primary* shape — it sets the extraction order in Phase 2.

## Phase 1 — Pin the current behavior (before touching anything)

1. **Capture baselines** so later diffs are meaningful — run and save the output of: the type checker, the linter (on the file), and the size/complexity measurement. Note any pre-existing errors/warnings; those are allowed to persist.
2. **Inventory the seams** via the AST (not regex). List, with line ranges: every internal component, every cohesive cluster of state/effects/callbacks, and every pure helper (no hooks, no JSX). A quick text scan is fine for orientation, but confirm scope structurally.
3. **Write the characterization test/story** for the god component with representative props (cover the riskiest branches). Confirm green. This is your golden check for the whole operation.
4. Create a `refactor`-type branch following the repo's naming convention.

## Phase 2 — Plan the seams (extraction order = leaf-first)

Map the internal dependency graph (who uses whom). Extract **leaves first** — the things nothing else in the file depends on — so each move is small and the orchestrator shrinks monotonically.

Target a layout co-located with the component (adapt names to repo conventions):

```
<home>/<component-kebab>/
├── parts/        ← pure helpers + colocated tests   (extract these first)
├── hooks/        ← one file per use<Concern>         (stateful logic)
├── components/   ← extracted sub-views + their render tests/stories
└── <Component>   ← thin orchestrator: imports the above, wires props
```

Keep the orchestrator's public export path and name **unchanged** so no call site has to move. If the repo already has an exemplar decomposition, mirror its folder shape.

Sequence the work into **phases**, each independently green and shippable (one PR each). Do not try to land thousands of lines of moves in one PR.

## Phase 3 — Execute, one extraction at a time

For **each** seam, in leaf-first order, run this loop and do not start the next until the current is green:

### 3a. Extract a pure helper
- Cut the function verbatim into its own module, export it, import it back.
- Add a colocated test asserting its behavior on representative inputs (the one place tests are added).
- Verify: run that test file + the type checker.

### 3b. Extract a sub-component
- Cut the sub-component into its own file, in the repo's component style.
- Define an explicit `Props` type from exactly the identifiers the body closed over (props + the callbacks/state it used). No `any`. The compiler now proves the prop wiring.
- Import it back into the orchestrator with the same JSX usage.
- Add a render test / story with representative props.
- Verify: type checker + render test/story green + the JSX diff is identical modulo imports.

### 3c. Extract stateful logic into a hook
- Move a cohesive cluster of state/effects/memos/handlers into `use<Concern>`, returning an object of exactly what the component consumed.
- **Preserve hook call order and dependency arrays exactly** — reordering hooks or changing a deps array *is* a behavior change. Keep effects in the same relative order.
- Replace the inlined logic with a single call to the new hook.
- Verify: type checker + the characterization test/story still green.

### After every single extraction
Run the type checker and compare to the Phase-1 baseline — no NEW errors. Commit the micro-step (small: `refactor(<scope>): extract <thing>`). Green-to-green commits make any later bisect trivial.

## Phase 4 — Verify the whole, against the baselines

Run, and diff each against its Phase-1 baseline:
- Type checker — no new errors.
- Linter — warnings may have *moved* into new files; none NEW.
- Full test suite (unit + render/stories) — green.
- Size/complexity measurement — the orchestrator now under (or far closer to) threshold.

Then manually review every moved hunk: confirm JSX/strings/branches are identical to the original. If a single extracted file is still too large, it is itself a candidate for the next phase — note it, don't force it.

If behavior cannot be proven unchanged (an extraction that altered hook order, a deps array, or a render condition you couldn't keep identical), **revert that step** and find a smaller seam.

## PR conventions

- Type is always `refactor` — behavior is unchanged by definition. Follow the repo's branch/PR naming.
- One reviewable PR per phase.
- PR body states explicitly: *behavior-preserving, no functional change*; lists what moved where; shows before/after size numbers and confirms type/lint/test deltas vs. baseline are clean.

## Guardrails (respect the host codebase's rules)

- **Component style**: match the project's convention exactly (arrow vs function, export placement). Read neighbors; don't impose a different style.
- **AST over regex** for any structural analysis of TS/TSX.
- **Architecture boundaries**: keep extracted code on the same layer it came from; don't introduce an import that crosses a boundary the repo forbids (e.g. UI reaching past its DI/service layer, a domain module importing infrastructure). Preserve how the original obtained its dependencies (DI/context/hooks) — don't swap to direct instantiation.
- **Platform isolation**: don't let a move smuggle a forbidden import into a new file (e.g. a Node/native import into renderer-side code).
- **Moving zones**: do not migrate strings/styles/types during the refactor — carry them verbatim. Pre-existing warnings travelling into new files are expected, not regressions.
- **Tests colocated** in the project's style and framework.
- Do **not** start dev servers unless explicitly asked; targeted single-file test runs are fine.

## Anti-patterns (refuse or flag)

- Renaming, reformatting, or "tidying" identifiers/JSX while moving — kills the diff-identity proof.
- Casting to `any` / loosening types to make an extraction compile — the compiler *is* the safety net; don't blind it.
- Changing hook call order, dependency arrays, memoization boundaries, or render conditions.
- Bundling a bugfix, perf change, or unrelated migration into the refactor PR.
- One mega-PR moving everything at once — phase it.
- Extracting by retyping from memory instead of cut-paste.
- Skipping the per-step type check "to go faster" — every skipped gate is a place a regression hides.
