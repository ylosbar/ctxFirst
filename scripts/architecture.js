#!/usr/bin/env node
// Source canonique : ARCHITECTURE.json. Ce script :
//   - `gen`                     → régénère ARCHITECTURE.md depuis le JSON
//   - `check`                   → échoue si ARCHITECTURE.md n'est pas à jour (CI)
//   - `extract <scope>`         → invariants + contexte d'un scope (ex: archi.frontend)
//   - `resolve <path...>`       → scopes/invariants concernés par des fichiers modifiés (diff)
//
// L'extraction est ce qui optimise le contexte du juge anti-drift : au lieu d'envoyer
// tout le document, on n'envoie que les règles pertinentes pour le périmètre touché.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const JSON_PATH = path.join(REPO_ROOT, "ARCHITECTURE.json");
const MD_PATH = path.join(REPO_ROOT, "ARCHITECTURE.md");

const load = () => JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));

// --- glob minimal (**, *) sur des chemins POSIX, sans dépendance externe ---
const globToRegExp = (glob) => {
  let re = "^";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // ** : n'importe quel nombre de segments (slashs inclus)
        re += ".*";
        i++;
        if (glob[i + 1] === "/") i++; // absorbe le slash qui suit **/
      } else {
        re += "[^/]*"; // * : dans un seul segment
      }
    } else if (".+^${}()|[]\\".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  return new RegExp(re + "$");
};
const matchesAny = (filePath, globs) =>
  (globs || []).some((g) => globToRegExp(g).test(filePath));

// --- rendu markdown : transformation des mentions de fichiers en liens markdown ---
// Un token « chemin/fichier » en prose devient [token](chemin-complet) — MAIS seulement
// si le chemin résolu existe réellement sur disque. Sinon on laisse le texte nu.
// Garantie : aucun lien mort, quelle que soit l'inférence de base.
const fileExists = (rel) => {
  try {
    return rel && !rel.includes("*") && fs.existsSync(path.join(REPO_ROOT, rel));
  } catch {
    return false;
  }
};
const baseName = (t) => t.replace(/\/+$/, "").split("/").pop();

// Bases de repli, de la plus spécifique à la plus générale. La 1re qui résout gagne.
const GLOBAL_BASES = [
  "apps/desktop/electron/main/wf/",
  "apps/desktop/electron/main/",
  "apps/desktop/electron/",
  "apps/desktop/src/ui/",
  "apps/desktop/src/",
  "apps/desktop/shared/wf/",
  "apps/desktop/shared/",
  "apps/desktop/",
  "packages/",
];

// Index basename → chemins, construit en scannant les sources du repo (hors node_modules…).
// Sert de dernier recours pour résoudre un basename nu situé plus bas qu'une base connue
// (ex: Workbench.tsx → apps/desktop/src/ui/workbench/Workbench.tsx). Garde d'unicité :
// un basename ambigu (plusieurs fichiers, ex: contributions.ts) reste non résolu → texte nu.
const SCAN_ROOTS = ["apps/desktop", "packages", "scripts", "doc", "specs"];
const IGNORE_DIRS = new Set([
  "node_modules", ".git", "out", "dist", "build", "coverage", ".cache", ".turbo", "storybook-static", ".next", ".claude",
]);
const basenameIndex = (() => {
  const map = new Map();
  const walk = (dir) => {
    let ents;
    try {
      ents = fs.readdirSync(path.join(REPO_ROOT, dir), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) {
        if (!IGNORE_DIRS.has(e.name)) walk(rel);
      } else {
        if (!map.has(e.name)) map.set(e.name, new Set());
        map.get(e.name).add(rel);
      }
    }
  };
  for (const r of SCAN_ROOTS) walk(r);
  return map;
})();
const uniqueByBasename = (token) => {
  const set = basenameIndex.get(baseName(token));
  return set && set.size === 1 ? [...set][0] : null;
};

const resolvePath = (token, sectionBase, localIndex) => {
  const cands = [];
  if (localIndex) {
    const hit = localIndex[baseName(token)];
    if (hit) cands.push(hit);
  }
  cands.push(token); // chemin déjà complet ou préfixé d'un workspace
  if (sectionBase) cands.push(sectionBase + token);
  for (const b of GLOBAL_BASES) cands.push(b + token);
  return cands.find(fileExists) || uniqueByBasename(token);
};

