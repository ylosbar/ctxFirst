import js from "@eslint/js"
import tseslint from "typescript-eslint"
import react from "eslint-plugin-react"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import storybook from "eslint-plugin-storybook"
import i18next from "eslint-plugin-i18next"
import globals from "globals"

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/out/**",
      "**/build/**",
      "**/coverage/**",
      "**/storybook-static/**",
      "apps/desktop/plugins-builtin/**/*.js",
      "apps/desktop/scripts/wipe-db.mjs",
      "apps/desktop/release/**",
      "apps/desktop/vitest.config.ts",
      "apps/desktop/vitest.shims.d.ts",
      "apps/desktop/electron.vite.config.ts",
      "apps/desktop/.storybook/**",
      "**/.vite/**",
      "**/.turbo/**",
      "apps/docs/**",
      ".claude/worktrees/**",
      "private/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports", disallowTypeAnnotations: false },
      ],
      "@typescript-eslint/no-misused-promises": "warn",
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],

      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/no-redundant-type-constituents": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/restrict-plus-operands": "off",
      "@typescript-eslint/no-namespace": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-this-alias": "off",
      "@typescript-eslint/prefer-promise-reject-errors": "off",
    },
  },

  {
    files: ["apps/desktop/src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    settings: { react: { version: "18.3" } },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs["jsx-runtime"].rules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "react/prop-types": "off",
      "react/no-unescaped-entities": "off",
      "react/no-children-prop": "off",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "electron", message: "Le renderer ne peut pas importer 'electron'. Passe par window.api (preload)." },
            { name: "better-sqlite3", message: "Pas d'accès SQLite côté renderer." },
            { name: "child_process", message: "Pas de spawn dans le renderer." },
            { name: "fs", message: "Pas d'accès fs côté renderer." },
            { name: "fs/promises", message: "Pas d'accès fs côté renderer." },
            { name: "path", message: "Pas de manipulation de path côté renderer." },
            { name: "os", message: "Pas d'accès os côté renderer." },
          ],
        },
      ],
    },
  },

  {
    files: ["apps/desktop/src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/application/**", "@/infrastructure/**", "@/ui/**", "@/components/**"],
              message: "Le domain ne dépend que de lui-même (cf. ARCHITECTURE.md §4 — règle de dépendance hexagonale).",
            },
            {
              group: ["**/application/**", "**/infrastructure/**", "**/ui/**", "**/components/**"],
              message: "Le domain ne dépend que de lui-même (cf. ARCHITECTURE.md §4 — règle de dépendance hexagonale).",
            },
            { group: ["electron"], message: "Pas d'electron dans le domain." },
          ],
        },
      ],
    },
  },

  {
    files: ["apps/desktop/src/application/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/infrastructure/**", "@/ui/**", "@/components/**"],
              message: "Application ne dépend que de domain et de ses ports (cf. ARCHITECTURE.md §4).",
            },
            {
              group: ["**/infrastructure/**", "**/ui/**", "**/components/**"],
              message: "Application ne dépend que de domain et de ses ports (cf. ARCHITECTURE.md §4).",
            },
          ],
        },
      ],
    },
  },

  {
    files: ["apps/desktop/src/infrastructure/**/*.{ts,tsx}"],
    ignores: ["apps/desktop/src/infrastructure/electron/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.object.name='window'][object.property.name='api']",
          message: "Évite window.api hors de infrastructure/electron/.",
        },
      ],
    },
  },

  {
    files: ["apps/desktop/src/ui/**/*.{ts,tsx}", "apps/desktop/src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.object.name='window'][object.property.name='api']",
          message: "Les composants/hooks ne touchent pas window.api directement. Passe par un service injecté via useServices() (cf. ARCHITECTURE.md §9.4-9.5).",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/infrastructure/electron/**"],
              message: "Les composants/hooks n'importent pas un adapter Electron directement — passe par le port via useServices().",
            },
          ],
        },
      ],
    },
  },

  {
    files: ["apps/desktop/src/ui/**/*.tsx", "apps/desktop/src/components/**/*.tsx"],
    ignores: ["apps/desktop/src/components/ui/**", "**/*.stories.tsx"],
    rules: {
      "func-style": ["error", "expression", { allowArrowFunctions: true }],
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.object.name='window'][object.property.name='api']",
          message: "Les composants/hooks ne touchent pas window.api directement. Passe par un service injecté via useServices() (cf. ARCHITECTURE.md §9.4-9.5).",
        },
        {
          selector: "ExportDefaultDeclaration[declaration.type='ArrowFunctionExpression']",
          message: "Convention projet : déclare const Foo = () => {} puis 'export default Foo' sur une ligne séparée (cf. CLAUDE.md \"React component style\").",
        },
        {
          selector: "ExportDefaultDeclaration[declaration.type='FunctionDeclaration']",
          message: "Convention projet : pas de 'export default function Foo'. Déclare une arrow function const.",
        },
      ],
    },
  },

  {
    files: ["apps/desktop/src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },

  {
    files: ["apps/desktop/src/**/*.tsx"],
    ignores: [
      "apps/desktop/src/components/ui/**",
      "apps/desktop/src/ui/i18n/**",
      "**/*.stories.tsx",
      "**/*.{test,spec}.tsx",
    ],
    plugins: { i18next },
    rules: {
      "i18next/no-literal-string": [
        "error",
        {
          mode: "jsx-text-only",
          "should-validate-template": false,
          callees: { exclude: ["t", "i18n(ext)?.t", "tc", "translate"] },
          words: { exclude: ["[0-9!-/:-@[-`{-~]+", "[A-Z_-]+"] },
          "jsx-attributes": {
            include: ["title", "alt", "placeholder", "label", "aria-label"],
          },
        },
      ],
    },
  },

  {
    files: ["apps/desktop/electron/main/**/*.ts", "apps/desktop/electron/preload/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/*"], message: "Pas d'alias renderer ('@/*') dans le main/preload." },
          ],
        },
      ],
    },
  },

  {
    files: ["apps/desktop/electron/main/wf/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../application/**", "../adapters/**", "../plugins/**"],
              message: "Moteur wf : domain pur, pas d'I/O (cf. ARCHITECTURE.md §5).",
            },
            {
              group: ["better-sqlite3", "fs", "fs/promises", "child_process", "electron"],
              message: "Aucun I/O dans le domain du moteur. Zod autorisé (cf. ARCHITECTURE.md §5 exception).",
            },
          ],
        },
      ],
    },
  },

  {
    files: ["apps/desktop/electron/main/wf/application/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../adapters/**", "../plugins/**"],
              message: "Application du moteur dépend uniquement de domain + ports.",
            },
            {
              group: ["better-sqlite3", "fs", "fs/promises", "child_process"],
              message: "Pas d'I/O dans application — utilise un port.",
            },
          ],
        },
      ],
    },
  },

  {
    files: ["apps/desktop/shared/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/*", "../src/**", "../electron/**"],
              message: "shared/ est importable des deux côtés — il ne doit dépendre de rien d'autre que de lui-même et de libs pures.",
            },
            {
              group: ["electron", "better-sqlite3", "child_process", "fs", "fs/promises"],
              message: "Pas d'I/O dans shared/.",
            },
          ],
        },
      ],
    },
  },

  {
    files: ["packages/plugin-sdk/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["**/apps/**"], message: "Le SDK plugin ne dépend pas de l'app." },
            {
              group: ["electron", "better-sqlite3", "fs", "fs/promises", "child_process"],
              message: "SDK type-only : pas de runtime native.",
            },
          ],
        },
      ],
    },
  },

  {
    files: ["**/*.{mjs,cjs,js}"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ["**/*.{mjs,cjs,js}"],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { project: null, projectService: false },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/consistent-type-imports": "off",
      "no-console": "off",
    },
  },

  {
    files: ["**/*.{test,spec}.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.node,
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        vi: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "react-refresh/only-export-components": "off",
    },
  },

  {
    files: ["**/*.stories.@(ts|tsx|js|jsx)"],
    ...storybook.configs["flat/recommended"][0],
    rules: {
      "react-refresh/only-export-components": "off",
      "no-restricted-syntax": "off",
      "react-hooks/rules-of-hooks": "off",
    },
  },
)
