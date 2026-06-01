# @ctxfirst/docs

Documentation publique de CtxFirst, propulsée par [Starlight](https://starlight.astro.build/) (Astro).

Le contenu est du Markdown/MDX versionné dans ce repo (`src/content/docs/`) — aucun lock-in plateforme : déployable tel quel sur Cloudflare Pages, Vercel, Netlify, ou tout hébergeur statique.

## Commandes

Depuis la racine du monorepo :

- `yarn docs:dev` — serveur de dev avec HMR (port 4321 par défaut).
- `yarn docs:build` — build statique dans `apps/docs/dist/`.
- `yarn docs:preview` — sert le build localement.

Ou directement : `yarn workspace @ctxfirst/docs <dev|build|preview|typecheck>`.

## Structure du contenu

```
src/content/docs/
├── index.mdx            ← page d'accueil (hero + cartes)
├── guides/              ← Démarrer (introduction, installation)
├── features/            ← Fonctionnalités produit
├── plugins/             ← Système de plugins + plugins livrés
└── architecture/        ← Doc technique (hexagonale, IPC)
```

La sidebar est configurée dans [astro.config.mjs](astro.config.mjs). Les sections `features/`, `plugins/`, `architecture/` sont auto-générées depuis l'arborescence.

## Déploiement

Build statique → n'importe quel host. Penser à renseigner `site:` dans `astro.config.mjs` une fois l'URL connue (pour les sitemaps / canonical).
