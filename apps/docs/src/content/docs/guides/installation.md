---
title: Installation
description: Installer et lancer CtxFirst.
---

:::caution[Ébauche]
Page à compléter une fois les binaires de distribution publiés.
:::

## Depuis les sources (développement)

Prérequis : Node.js et Yarn (workspaces).

```bash
git clone <repo>
cd ctxfirst
yarn install
yarn dev        # lance l'app Electron en mode dev (HMR renderer)
```

Autres commandes utiles :

- `yarn build` — typecheck + bundle (main + preload + renderer).
- `yarn package` — produit un binaire distribuable (electron-builder).

## Binaire packagé

À venir.
