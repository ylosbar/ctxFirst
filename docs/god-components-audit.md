# Audit des god components React

> Généré le 2026-06-06 via graphify (graphe structurel AST sur `apps/desktop/src/` — 3096 nœuds / 6876 arêtes).
> Mis à jour le 2026-06-08 après décomposition de `StepInspector` et `SettingsEditor`.
> Méthode : les god nodes par degré pur sont des utilitaires partagés normaux (`useT()` 218, `cn()` 163, `useServices()` 94) et **ne sont pas** des god components. Le vrai signal croise **taille (LOC) + nombre de composants internes + fan-out (imports) + densité de hooks**.

## Verdict : les deux pires sont résolus, il reste 4 points de surveillance

| Composant | LOC | Composants internes | Imports | Hooks | Verdict |
|---|---|---|---|---|---|
| [RunTimelineView.tsx](../apps/desktop/src/ui/features/runs/RunTimelineView.tsx) | 850 | 9 | 19 | 10 | 🟠 le plus gros restant |
| [ArtifactSchemaEditor.tsx](../apps/desktop/src/ui/features/artifact-schemas/ArtifactSchemaEditor.tsx) | 802 | — | 22 | 14 | 🟠 |
| [ArtifactView.tsx](../apps/desktop/src/ui/components/ArtifactView.tsx) | 770 | — | 19 | 8 | 🟠 |
| [CommandPalette.tsx](../apps/desktop/src/ui/components/command-palette/CommandPalette.tsx) | 769 | 1 | 17 | 14 | 🟠 monolithe d'un seul composant |

## Chantiers terminés

- **[StepInspector.tsx](../apps/desktop/src/ui/components/templates/StepInspector.tsx)** — était le pire (3069 LOC / 19 composants dans un seul fichier). Décomposé (commit `1c926ec`, *Refactor/step inspector #34*) vers le sous-module [step-inspector/](../apps/desktop/src/ui/components/templates/step-inspector/) (35 fichiers). Le fichier d'entrée est redescendu à **394 LOC**, devenu un orchestrateur.
- **[SettingsEditor.tsx](../apps/desktop/src/ui/features/settings/SettingsEditor.tsx)** — était un god component massif (2369 LOC / 23 composants / 25 hooks). Décomposé par clusters (Appearance/General, Integrations/LLM, MCP, Plugins, Channels — cf. historique git de la branche `refactor/settings-editor-decompose`) vers [settings-editor/](../apps/desktop/src/ui/features/settings/settings-editor/) (31 fichiers). Le fichier d'entrée est redescendu à **131 LOC** : orchestrateur fin (16 imports, 7 hooks).

## Deux profils de god component

- **Fichier-fourre-tout** : profil de `StepInspector` et `SettingsEditor` (désormais résolus). → découper en sous-modules.
- **Composant monolithe** : `CommandPalette` — *un seul* composant qui concentre 14 hooks et 769 lignes. → décomposer en hooks/sous-vues.

## Point de surveillance

[TemplateEditor.tsx](../apps/desktop/src/ui/features/templates/TemplateEditor.tsx) était historiquement LE god component. La refonte par phases (extraction hooks + canvas, phases 0.2/0.3 — cf. historique git) l'a ramené à **688 lignes**, mais il garde **45 imports**, le plus fort fan-out de tout le renderer : devenu orchestrateur (plus sain), mais reste un point de surveillance.

## Priorisation restante

1. `RunTimelineView` — 850 LOC / 9 composants internes, le plus gros fichier restant.
2. `ArtifactSchemaEditor` — 802 LOC / 14 hooks, monolithe sans découpage interne.
3. `CommandPalette` — monolithe à décomposer (un seul composant, 14 hooks).
4. `ArtifactView` — 770 LOC, monolithe à surveiller.
