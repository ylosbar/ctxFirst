#!/usr/bin/env node
// Audite les fichiers .tsx du renderer et signale les chaînes de caractères
// destinées à l'utilisateur final qui ne passent pas par i18n.
//
// Plus large que la règle ESLint `i18next/no-literal-string` (qui tourne en
// `jsx-text-only`) : ce script remonte aussi
//   - les attributs JSX traduisibles (`title`, `alt`, `placeholder`, `label`,
//     `aria-label`, `tooltip`, etc.)
//   - les littérales passées à des callees UI (`toast.*`, `notify`, `alert`,
//     `confirm`, `Error(...)`, etc.)
//   - les template strings JSX (`<p>{`Bonjour ${name}`}</p>`).
//
// On parse le code via le compilateur TypeScript (AST), pas par regex : on
// distingue ainsi le texte JSX d'une clé `key="..."`, les appels à `t(...)`
// déjà traduits, les imports / paths, etc.
//
// Heuristiques pour éliminer le bruit (URLs, paths, classes Tailwind, ids,
// codes techniques) — voir `isLikelyHumanText`.
//
// Usage :
//   node scripts/audit-untranslated-strings.js [chemins...] [--json] [--strict]
//
//   (sans argument)   → scanne apps/desktop/src
//   chemins           → fichiers ou dossiers à scanner à la place du défaut
//   --json            → sortie JSON machine au lieu du rapport lisible
//   --strict          → désactive les heuristiques de filtrage (signale TOUT
//                       littéral suspect, même les mots isolés / techniques)
//
// Code de sortie : 1 si au moins un finding, 0 sinon (utile en CI).

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, "..")

// --- CLI ---------------------------------------------------------------------
const argv = process.argv.slice(2)
const flags = new Set(argv.filter((a) => a.startsWith("--")))
const positional = argv.filter((a) => !a.startsWith("--"))
const AS_JSON = flags.has("--json")
const STRICT = flags.has("--strict")

const roots = positional.length
  ? positional.map((p) => path.resolve(process.cwd(), p))
  : [path.join(REPO_ROOT, "apps/desktop/src")]

// --- Configuration -----------------------------------------------------------
const SCAN_EXT = new Set([".tsx"])

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "out",
  "build",
  ".next",
  "coverage",
  ".cache",
  ".turbo",
  ".yarn",
  "storybook-static",
])

// Fichiers ignorés (cohérent avec eslint.config.js).
const EXCLUDE_FILE_RE = [
  /[/\\]components[/\\]ui[/\\]/,
  /[/\\]ui[/\\]i18n[/\\]/,
  /\.stories\.tsx$/,
  /\.(test|spec)\.tsx$/,
]

// Attributs JSX dont la valeur est très probablement affichée à l'utilisateur.
const TRANSLATABLE_ATTRS = new Set([
  "title",
  "alt",
  "placeholder",
  "label",
  "aria-label",
  "aria-description",
  "aria-placeholder",
  "aria-roledescription",
  "tooltip",
  "description",
  "helperText",
  "helpText",
  "errorMessage",
  "emptyMessage",
])

// Callees dont les arguments littéraux sont du texte utilisateur.
// Patterns : nom simple OU `<obj>.<méthode>`.
const UI_CALLEES = [
  /^toast(\.[a-z]+)?$/, // toast("..."), toast.success(...), toast.error(...)
  /^notify(\.[a-z]+)?$/,
  /^alert$/,
  /^confirm$/,
  /^prompt$/,
  /^showMessage$/,
  /^showError$/,
  /^showInfo$/,
  /^showWarning$/,
  /^showSuccess$/,
]

// Callees à ignorer (déjà i18n ou non-UI). Les noms se matchent sur le
// dernier segment de la chaîne d'appel.
const IGNORED_CALLEES = new Set([
  "t",
  "tc",
  "translate",
  "i18n",
  // logs : pas du texte utilisateur final
  "log",
  "debug",
  "warn",
  "info",
  "trace",
  // tests
  "describe",
  "it",
  "test",
  "expect",
])

