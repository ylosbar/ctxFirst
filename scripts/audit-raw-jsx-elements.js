#!/usr/bin/env node
// Audite les fichiers .tsx/.jsx du renderer et signale les éléments HTML bruts
// (<button>, <input>, <select>, <textarea>) écrits à la main qui auraient dû
// passer par un composant du design system (apps/desktop/src/components/ui/).
//
// Parse via le compilateur TypeScript (AST) plutôt que par regex : on distingue
// ainsi un élément JSX intrinsèque (balise minuscule = HTML natif) d'un composant
// React (balise capitalisée, déjà du DS), on ignore strings/commentaires, et on
// lit les attributs (`type`, `className`) pour affiner la suggestion.
//
// Usage :
//   node scripts/audit-raw-jsx-elements.js [chemins...] [--json] [--styled-only]
//
//   (sans argument)   → scanne apps/desktop/src
//   chemins           → fichiers ou dossiers à scanner à la place du défaut
//   --json            → sortie JSON machine au lieu du rapport lisible
//   --styled-only     → ne remonte que les éléments porteurs d'un className
//                       (signal fort d'un style redéclaré à la main)
//
// Code de sortie : 1 si au moins un élément est trouvé, 0 sinon (utile en CI).

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
const positional = argv.filter((a) => !a.startsWith("--"));
const AS_JSON = flags.has("--json");
const STYLED_ONLY = flags.has("--styled-only");

const roots = positional.length
  ? positional.map((p) => path.resolve(process.cwd(), p))
  : [path.join(REPO_ROOT, "apps/desktop/src")];

// --- Configuration -----------------------------------------------------------
const TARGET_TAGS = new Set(["button", "input", "select", "textarea"]);
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

// Fichiers exclus : le DS lui-même (qui DOIT utiliser les balises natives),
// les stories et les tests.
const EXCLUDE_FILE_RE = [
  /[/\\]components[/\\]ui[/\\]/,
  /\.stories\.[jt]sx$/,
  /\.(test|spec)\.[jt]sx$/,
];

// Mappe une balise (+ son `type` pour <input>) vers le composant DS attendu.
const suggest = (tag, type) => {
  switch (tag) {
    case "button":
      return { ds: "Button", from: "@/components/ui/button" };
    case "textarea":
      return { ds: "Textarea", from: "@/components/ui/textarea" };
    case "select":
      return { ds: "Select", from: "@/components/ui/select" };
    case "input":
      switch (type) {
        case "radio":
          return { ds: null, note: "Pas d'équivalent DS — candidat à extraction (Radio/RadioGroup)" };
        case "checkbox":
          return { ds: "Checkbox", from: "@/components/ui/checkbox" };
        case "search":
          return { ds: "SearchInput", from: "@/components/ui/search-input" };
        case "password":
          return { ds: "PasswordInput", from: "@/components/ui/password-input" };
        default:
          return { ds: "Input", from: "@/components/ui/input" };
      }
    default:
      return { ds: null };
  }
};

// `radio` est une catégorie à part (l'utilisateur le veut), les autres = la balise.
const categoryOf = (tag, type) => (tag === "input" && type === "radio" ? "radio" : tag);

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

// --- Lecture des attributs JSX ------------------------------------------------
const readAttrs = (openingElement) => {
  let hasClassName = false;
  let type = null; // string littérale | "dynamic" | null

  for (const attr of openingElement.attributes.properties) {
    if (!ts.isJsxAttribute(attr) || !attr.name) continue;
    const name = attr.name.getText();
    if (name === "className") hasClassName = true;
    if (name === "type") {
      const init = attr.initializer;
      if (init && ts.isStringLiteral(init)) {
        type = init.text;
      } else if (
        init &&
        ts.isJsxExpression(init) &&
        init.expression &&
        ts.isStringLiteralLike(init.expression)
      ) {
        type = init.expression.text;
      } else if (init) {
        type = "dynamic";
      }
    }
  }
  return { hasClassName, type };
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
  const findings = [];

  const visit = (node) => {
    let opening = null;
    if (ts.isJsxOpeningElement(node)) opening = node;
    else if (ts.isJsxSelfClosingElement(node)) opening = node;

    if (opening && ts.isIdentifier(opening.tagName)) {
      const tag = opening.tagName.text;
      // Balise minuscule = élément intrinsèque HTML ; majuscule = composant React.
      const isIntrinsic = tag === tag.toLowerCase();
      if (isIntrinsic && TARGET_TAGS.has(tag)) {
        const { hasClassName, type } = readAttrs(opening);
        if (!STYLED_ONLY || hasClassName) {
          const { line, character } = sf.getLineAndCharacterOfPosition(opening.getStart(sf));
          findings.push({
            tag,
            category: categoryOf(tag, type),
            type,
            hasClassName,
            line: line + 1,
            column: character + 1,
            suggestion: suggest(tag, type),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return findings;
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

const byFile = [];
const byCategory = {};
let total = 0;

for (const file of scanned) {
  const findings = analyzeFile(file);
  if (findings.length === 0) continue;
  total += findings.length;
  for (const f of findings) byCategory[f.category] = (byCategory[f.category] || 0) + 1;
  byFile.push({ file: path.relative(REPO_ROOT, file), findings });
}

byFile.sort((a, b) => b.findings.length - a.findings.length);

// --- Sortie -------------------------------------------------------------------
if (AS_JSON) {
  process.stdout.write(
    JSON.stringify(
      { scannedFiles: scanned.length, filesWithFindings: byFile.length, total, byCategory, byFile },
      null,
      2,
    ) + "\n",
  );
} else {
  const labelFor = (f) => {
    const s = f.suggestion;
    if (s.ds) return `→ <${s.ds}> (${s.from})`;
    return `→ ${s.note}`;
  };

  for (const { file, findings } of byFile) {
    process.stdout.write(`\n${file}  (${findings.length})\n`);
    for (const f of findings) {
      const loc = `L${f.line}`.padEnd(7);
      const tag = (f.category === "radio" ? "input[radio]" : f.tag).padEnd(13);
      const styled = f.hasClassName ? " [className]" : "";
      const dyn = f.type === "dynamic" ? " [type dynamique]" : "";
      process.stdout.write(`  ${loc} ${tag} ${labelFor(f)}${styled}${dyn}\n`);
    }
  }

  process.stdout.write(`\n${"─".repeat(60)}\n`);
  process.stdout.write(`Fichiers scannés : ${scanned.length}\n`);
  process.stdout.write(`Éléments bruts   : ${total} dans ${byFile.length} fichiers\n`);
  if (total > 0) {
    const breakdown = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}: ${v}`)
      .join(" · ");
    process.stdout.write(`Répartition      : ${breakdown}\n`);
  }
  if (STYLED_ONLY) process.stdout.write(`(filtré : --styled-only — éléments avec className uniquement)\n`);
}

process.exit(total > 0 ? 1 : 0);
