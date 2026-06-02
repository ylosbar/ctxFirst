// @ts-check
import { defineConfig } from "astro/config"
import starlight from "@astrojs/starlight"

// La base `/ctxFirst` n'est nécessaire qu'en production (GitHub Pages project
// site, servi sous le sous-chemin du dépôt). En dev, on sert à la racine pour
// que les URLs tapées (`/fr/...`) correspondent, sans préfixe à retenir.
const base = process.env.NODE_ENV === "production" ? "/ctxFirst" : "/"

// Astro ne préfixe PAS la base sur la cible d'une redirection : on la construit
// donc nous-mêmes pour que la racine pointe vers la bonne locale en dev ET en prod.
const localeRoot = base === "/" ? "/fr/" : `${base}/fr/`

// https://starlight.astro.build/reference/configuration/
export default defineConfig({
  site: "https://ylosbar.github.io",
  base,
  // Aucun contenu n'est servi sur `/` (tout vit sous fr/ et en/). On redirige la
  // racine vers la locale par défaut pour éviter un 404 sur l'entrée du site.
  redirects: {
    "/": localeRoot,
  },
  integrations: [
    starlight({
      title: "CtxFirst",
      description:
        "Drive LLM workflows step by step, with human validations at key moments and feedback loops to iterate without starting over.",
      customCss: ["./src/styles/custom.css"],
      // Site multilingue : chaque langue vit dans son propre répertoire sous
      // src/content/docs/ (fr/, en/) et est servie sous son préfixe (/fr/, /en/).
      defaultLocale: "fr",
      locales: {
        fr: { label: "Français", lang: "fr" },
        en: { label: "English", lang: "en" },
      },
      // social: [{ icon: "github", label: "GitHub", href: "https://github.com/..." }],
      // Les `slug` et `autogenerate.directory` restent sans préfixe de locale :
      // Starlight résout le bon fichier selon la langue active. Les libellés de
      // groupes sont traduits via `translations`.
      sidebar: [
        {
          label: "Démarrer",
          translations: { en: "Get started" },
          items: [
            { label: "Introduction", slug: "guides/introduction" },
            {
              label: "Installation",
              translations: { en: "Installation" },
              slug: "guides/installation",
            },
          ],
        },
        {
          label: "Tutoriel",
          translations: { en: "Tutorial" },
          autogenerate: { directory: "tutorials" },
        },
        {
          label: "Fonctionnalités",
          translations: { en: "Features" },
          autogenerate: { directory: "features" },
        },
        {
          // Nodes groupés par famille, dans le même ordre que la palette de
          // l'app (CATEGORY_ORDER / CATEGORY_LABEL de step-kinds.ts). Seules les
          // pages existantes sont listées ; ajouter un node = l'ajouter sous sa
          // famille ici.
          label: "Nodes",
          translations: { en: "Nodes" },
          items: [
            { label: "Vue d'ensemble", translations: { en: "Overview" }, slug: "nodes/overview" },
            {
              label: "Sources / Entrées",
              translations: { en: "Sources / Inputs" },
              items: [
                { label: "User Input", slug: "nodes/user-input" },
                { label: "Skill Loader", slug: "nodes/skill-loader" },
              ],
            },
            {
              label: "Génération IA",
              translations: { en: "AI generation" },
              items: [
                { label: "Claude Code Invoke", slug: "nodes/claude-code-invoke" },
              ],
            },
            {
              label: "Transformation",
              translations: { en: "Transformation" },
              items: [
                { label: "Concat Markdown", slug: "nodes/concat-markdown" },
              ],
            },
            {
              label: "Validation humaine",
              translations: { en: "Human validation" },
              items: [
                { label: "Human Gate", slug: "nodes/human-gate" },
              ],
            },
          ],
        },
        {
          label: "Plugins",
          translations: { en: "Plugins" },
          autogenerate: { directory: "plugins" },
        },
        {
          label: "Architecture",
          translations: { en: "Architecture" },
          autogenerate: { directory: "architecture" },
        },
      ],
    }),
  ],
})
