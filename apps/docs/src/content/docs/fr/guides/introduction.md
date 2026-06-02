---
title: Introduction
description: Ce qu'est CtxFirst et à quoi il sert.
---

CtxFirst est une application de bureau (Electron) pour **piloter des workflows LLM étape par étape**, avec des **validations humaines** aux moments clés et des **boucles de feedback** permettant d'itérer sans repartir de zéro.

## Concepts clés

- **Workflow** — une suite d'étapes orchestrant un ou plusieurs appels LLM.
- **Étape (step)** — une unité de travail, qui peut requérir une validation humaine avant de passer à la suivante.
- **Validation humaine** — un point de contrôle où vous approuvez, éditez ou rejetez le résultat d'une étape.
- **Boucle de feedback** — la possibilité de relancer une étape avec un retour, sans perdre le contexte accumulé.
- **Plugin** — une extension qui ajoute des capacités à l'app (voir [Plugins](/fr/plugins/overview/)).

## À qui s'adresse cette doc ?

- **Utilisateurs** — voir [Démarrer](/fr/guides/installation/) et [Fonctionnalités](/fr/features/).
- **Auteurs de plugins** — voir [Plugins](/fr/plugins/overview/).
- **Contributeurs** — voir [Architecture](/fr/architecture/overview/).

:::note
Cette documentation est en cours de rédaction. Les pages marquées comme ébauches sont à compléter.
:::
