#!/usr/bin/env node
// Liste les composants React de l'app qui dépassent un seuil de lignes (500 par
// défaut). Sert à repérer les composants devenus trop gros, candidats à un
// découpage.
//
// Parse via le compilateur TypeScript (AST) plutôt que par regex : on mesure la
// portée réelle de chaque composant (du début à la fin de sa déclaration), et on
// distingue un composant React d'une fonction utilitaire via deux critères —
// nom capitalisé (PascalCase) ET présence de JSX dans le corps. Un fichier peut
// donc compter plusieurs composants, chacun mesuré séparément. Les wrappers
// `memo`/`forwardRef`/`React.memo(...)` sont pris en compte (on mesure la
// déclaration `const X = ...` complète).
//
// Usage :
//   node scripts/audit-large-components.js [chemins...] [--threshold N] [--json]
//
//   (sans argument)   → scanne apps/desktop/src
//   chemins           → fichiers ou dossiers à scanner à la place du défaut
//   --threshold N     → seuil de lignes (défaut 500)
//   --json            → sortie JSON machine au lieu du rapport lisible
//
// Code de sortie : 1 si au moins un composant dépasse le seuil, 0 sinon.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

// --- CLI ---------------------------------------------------------------------
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const AS_JSON = flags.has("--json");

let THRESHOLD = 500;
const thresholdIdx = argv.indexOf("--threshold");
if (thresholdIdx !== -1) {
  const raw = Number(argv[thresholdIdx + 1]);
  if (Number.isFinite(raw) && raw > 0) THRESHOLD = raw;
  else {
    process.stderr.write(`⚠  --threshold attend un entier positif, reçu : ${argv[thresholdIdx + 1]}\n`);
    process.exit(2);
  }
}

const positional = argv.filter(
  (a, i) => !a.startsWith("--") && i !== thresholdIdx + 1,
);

const roots = positional.length
  ? positional.map((p) => path.resolve(process.cwd(), p))
  : [path.join(REPO_ROOT, "apps/desktop/src")];

// --- Configuration -----------------------------------------------------------
const SCAN_EXT = new Set([".tsx", ".jsx"]);

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
]);

// Stories et tests exclus : ce ne sont pas des composants de l'app.
const EXCLUDE_FILE_RE = [/\.stories\.[jt]sx$/, /\.(test|spec)\.[jt]sx$/];

// --- Parcours du système de fichiers -----------------------------------------
const collectFiles = (target, out = []) => {
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    if (SCAN_EXT.has(path.extname(target))) out.push(target);
    return out;
  }
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) collectFiles(full, out);
    else if (entry.isFile() && SCAN_EXT.has(path.extname(entry.name))) out.push(full);
  }
  return out;
};

const isExcluded = (file) => EXCLUDE_FILE_RE.some((re) => re.test(file));

const isPascalCase = (name) => /^[A-Z]/.test(name);

// Vrai si le sous-arbre contient du JSX (élément, self-closing ou fragment).
const containsJsx = (node) => {
  let found = false;
  const walk = (n) => {
    if (found) return;
    if (
      ts.isJsxElement(n) ||
      ts.isJsxSelfClosingElement(n) ||
      ts.isJsxFragment(n)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return found;
};

// Déballe memo(...) / forwardRef(...) / React.memo(...) pour retrouver la
// fonction sous-jacente.
const unwrapFunction = (expr) => {
  if (!expr) return null;
  if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) return expr;
  if (ts.isCallExpression(expr)) {
    for (const arg of expr.arguments) {
      const fn = unwrapFunction(arg);
      if (fn) return fn;
    }
  }
  if (ts.isParenthesizedExpression(expr)) return unwrapFunction(expr.expression);
  return null;
};

// --- Analyse d'un fichier -----------------------------------------------------
const analyzeFile = (file) => {
  const text = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    file.endsWith(".jsx") ? ts.ScriptKind.JSX : ts.ScriptKind.TSX,
  );

  const components = [];

  const record = (name, node) => {
    if (!containsJsx(node)) return;
    const start = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    const end = sf.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
    const lines = end - start + 1;
    components.push({ name, startLine: start, endLine: end, lines });
  };

  const visit = (node) => {
    // function Foo() { ... }
    if (ts.isFunctionDeclaration(node) && node.name && isPascalCase(node.name.text)) {
      record(node.name.text, node);
    }
    // const Foo = (...) => ... / function expression / memo(forwardRef(...))
    else if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !isPascalCase(decl.name.text)) continue;
        const fn = unwrapFunction(decl.initializer);
        if (fn) record(decl.name.text, node);
      }
    }
    // export default function () {} / export default () => {}
    else if (ts.isExportAssignment(node)) {
      const fn = unwrapFunction(node.expression);
      if (fn) {
        const name = ts.isFunctionExpression(fn) && fn.name ? fn.name.text : "default";
        record(name, node);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return components;
};

// --- Exécution ----------------------------------------------------------------
const files = [];
for (const root of roots) {
  if (!fs.existsSync(root)) {
    process.stderr.write(`⚠  chemin introuvable, ignoré : ${root}\n`);
    continue;
  }
  collectFiles(root, files);
}

const scanned = [...new Set(files)].filter((f) => !isExcluded(f)).sort();

const results = [];
let scannedComponents = 0;

for (const file of scanned) {
  const components = analyzeFile(file);
  scannedComponents += components.length;
  for (const c of components) {
    if (c.lines > THRESHOLD) {
      results.push({ file: path.relative(REPO_ROOT, file), ...c });
    }
  }
}

results.sort((a, b) => b.lines - a.lines);

// --- Sortie -------------------------------------------------------------------
if (AS_JSON) {
  process.stdout.write(
    JSON.stringify(
      {
        threshold: THRESHOLD,
        scannedFiles: scanned.length,
        scannedComponents,
        oversized: results.length,
        components: results,
      },
      null,
      2,
    ) + "\n",
  );
} else {
  for (const r of results) {
    const lines = String(r.lines).padStart(5);
    process.stdout.write(`  ${lines} lignes  ${r.name}  (${r.file}:${r.startLine})\n`);
  }
  process.stdout.write(`\n${"─".repeat(60)}\n`);
  process.stdout.write(`Seuil               : > ${THRESHOLD} lignes\n`);
  process.stdout.write(`Fichiers scannés    : ${scanned.length}\n`);
  process.stdout.write(`Composants détectés : ${scannedComponents}\n`);
  process.stdout.write(`Au-dessus du seuil  : ${results.length}\n`);
}

process.exit(results.length > 0 ? 1 : 0);
