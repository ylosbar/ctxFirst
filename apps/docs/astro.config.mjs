// @ts-check
import { defineConfig } from "astro/config"
import starlight from "@astrojs/starlight"

// https://starlight.astro.build/reference/configuration/
export default defineConfig({
  // Déploiement GitHub Pages (project site) servi sous le sous-chemin du dépôt.
  site: "https://ylosbar.github.io",
  base: "/ctxFirst",
  integrations: [
    starlight({
      title: "CtxFirst",
      description:
        "Drive LLM workflows step by step, with human validations at key moments and feedback loops to iterate without starting over.",
      // Site monolingue (français) : la clé `root` garde le contenu à la
      // racine de src/content/docs/ sans préfixe de locale par répertoire.
      locales: {
        root: { label: "Français", lang: "fr" },
      },
      // social: [{ icon: "github", label: "GitHub", href: "https://github.com/..." }],
      sidebar: [
        {
          label: "Démarrer",
          items: [
            { label: "Introduction", slug: "guides/introduction" },
            { label: "Installation", slug: "guides/installation" },
          ],
        },
        {
          label: "Fonctionnalités",
          autogenerate: { directory: "features" },
        },
        {
          label: "Plugins",
          autogenerate: { directory: "plugins" },
        },
        {
          label: "Architecture",
          autogenerate: { directory: "architecture" },
        },
      ],
    }),
  ],
})
