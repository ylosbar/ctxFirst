#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
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
  "specs",
]);

const FILE_EXT_RE = /\.[a-zA-Z0-9]{1,6}$/;
const BARE_NAME_EXT_RE = /(?<![A-Za-z0-9_/.@:-])([A-Za-z0-9_-]+\.(?:md|ts|tsx|js|jsx|json|css|scss|html|yml|yaml|toml|sh|rs|py))\b/g;
const KNOWN_NON_FILES = new Set(["Node.js", "Next.js", "Vue.js", "Nuxt.js"]);

const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) out.push(full);
  }
  return out;
};

const isExternal = (s) => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(s) || /^(?:mailto|tel|data|javascript):/i.test(s);

const stripFences = (content) => {
  const lines = content.split("\n");
  const kept = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      kept.push("");
      continue;
    }
    if (inFence) {
      kept.push("");
    } else {
      kept.push(line.replace(/`[^`]*`/g, ""));
    }
  }
  return kept.join("\n");
};

const extractLinks = (content) => {
  const cleaned = stripFences(content);
  let masked = cleaned;
  const links = new Map();

  const addLink = (link, isBare) => {
    const key = (isBare ? "B|" : "L|") + link;
    if (!links.has(key)) links.set(key, { link, isBare });
  };

  const maskRange = (start, end) => {
    masked = masked.slice(0, start) + " ".repeat(end - start) + masked.slice(end);
  };

  const mdLinkRe = /\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
  let m;
  while ((m = mdLinkRe.exec(cleaned)) !== null) {
    maskRange(m.index, m.index + m[0].length);
    addLink(m[1], false);
  }

  const refDefRe = /^\s*\[[^\]]+\]:\s*<?([^\s>]+)>?/gm;
  while ((m = refDefRe.exec(cleaned)) !== null) {
    maskRange(m.index, m.index + m[0].length);
    addLink(m[1], false);
  }

  // Plain path-like strings: at least one "/", contains alnum/._-/ chars,
  // either has a file extension OR starts with "/" or "./" or "../".
  // Runs on `masked` so paths inside already-consumed markdown link labels
  // (e.g. `[wf/domain/ids.ts](apps/.../ids.ts)`) don't get double-counted.
  const plainRe = /(?<![A-Za-z0-9_/.@:-])((?:\.{1,2}\/|\/)?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+)/g;
  while ((m = plainRe.exec(masked)) !== null) {
    const raw = m[1];
    if (isExternal(raw)) continue;
    if (raw.startsWith("//")) continue;
    const looksLikeFile = FILE_EXT_RE.test(raw) || raw.startsWith("/") || raw.startsWith("./") || raw.startsWith("../");
    if (!looksLikeFile) continue;
    maskRange(m.index, m.index + m[0].length);
    addLink(raw, false);
  }

  // Mask heading lines so titles like "# CLAUDE.md" aren't treated as references.
  const headingRe = /^\s*#{1,6}\s.*$/gm;
  while ((m = headingRe.exec(cleaned)) !== null) {
    maskRange(m.index, m.index + m[0].length);
  }

  // Bare "name.ext" mentions in prose (outside any consumed range and headings).
  BARE_NAME_EXT_RE.lastIndex = 0;
  while ((m = BARE_NAME_EXT_RE.exec(masked)) !== null) {
    const token = m[1];
    if (KNOWN_NON_FILES.has(token)) continue;
    addLink(token, true);
  }

  return [...links.values()];
};

const normalizeLink = (link, mdFile, isBare) => {
  if (!link) return null;
  if (isExternal(link)) return null;
  if (link.startsWith("#")) return null;

  // Strip fragment and query.
  let cleaned = link.split("#")[0].split("?")[0];
  // Strip trailing punctuation that often gets caught from prose.
  cleaned = cleaned.replace(/[),.;:!?]+$/, "");
  // Strip ":42" or ":42-50" line markers.
  cleaned = cleaned.replace(/:\d+(?:-\d+)?$/, "");
  if (!cleaned) return null;

  if (cleaned.startsWith("/")) {
    // Treat repo-root-absolute first; if it doesn't resolve, fall back to filesystem absolute.
    const repoAbs = path.join(REPO_ROOT, cleaned);
    if (fs.existsSync(repoAbs)) return repoAbs;
    if (fs.existsSync(cleaned)) return cleaned;
    return repoAbs;
  }

  if (isBare) {
    // Bare "name.ext" in prose: try source-relative first, then repo root.
    const sourceRel = path.resolve(path.dirname(mdFile), cleaned);
    if (fs.existsSync(sourceRel)) return sourceRel;
    const rootRel = path.join(REPO_ROOT, cleaned);
    if (fs.existsSync(rootRel)) return rootRel;
    return rootRel;
  }

  return path.resolve(path.dirname(mdFile), cleaned);
};

const main = () => {
  const strict = process.argv.includes("--strict");
  const mdFiles = walk(REPO_ROOT);
  const dead = [];
  const bareValid = [];
  let validCount = 0;
  let deadCount = 0;
  const deadPaths = new Set();

  for (const file of mdFiles) {
    const content = fs.readFileSync(file, "utf8");
    const links = extractLinks(content);
    for (const { link, isBare } of links) {
      const resolved = normalizeLink(link, file, isBare);
      if (!resolved) continue;
      if (fs.existsSync(resolved)) {
        validCount++;
        if (isBare) {
          bareValid.push({
            sourceFile: path.relative(REPO_ROOT, file),
            link,
            resolved: path.relative(REPO_ROOT, resolved),
          });
        }
      } else {
        deadCount++;
        deadPaths.add(link);
        dead.push({
          sourceFile: path.relative(REPO_ROOT, file),
          link,
          resolved: path.relative(REPO_ROOT, resolved),
          ...(isBare ? { bare: true } : {}),
        });
      }
    }
  }

  const report = {
    scannedFiles: mdFiles.length,
    validLinks: validCount,
    deadLinks: deadCount,
    bareValidMentions: bareValid.length,
    invalidPaths: [...deadPaths].sort(),
    occurrences: dead,
    bareValidOccurrences: bareValid,
  };

  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (report.deadLinks > 0) process.exit(1);
  if (strict && report.bareValidMentions > 0) process.exit(1);
};

main();