// Indices forts qu'une string n'est PAS du texte utilisateur.
const TAILWIND_HINT_RE =
  /(^|\s)(flex|grid|block|inline|hidden|absolute|relative|fixed|sticky|w-|h-|min-w-|max-w-|min-h-|max-h-|p-|px-|py-|pt-|pb-|pl-|pr-|m-|mx-|my-|mt-|mb-|ml-|mr-|gap-|space-|text-|font-|leading-|tracking-|bg-|border-|rounded|shadow|opacity-|cursor-|select-|overflow-|z-|top-|bottom-|left-|right-|justify-|items-|self-|content-|whitespace-|truncate|sr-only|ring-|outline-|transition|duration-|ease-|hover:|focus:|active:|disabled:|group-|peer-|data-\[|dark:|sm:|md:|lg:|xl:|2xl:)/

const URL_RE = /^(https?:|file:|data:|mailto:|tel:|wss?:|\/\/|\.{1,2}\/|\/[a-z@])/i
const PATH_LIKE_RE = /^[a-z@][a-zA-Z0-9_\-./]*\.(tsx?|jsx?|css|json|md|svg|png|jpe?g|webp|gif|ico)$/
const IDENT_RE = /^[a-z_][a-zA-Z0-9_]*$/ // un seul identifiant snake/camel
const CONST_RE = /^[A-Z][A-Z0-9_]*$/ // SCREAMING_SNAKE_CASE
const HEX_RE = /^#[0-9a-fA-F]{3,8}$/
const HAS_LETTER_RE = /\p{L}/u
const HAS_WORDY_RE = /\p{L}{2,}/u // au moins 2 lettres consécutives

// La string ressemble-t-elle à du texte destiné à un humain ?
const isLikelyHumanText = (raw) => {
  const s = raw.trim()
  if (s.length === 0) return false
  if (!HAS_LETTER_RE.test(s)) return false
  if (!HAS_WORDY_RE.test(s)) return false
  if (STRICT) return true

  if (URL_RE.test(s)) return false
  if (PATH_LIKE_RE.test(s)) return false
  if (HEX_RE.test(s)) return false
  if (CONST_RE.test(s)) return false
  if (IDENT_RE.test(s) && s.length <= 24) return false
  // kebab-case ou dot-path sans espace → probablement un id, un event, une clé
  if (/^[a-z][a-z0-9]*([-.][a-z0-9]+)+$/.test(s)) return false
  // Tailwind / classes utilitaires : présence d'un préfixe utilitaire + pas de
  // ponctuation de phrase
  if (TAILWIND_HINT_RE.test(s) && !/[.!?:,]/.test(s) && !/\s[A-ZÀ-Ý]/.test(s)) return false
  // Mots isolés très courts (ex: "ok", "id") sans accent ni espace → souvent
  // techniques ; on les ignore hors --strict.
  if (s.length <= 2) return false
  return true
}

// Récupère le nom d'un callee : `foo` → "foo", `obj.foo` → "obj.foo",
// `a.b.foo` → "a.b.foo".
const calleeName = (expr) => {
  if (ts.isIdentifier(expr)) return expr.text
  if (ts.isPropertyAccessExpression(expr)) {
    const left = calleeName(expr.expression)
    return left ? `${left}.${expr.name.text}` : expr.name.text
  }
  return null
}

const lastSegment = (name) => {
  const idx = name.lastIndexOf(".")
  return idx >= 0 ? name.slice(idx + 1) : name
}

const matchesUICallee = (name) => UI_CALLEES.some((re) => re.test(name))

// --- Parcours du système de fichiers -----------------------------------------
const collectFiles = (target, out = []) => {
  const stat = fs.statSync(target)
  if (stat.isFile()) {
    if (SCAN_EXT.has(path.extname(target))) out.push(target)
    return out
  }
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue
    const full = path.join(target, entry.name)
    if (entry.isDirectory()) collectFiles(full, out)
    else if (entry.isFile() && SCAN_EXT.has(path.extname(entry.name))) out.push(full)
  }
  return out
}

const isExcluded = (file) => EXCLUDE_FILE_RE.some((re) => re.test(file))

