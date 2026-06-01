#!/usr/bin/env node
// Compte les lignes de code du projet, agrégées par extension et par workspace.
//
// On énumère les fichiers via `git ls-files` plutôt qu'un parcours récursif du
// disque : on ne compte ainsi que les fichiers suivis par git, ce qui exclut
// d'office node_modules/, out/, les artefacts de build et tout ce qui est dans
// .gitignore — sans liste d'exclusion à maintenir à la main.
//
// Pour chaque fichier on distingue :
//   - lignes totales
//   - lignes vides (uniquement des espaces)
//   - lignes de commentaire (heuristique simple : //, #, /* … */, *, <!-- … -->)
//   - lignes de code = total - vides - commentaires
//
// L'heuristique de commentaire est volontairement légère (pas de parsing par
// langage) : suffisante pour une vue d'ensemble, pas pour une métrique exacte.
//
// Usage :
//   node scripts/count-loc.js [--json] [--by-file] [--code-only]
//
//   (sans argument)   → rapport lisible groupé par extension + par workspace
//   --json            → sortie JSON machine
//   --by-file         → ajoute le détail par fichier (rapport lisible)
//   --code-only       → ne compte que le vrai code source écrit à la main :
//                       exclut docs/config/données (.md, .json, .yml, .yaml,
//                       .toml) et les fichiers générés (marqueur d'en-tête).

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

// --- CLI ---------------------------------------------------------------------
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const AS_JSON = flags.has("--json");
const BY_FILE = flags.has("--by-file");
const CODE_ONLY = flags.has("--code-only");

// Extensions considérées comme « du code » à compter. Les autres fichiers
// suivis (images, lockfiles, polices, etc.) sont ignorés.
const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".mts", ".cts",
  ".js", ".jsx", ".mjs", ".cjs",
  ".json", ".css", ".scss", ".html",
  ".md", ".sh", ".py", ".rs", ".toml", ".yml", ".yaml",
]);

// En mode --code-only : extensions retenues comme « vrai code source ». On
// écarte la doc (.md), la config et les données (.json, .yml, .yaml, .toml).
const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".mts", ".cts",
  ".js", ".jsx", ".mjs", ".cjs",
  ".css", ".scss", ".html", ".sh", ".py", ".rs",
]);

// Marqueurs d'en-tête signalant un fichier généré (à exclure en --code-only).
const GENERATED_MARKERS = [
  "@generated", "GÉNÉRÉ", "GENERATED", "DO NOT EDIT", "NE PAS ÉDITER",
  "auto-generated", "généré automatiquement",
];

// Un fichier est considéré généré si l'un des marqueurs apparaît dans ses
// premières lignes (en-tête de fichier).
function isGenerated(content) {
  const head = content.split("\n", 8).join("\n");
  return GENERATED_MARKERS.some((m) => head.includes(m));
}

// Préfixes de ligne traités comme commentaires (après trim).
const LINE_COMMENT_PREFIXES = ["//", "#", "*", "/*", "<!--"];

// --- Énumération des fichiers ------------------------------------------------
function listTrackedFiles() {
  // -z : séparateur NUL, robuste aux noms de fichiers exotiques.
  const out = execFileSync("git", ["ls-files", "-z"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split("\0").filter(Boolean);
}

// --- Comptage ----------------------------------------------------------------
function countFile(absPath) {
  let content;
  try {
    content = fs.readFileSync(absPath, "utf8");
  } catch {
    return null; // binaire illisible ou fichier disparu
  }
  // Heuristique binaire : présence d'un octet NUL.
  if (content.includes("\0")) return null;

  const lines = content.split("\n");
  // split("\n") sur un fichier terminé par \n ajoute une chaîne vide finale.
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  let blank = 0;
  let comment = 0;
  let inBlock = false; // bloc /* … */

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") {
      blank++;
      continue;
    }
    if (inBlock) {
      comment++;
      if (line.includes("*/")) inBlock = false;
      continue;
    }
    if (line.startsWith("/*")) {
      comment++;
      if (!line.includes("*/")) inBlock = true;
      continue;
    }
    if (LINE_COMMENT_PREFIXES.some((p) => line.startsWith(p))) {
      comment++;
      continue;
    }
  }

  const total = lines.length;
  return { total, blank, comment, code: total - blank - comment };
}

