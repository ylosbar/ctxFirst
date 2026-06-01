#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const here = fileURLToPath(new URL(".", import.meta.url))
const srcRoot = join(here, "..", "src")
const repoRoot = join(here, "..", "..", "..")

const EXCLUDED_DIRS = new Set(["node_modules", "dist", "out"])
const EXCLUDED_PATH_FRAGMENTS = [
  "/components/ui/",
  "/ui/features/templates/exportWorkflowSvg.ts",
]
const EXCLUDED_SUFFIXES = [".stories.tsx", ".stories.ts"]

const TYPOGRAPHY_LITERAL = /\btext-\[(?!var\()[^\]]+\]/g

const walk = (dir) => {
  const entries = readdirSync(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue
      files.push(...walk(full))
      continue
    }
    if (!entry.isFile()) continue
    if (!/\.(tsx?|mts|cts)$/.test(entry.name)) continue
    if (EXCLUDED_SUFFIXES.some((s) => entry.name.endsWith(s))) continue
    if (EXCLUDED_PATH_FRAGMENTS.some((f) => full.includes(f))) continue
    files.push(full)
  }
  return files
}

const offenders = []
for (const file of walk(srcRoot)) {
  const content = readFileSync(file, "utf8")
  const lines = content.split("\n")
  lines.forEach((line, idx) => {
    const matches = line.match(TYPOGRAPHY_LITERAL)
    if (!matches) return
    for (const m of matches) {
      offenders.push({ file, line: idx + 1, match: m })
    }
  })
}

if (offenders.length === 0) {
  console.log("check-typography: 0 offending text-[...] literals")
  process.exit(0)
}

console.error(
  `check-typography: ${offenders.length} offending text-[...] literal(s) found.\n` +
    "Replace with a canonical Tailwind utility (text-2xs / text-xs / text-sm / …).\n" +
    "See specs/typography-system.md.\n"
)
for (const o of offenders) {
  console.error(`  ${relative(repoRoot, o.file)}:${o.line}  ${o.match}`)
}
process.exit(1)