// group1 : span protégé (backticks ou lien md déjà présent) ; group2 : token chemin/fichier.
// Extensions longest-first + \b : sinon `js` matcherait le préfixe de `json`.
const LINK_RE =
  /(`[^`]*`|\[[^\]]*\]\([^)]*\))|((?:[\w@.-]+\/)+[\w@-]*(?:\.[\w]+)?|[\w-]+\.(?:tsx|ts|json|mjs|cjs|js|yaml|html|md)\b)/g;

const linkify = (text, sectionBase, localIndex) =>
  text.replace(LINK_RE, (m, protectedSpan, token) => {
    if (protectedSpan) return protectedSpan;
    const full = resolvePath(token, sectionBase, localIndex);
    return full ? `[${token}](${full})` : token;
  });

const renderBlock = (b, base, localIndex) => {
  switch (b.type) {
    case "p":
      return linkify(b.text, base, localIndex) + "\n";
    case "ul":
      return b.items.map((it) => `- ${linkify(it, base, localIndex)}`).join("\n") + "\n";
    case "code":
      return "```" + (b.lang || "") + "\n" + b.text + "\n```\n";
    case "table": {
      const head = `| ${b.columns.join(" | ")} |`;
      const sep = `| ${b.columns.map(() => "---").join(" | ")} |`;
      const rows = b.rows.map((r) => `| ${r.map((c) => linkify(c, base, localIndex)).join(" | ")} |`);
      return [head, sep, ...rows].join("\n") + "\n";
    }
    default:
      return "";
  }
};

const generateMd = (doc) => {
  const out = [];
  const m = doc.meta;

  out.push("<!-- GÉNÉRÉ depuis `ARCHITECTURE.json` par `scripts/architecture.js` — NE PAS ÉDITER À LA MAIN. -->");
  out.push("# ARCHITECTURE.md");
  out.push("");
  out.push(`> **Produit : ${m.product}** — ${m.tagline}`);
  out.push(`> Monorepo : \`${m.repo}\`. Surface principale : ${linkify(m.primarySurface)}.`);
  out.push("");

  out.push("## 0. But de ce document");
  out.push("");
  out.push("Ce fichier (sa source `ARCHITECTURE.json`) a deux usages :");
  out.push("");
  m.purpose.forEach((p, i) => out.push(`${i + 1}. ${p}`));
  out.push("");
  out.push("**Règles d'écriture** :");
  m.writingRules.forEach((r) => out.push(`- ${r}`));
  out.push("");
  out.push(`Précédence en cas de conflit : ${m.precedence.map((p) => `\`${p}\``).join(" > ")}.`);
  out.push("");
  out.push("---");
  out.push("");

  // Contexte, ordonné par numéro de section
  const ctxEntries = Object.entries(doc.context).sort((a, b) =>
    String(a[1].section).localeCompare(String(b[1].section), undefined, { numeric: true })
  );
  for (const [id, ctx] of ctxEntries) {
    out.push(`## ${ctx.section}. ${linkify(ctx.title, ctx.pathBase)}`);
    out.push(`<!-- ctx:${id} | scopes: ${ctx.scopes.join(", ")} -->`);
    out.push("");
    for (const block of ctx.body) out.push(renderBlock(block, ctx.pathBase));
    out.push("---");
    out.push("");
  }

  // Invariants groupés par catégorie, dans l'ordre de num
  out.push("## Invariants anti-drift (checklist du juge)");
  out.push("");
  out.push("Liste testable d'invariants structurels. Une PR qui en viole un, sans justification explicite, **dérive**.");
  out.push("");
  const invs = [...doc.invariants].sort((a, b) => a.num - b.num);
  let currentCat = null;
  for (const inv of invs) {
    if (inv.category !== currentCat) {
      currentCat = inv.category;
      out.push(`### ${currentCat}`);
      out.push("");
    }
    const idx = {};
    const addToIdx = (p) => {
      if (p && !p.includes("*")) idx[baseName(p)] = p;
    };
    (inv.refs?.files || []).forEach(addToIdx);
    (inv.appliesTo || []).forEach(addToIdx);
    out.push(`${inv.num}. **${inv.title}** \`[${inv.id}]\` — _${inv.severity}_, scopes: ${inv.scopes.join(", ")}`);
    out.push(`   ${linkify(inv.rule, null, idx)}`);
    out.push("");
  }
  out.push("---");
  out.push("");

  // Zones mouvantes
  out.push("## Zones mouvantes (ne pas figer)");
  out.push("");
  out.push("Le juge doit y être **tolérant** :");
  for (const z of doc.movingZones) out.push(`- **${z.id}** (${z.scopes.join(", ")}) — ${linkify(z.note)}`);
  out.push("");
  out.push("---");
  out.push("");
  out.push(`*Source canonique : \`ARCHITECTURE.json\`. En cas de doute structurant, ${m.precedence.map((p) => `\`${p}\``).join(" prime sur ")}.*`);
  out.push("");

  return out.join("\n");
};

// --- extraction par scope ---
const extractScope = (doc, scopeId) => {
  const scope = doc.scopes[scopeId];
  if (!scope) {
    const known = Object.keys(doc.scopes).join(", ");
    throw new Error(`Scope inconnu: ${scopeId}\nScopes connus: ${known}`);
  }
  const invariants = doc.invariants.filter((i) => i.scopes.includes(scopeId));
  const context = (scope.context || []).map((id) => ({ id, ...doc.context[id] }));
  const movingZones = doc.movingZones.filter((z) => z.scopes.includes(scopeId));
  return { scope: scopeId, title: scope.title, appliesTo: scope.appliesTo, invariants, context, movingZones };
};

// --- résolution depuis des chemins de fichiers (diff) ---
// Précision d'abord : un invariant n'est retenu que si SON propre appliesTo matche
// un fichier modifié. Les scopes/contexte en sont *dérivés* (ils ne widenent jamais
// la liste d'invariants), pour garder un contexte minimal envoyé au juge.
const resolvePaths = (doc, paths) => {
  const norm = paths.map((p) => p.replace(/^\.\//, "").replace(/\\/g, "/"));
  const invHits = doc.invariants.filter((inv) =>
    norm.some((f) => matchesAny(f, inv.appliesTo))
  );
  const scopeHits = new Set(invHits.flatMap((i) => i.scopes));
  const ctxIds = new Set();
  for (const s of scopeHits) (doc.scopes[s]?.context || []).forEach((c) => ctxIds.add(c));
  return {
    changed: norm,
    scopes: [...scopeHits],
    invariants: invHits.map((i) => ({ id: i.id, title: i.title, severity: i.severity, rule: i.rule, detect: i.detect, appliesTo: i.appliesTo })),
    context: [...ctxIds].map((id) => ({ id, title: doc.context[id]?.title })),
  };
};

// --- CLI ---
const [, , cmd, ...rest] = process.argv;
const doc = load();

if (cmd === "gen") {
  fs.writeFileSync(MD_PATH, generateMd(doc));
  console.log(`✓ ARCHITECTURE.md régénéré (${doc.invariants.length} invariants, ${Object.keys(doc.context).length} sections).`);
} else if (cmd === "check") {
  const expected = generateMd(doc);
  const actual = fs.existsSync(MD_PATH) ? fs.readFileSync(MD_PATH, "utf8") : "";
  if (expected !== actual) {
    console.error("✗ ARCHITECTURE.md n'est pas à jour. Lance: node scripts/architecture.js gen");
    process.exit(1);
  }
  console.log("✓ ARCHITECTURE.md à jour.");
} else if (cmd === "extract") {
  if (!rest[0]) {
    console.error("Usage: architecture.js extract <scope-id>");
    process.exit(1);
  }
  console.log(JSON.stringify(extractScope(doc, rest[0]), null, 2));
} else if (cmd === "resolve") {
  if (rest.length === 0) {
    console.error("Usage: architecture.js resolve <path> [path...]");
    process.exit(1);
  }
  console.log(JSON.stringify(resolvePaths(doc, rest), null, 2));
} else {
  console.log(`Usage:
  node scripts/architecture.js gen                 # régénère ARCHITECTURE.md
  node scripts/architecture.js check               # CI : vérifie que le .md est à jour
  node scripts/architecture.js extract <scope>     # ex: archi.frontend
  node scripts/architecture.js resolve <path...>   # scopes/invariants pour un diff

Scopes: ${Object.keys(doc.scopes).join(", ")}`);
}
