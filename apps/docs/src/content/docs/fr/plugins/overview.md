---
title: Système de plugins
description: Comment CtxFirst est étendu par des plugins.
---

:::caution[Ébauche]
Page à enrichir à partir du `@ctxfirst/plugin-sdk` et des plugins livrés.
:::

CtxFirst est extensible via des **plugins**. Les types destinés aux auteurs de plugins sont publiés dans le package `@ctxfirst/plugin-sdk` (`packages/plugin-sdk/`).

## Plugins livrés avec l'app

Situés dans `apps/desktop/plugins-builtin/` :

- **hello-world** — plugin d'exemple minimal.
- **kanban** — tableau Kanban.
- **linear** — intégration Linear.

## Écrire un plugin

> À documenter : structure d'un plugin, API exposée par le SDK, cycle de vie, packaging.
