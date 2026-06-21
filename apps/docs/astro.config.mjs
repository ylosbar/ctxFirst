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

// Starlight préfixe le `base` sur ses liens générés (sidebar, prev/next…), mais
// PAS sur les liens racine écrits à la main dans le markdown (`](/fr/...)`). En
// prod (base=`/ctxFirst`) ces liens tombent en 404. Ce plugin rehype préfixe la
// base aux liens internes racine du corps des pages, ce qui laisse les sources
// en `/fr/...` (lisibles, valides en dev où base=`/`). Sans dépendance externe :
// on marche l'arbre HAST à la main.
const rehypeBaseLinks = () => {
  if (base === "/") return () => {}
  /** @param {any} node */
  const prefix = (node) => {
    if (node.type === "element" && node.tagName === "a") {
      const href = node.properties?.href
      if (
        typeof href === "string" &&
        href.startsWith("/") &&
        !href.startsWith("//") &&
        !href.startsWith(`${base}/`)
      ) {
        node.properties.href = `${base}${href}`
      }
    }
    if (Array.isArray(node.children)) node.children.forEach(prefix)
  }
  /** @param {any} tree */
  return (tree) => prefix(tree)
}

// https://starlight.astro.build/reference/configuration/
export default defineConfig({
  site: "https://ylosbar.github.io",
  base,
  // Aucun contenu n'est servi sur `/` (tout vit sous fr/ et en/). On redirige la
  // racine vers la locale par défaut pour éviter un 404 sur l'entrée du site.
  redirects: {
    "/": localeRoot,
  },
  markdown: {
    rehypePlugins: [rehypeBaseLinks],
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
          // Concepts du système de types (artifacts, kinds, compatibilité…).
          // Ordre des pages piloté par le frontmatter `sidebar.order` de chaque
          // fichier sous type-system/.
          label: "Système de types",
          translations: { en: "Type system" },
          autogenerate: { directory: "type-system" },
        },
        {
          label: "Éditeur de template",
          translations: { en: "Template editor" },
          autogenerate: { directory: "template-editor" },
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
                { label: "Load File", slug: "nodes/file-load" },
                { label: "Load Markdown File", slug: "nodes/file-load-markdown" },
                { label: "Load Files", slug: "nodes/files-load" },
                { label: "Load Files (manifest)", slug: "nodes/files-load-manifest" },
              ],
            },
            {
              label: "Génération IA",
              translations: { en: "AI generation" },
              items: [
                { label: "Claude Code Invoke", slug: "nodes/claude-code-invoke" },
                { label: "Codex Invoke", slug: "nodes/codex-invoke" },
                { label: "OpenRouter Invoke", slug: "nodes/openrouter-invoke" },
                { label: "LLM Judge", slug: "nodes/llm-judge" },
                { label: "Claude Code Judge", slug: "nodes/claude-code-judge" },
              ],
            },
            {
              label: "Transformation",
              translations: { en: "Transformation" },
              items: [
                { label: "Concat Markdown", slug: "nodes/concat-markdown" },
                { label: "Markdown Template", slug: "nodes/markdown-template" },
                { label: "Transform", slug: "nodes/transform-run" },
                { label: "JSON Transform", slug: "nodes/json-transform" },
                { label: "Render Markdown", slug: "nodes/render-markdown" },
                { label: "Sous-workflow", translations: { en: "Sub-workflow" }, slug: "nodes/workflow-call" },
                { label: "Invoquer un template", translations: { en: "Invoke sub-template" }, slug: "nodes/template-invoke" },
              ],
            },
            {
              label: "Flux / Contrôle",
              translations: { en: "Flow / Control" },
              items: [
                { label: "Branch", slug: "nodes/branch-bool" },
                { label: "Branch (JSON)", slug: "nodes/branch-json" },
                { label: "Branch (match)", slug: "nodes/branch-match" },
                { label: "Select (Markdown)", slug: "nodes/select-markdown" },
                { label: "For each", slug: "nodes/loop-foreach" },
                { label: "Collect", slug: "nodes/loop-collect" },
                { label: "Format Validate", slug: "nodes/format-validate" },
              ],
            },
            {
              label: "Validation humaine",
              translations: { en: "Human validation" },
              items: [
                { label: "Human Gate", slug: "nodes/human-gate" },
              ],
            },
            {
              label: "Système / Exécution",
              translations: { en: "System / Execution" },
              items: [
                { label: "Workspace Set", slug: "nodes/workspace-set" },
                { label: "Shell Exec", slug: "nodes/shell-exec" },
                { label: "Git Clone", slug: "nodes/git-clone" },
                { label: "Git Commit & Push", slug: "nodes/git-commit-push" },
                { label: "Git Worktree Create", slug: "nodes/git-worktree-create" },
                { label: "Git Worktree Remove", slug: "nodes/git-worktree-remove" },
                { label: "GitLab Files Fetch", slug: "nodes/gitlab-files-fetch" },
                { label: "GitLab: créer une MR", translations: { en: "GitLab: create MR" }, slug: "nodes/gitlab-mr-create" },
                { label: "GitLab: merger une MR", translations: { en: "GitLab: merge MR" }, slug: "nodes/gitlab-mr-merge" },
                { label: "Webhook / HTTP call", slug: "nodes/webhook-call" },
                { label: "Export Run", slug: "nodes/export-run" },
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