// Détermine le workspace d'un fichier à partir de son chemin relatif.
function workspaceOf(relPath) {
  const parts = relPath.split(path.sep);
  if (parts[0] === "apps" && parts[1]) return `apps/${parts[1]}`;
  if (parts[0] === "packages" && parts[1]) return `packages/${parts[1]}`;
  return parts[0] || "(root)";
}

function emptyStats() {
  return { files: 0, total: 0, blank: 0, comment: 0, code: 0 };
}

function addInto(target, s) {
  target.files += 1;
  target.total += s.total;
  target.blank += s.blank;
  target.comment += s.comment;
  target.code += s.code;
}

// --- Agrégation --------------------------------------------------------------
const byExt = new Map();
const byWorkspace = new Map();
const perFile = [];
const overall = emptyStats();
let generatedSkipped = 0;

for (const rel of listTrackedFiles()) {
  const ext = path.extname(rel).toLowerCase();
  const extSet = CODE_ONLY ? SOURCE_EXTENSIONS : CODE_EXTENSIONS;
  if (!extSet.has(ext)) continue;

  let content;
  try {
    content = fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
  } catch {
    continue;
  }
  if (content.includes("\0")) continue; // binaire

  if (CODE_ONLY && isGenerated(content)) {
    generatedSkipped += 1;
    continue;
  }

  const stats = countFile(path.join(REPO_ROOT, rel));
  if (!stats) continue;

  if (!byExt.has(ext)) byExt.set(ext, emptyStats());
  addInto(byExt.get(ext), stats);

  const ws = workspaceOf(rel);
  if (!byWorkspace.has(ws)) byWorkspace.set(ws, emptyStats());
  addInto(byWorkspace.get(ws), stats);

  addInto(overall, stats);
  if (BY_FILE) perFile.push({ path: rel, ...stats });
}

// --- Sortie ------------------------------------------------------------------
function sortedEntries(map) {
  return [...map.entries()].sort((a, b) => b[1].code - a[1].code);
}

if (AS_JSON) {
  const toObj = (map) =>
    Object.fromEntries(sortedEntries(map));
  const payload = {
    total: overall,
    byExtension: toObj(byExt),
    byWorkspace: toObj(byWorkspace),
  };
  if (BY_FILE) payload.byFile = perFile.sort((a, b) => b.code - a.code);
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

const fmt = (n) => String(n).padStart(8);
const pad = (s, n) => String(s).padEnd(n);

function printTable(title, map, labelWidth) {
  console.log(`\n${title}`);
  console.log(
    `${pad("", labelWidth)} ${fmt("fichiers")} ${fmt("code")} ${fmt("comm.")} ${fmt("vides")} ${fmt("total")}`,
  );
  for (const [label, s] of sortedEntries(map)) {
    console.log(
      `${pad(label, labelWidth)} ${fmt(s.files)} ${fmt(s.code)} ${fmt(s.comment)} ${fmt(s.blank)} ${fmt(s.total)}`,
    );
  }
}

printTable("Par extension", byExt, 12);
printTable("Par workspace", byWorkspace, 18);

if (BY_FILE) {
  console.log("\nPar fichier (top 30 par lignes de code)");
  for (const f of perFile.sort((a, b) => b.code - a.code).slice(0, 30)) {
    console.log(`${fmt(f.code)}  ${f.path}`);
  }
}

console.log(
  `\nTotal : ${overall.code} lignes de code` +
    ` (${overall.total} lignes, ${overall.comment} commentaires, ${overall.blank} vides)` +
    ` dans ${overall.files} fichiers.`,
);

if (CODE_ONLY) {
  console.log(
    `Mode --code-only : doc/config/données exclues` +
      (generatedSkipped > 0
        ? `, ${generatedSkipped} fichier(s) généré(s) exclu(s).`
        : `.`),
  );
}
