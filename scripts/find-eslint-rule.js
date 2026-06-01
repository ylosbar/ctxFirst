#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const ruleId = process.argv[2];
const targets = process.argv.slice(3).filter((a) => !a.startsWith("-"));
const asJson = process.argv.includes("--json");

if (!ruleId || ruleId.startsWith("-")) {
  process.stderr.write(
    "Usage: node scripts/find-eslint-rule.js <rule-id> [paths...] [--json]\n" +
      "Example: node scripts/find-eslint-rule.js i18next/no-literal-string apps/desktop/src\n",
  );
  process.exit(2);
}

const eslintBin = path.join(
  REPO_ROOT,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "eslint.cmd" : "eslint",
);
const eslintArgs = [...(targets.length ? targets : ["."]), "--format", "json"];

const res = spawnSync(eslintBin, eslintArgs, {
  cwd: REPO_ROOT,
  encoding: "utf8",
  maxBuffer: 256 * 1024 * 1024,
});

if (res.error) {
  process.stderr.write(`Failed to run eslint: ${res.error.message}\n`);
  process.exit(2);
}

let report;
try {
  report = JSON.parse(res.stdout);
} catch (e) {
  process.stderr.write(`Could not parse eslint JSON output: ${e.message}\n`);
  if (res.stderr) process.stderr.write(res.stderr);
  process.exit(2);
}

const occurrences = [];
for (const file of report) {
  for (const msg of file.messages) {
    if (msg.ruleId === ruleId) {
      occurrences.push({
        file: path.relative(REPO_ROOT, file.filePath),
        line: msg.line,
        column: msg.column,
        message: msg.message,
      });
    }
  }
}

if (asJson) {
  process.stdout.write(JSON.stringify({ ruleId, count: occurrences.length, occurrences }, null, 2) + "\n");
} else {
  for (const o of occurrences) {
    process.stdout.write(`${o.file}:${o.line}:${o.column}\n`);
  }
  process.stderr.write(`\n${occurrences.length} occurrence(s) of "${ruleId}"\n`);
}

process.exit(occurrences.length > 0 ? 1 : 0);
