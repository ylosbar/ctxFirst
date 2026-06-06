# Audit des god components React

> Généré le 2026-06-06 via graphify (graphe structurel AST sur `apps/desktop/src/` — 3096 nœuds / 6876 arêtes).
> Méthode : les god nodes par degré pur sont des utilitaires partagés normaux (`useT()` 218, `cn()` 163, `useServices()` 94) et **ne sont pas** des god components. Le vrai signal croise **taille (LOC) + nombre de composants internes + fan-out (imports) + densité de hooks**.

## Verdict : il reste plusieurs god components

| Composant | LOC | Composants internes | Imports | Hooks | Verdict |
|---|---|---|---|---|---|
| [StepInspector.tsx](../apps/desktop/src/ui/components/templates/StepInspector.tsx) | **3069** | **19** | 31 | — | 🔴 le pire — un fichier qui héberge 19 composants |
| [SettingsEditor.tsx](../apps/desktop/src/ui/features/settings/SettingsEditor.tsx) | **2369** | **23** | 31 | 25 | 🔴 god component massif |
| [RunTimelineView.tsx](../apps/desktop/src/ui/features/runs/RunTimelineView.tsx) | 850 | 9 | 19 | 10 | 🟠 |
| [ArtifactSchemaEditor.tsx](../apps/desktop/src/ui/features/artifact-schemas/ArtifactSchemaEditor.tsx) | 802 | — | 22 | 14 | 🟠 |
| [CommandPalette.tsx](../apps/desktop/src/ui/components/command-palette/CommandPalette.tsx) | 769 | 1 | 17 | 14 | 🟠 monolithe d'un seul composant |
| [ArtifactView.tsx](../apps/desktop/src/ui/components/ArtifactView.tsx) | 770 | — | 19 | 8 | 🟠 |

## Deux profils de god component

- **Fichier-fourre-tout** : `StepInspector` (19 composants + 3000 lignes dans un seul fichier, 1 export) et `SettingsEditor` (23 composants, 25 hooks). → découper en sous-modules.
- **Composant monolithe** : `CommandPalette` — *un seul* composant qui concentre 14 hooks et 769 lignes. → décomposer en hooks/sous-vues.

## Chantier déjà en cours

[TemplateEditor.tsx](../apps/desktop/src/ui/features/templates/TemplateEditor.tsx) était historiquement LE god component. La refonte par phases (extraction hooks + canvas, phases 0.2/0.3 — cf. historique git) l'a ramené à **688 lignes**, mais il garde **45 imports**, le plus fort fan-out de tout le renderer : devenu orchestrateur (plus sain), mais reste un point de surveillance.

## Priorisation

1. `StepInspector` — franchement hors normes (3069 LOC / 19 composants).
2. `SettingsEditor` — 2369 LOC / 23 composants / 25 hooks.
3. `CommandPalette` — monolithe à décomposer.