// --- Analyse d'un fichier -----------------------------------------------------
const analyzeFile = (file) => {
  const text = fs.readFileSync(file, "utf8")
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const findings = []

  const push = (kind, node, value, extra = {}) => {
    const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
    findings.push({
      kind,
      line: line + 1,
      column: character + 1,
      text: value.length > 120 ? value.slice(0, 117) + "..." : value,
      ...extra,
    })
  }

  const visit = (node) => {
    // 1. Texte JSX brut : <span>Bonjour</span>
    if (ts.isJsxText(node)) {
      const value = node.text
      if (isLikelyHumanText(value)) {
        push("jsx-text", node, value.trim())
      }
    }

    // 2. Attributs JSX traduisibles avec valeur littérale
    if (ts.isJsxAttribute(node) && node.name) {
      const attrName = node.name.getText()
      if (TRANSLATABLE_ATTRS.has(attrName) && node.initializer) {
        const init = node.initializer
        let lit = null
        if (ts.isStringLiteral(init)) lit = init.text
        else if (ts.isJsxExpression(init) && init.expression) {
          if (ts.isStringLiteralLike(init.expression)) lit = init.expression.text
          else if (
            ts.isNoSubstitutionTemplateLiteral(init.expression) // backticks sans ${}
          )
            lit = init.expression.text
        }
        if (lit && isLikelyHumanText(lit)) {
          push("jsx-attr", node, lit, { attr: attrName })
        }
      }
    }

    // 3. Expressions JSX contenant une string literal ou un template :
    //    <p>{"Bonjour"}</p> ou <p>{`Salut ${name}`}</p>
    if (ts.isJsxExpression(node) && node.expression && node.parent && ts.isJsxElement(node.parent)) {
      const e = node.expression
      if (ts.isStringLiteralLike(e) && isLikelyHumanText(e.text)) {
        push("jsx-expr-string", e, e.text)
      } else if (ts.isTemplateExpression(e)) {
        // Au moins un segment statique avec du texte humain.
        const head = e.head.text
        const tails = e.templateSpans.map((s) => s.literal.text).join(" ")
        const joined = `${head} ${tails}`.trim()
        if (isLikelyHumanText(joined)) {
          push("jsx-expr-template", e, joined)
        }
      } else if (ts.isNoSubstitutionTemplateLiteral(e) && isLikelyHumanText(e.text)) {
        push("jsx-expr-string", e, e.text)
      }
    }

    // 4. Appels à des callees UI avec arguments littéraux
    if (ts.isCallExpression(node)) {
      const name = calleeName(node.expression)
      if (name) {
        const last = lastSegment(name)
        const ignored = IGNORED_CALLEES.has(last) || IGNORED_CALLEES.has(name)
        if (!ignored && matchesUICallee(name)) {
          for (const arg of node.arguments) {
            if (ts.isStringLiteralLike(arg) && isLikelyHumanText(arg.text)) {
              push("call-arg", arg, arg.text, { callee: name })
            } else if (ts.isNoSubstitutionTemplateLiteral(arg) && isLikelyHumanText(arg.text)) {
              push("call-arg", arg, arg.text, { callee: name })
            } else if (ts.isTemplateExpression(arg)) {
              const head = arg.head.text
              const tails = arg.templateSpans.map((s) => s.literal.text).join(" ")
              const joined = `${head} ${tails}`.trim()
              if (isLikelyHumanText(joined)) {
                push("call-arg", arg, joined, { callee: name })
              }
            }
          }
        }
      }
    }

    // 5. `throw new Error("texte humain")` dans une .tsx → souvent montré à
    //    l'utilisateur via un ErrorBoundary.
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      /^(Error|TypeError|RangeError)$/.test(node.expression.text) &&
      node.arguments &&
      node.arguments.length > 0
    ) {
      const first = node.arguments[0]
      if (ts.isStringLiteralLike(first) && isLikelyHumanText(first.text)) {
        push("error-message", first, first.text, { callee: node.expression.text })
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sf)
  return findings
}

// --- Exécution ----------------------------------------------------------------
const files = []
for (const root of roots) {
  if (!fs.existsSync(root)) {
    process.stderr.write(`⚠  chemin introuvable, ignoré : ${root}\n`)
    continue
  }
  collectFiles(root, files)
}

const scanned = [...new Set(files)].filter((f) => !isExcluded(f)).sort()

const byFile = []
const byKind = {}
let total = 0

for (const file of scanned) {
  const findings = analyzeFile(file)
  if (findings.length === 0) continue
  total += findings.length
  for (const f of findings) byKind[f.kind] = (byKind[f.kind] || 0) + 1
  byFile.push({ file: path.relative(REPO_ROOT, file), findings })
}

byFile.sort((a, b) => b.findings.length - a.findings.length)

// --- Sortie -------------------------------------------------------------------
if (AS_JSON) {
  process.stdout.write(
    JSON.stringify(
      {
        scannedFiles: scanned.length,
        filesWithFindings: byFile.length,
        total,
        byKind,
        byFile,
        strict: STRICT,
      },
      null,
      2,
    ) + "\n",
  )
} else {
  for (const { file, findings } of byFile) {
    process.stdout.write(`\n${file}  (${findings.length})\n`)
    for (const f of findings) {
      const loc = `L${f.line}`.padEnd(7)
      const kind = f.kind.padEnd(18)
      const ctx = f.attr ? ` [${f.attr}]` : f.callee ? ` [${f.callee}]` : ""
      process.stdout.write(`  ${loc} ${kind}${ctx}  "${f.text}"\n`)
    }
  }

  process.stdout.write(`\n${"─".repeat(60)}\n`)
  process.stdout.write(`Fichiers scannés : ${scanned.length}\n`)
  process.stdout.write(`Strings suspectes : ${total} dans ${byFile.length} fichiers\n`)
  if (total > 0) {
    const breakdown = Object.entries(byKind)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}: ${v}`)
      .join(" · ")
    process.stdout.write(`Répartition       : ${breakdown}\n`)
  }
  if (STRICT) process.stdout.write(`(--strict : heuristiques de filtrage désactivées)\n`)
}

process.exit(total > 0 ? 1 : 0)
