#!/usr/bin/env node
/**
 * Vide la base SQLite et les artefacts de l'app desktop, en préservant
 * la table `app_settings` (clés API, préférences user).
 *
 * Cible les deux emplacements possibles de `userData` selon le mode :
 *   - dev     : `<config>/@ctxfirst/desktop/`  (electron-vite, name du package)
 *   - packagé : `<config>/CtxFirst/`           (productName de electron-builder)
 *
 * Pour chaque `app.db` trouvé : DELETE FROM sur toutes les tables sauf
 * `app_settings` (et `sqlite_*`). Supprime aussi le dossier `artifacts/`.
 *
 * Supprime en plus, entièrement, les profils orphelins d'anciens noms d'app
 * ils ne sont plus jamais lus et leurs
 * données survivraient sinon à tout wipe.
 *
 * Demande confirmation sauf si `--yes` est passé.
 *
 * Lancé via `ELECTRON_RUN_AS_NODE=1 electron …` car better-sqlite3 est
 * compilé contre l'ABI d'Electron (cf. postinstall electron-rebuild).
 */
import { createRequire } from "node:module";
import { rmSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin, stdout, argv, env, exit } from "node:process";

const require = createRequire(import.meta.url);

const DEV_NAME = "@ctxfirst/desktop";
const PROD_NAME = "CtxFirst";
// Profils `userData` d'anciens noms d'app (scope dev + productName packagé),
// relatifs à `<config>`. On supprime le dossier entier, pas seulement la base :
// ils ne sont plus jamais lus. À tenir à jour à chaque rename ; le nom courant
// (`@ctxfirst` / `CtxFirst`) ne doit JAMAIS y figurer.
const LEGACY_NAMES = [];
const PRESERVE_TABLES = new Set(["app_settings"]);

const userConfigDir = () => {
  const p = platform();
  if (p === "darwin")
    return path.join(homedir(), "Library", "Application Support");
  if (p === "win32")
    return env.APPDATA ?? path.join(homedir(), "AppData", "Roaming");
  return env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config");
};

const targets = (appName) => {
  const root = path.join(userConfigDir(), appName);
  return {
    db: path.join(root, "app.db"),
    artifacts: path.join(root, "artifacts"),
    piSessions: path.join(root, "pi-sessions"),
  };
};

const formatBytes = (n) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

const safeStat = (p) => {
  try {
    return statSync(p);
  } catch {
    return null;
  }
};

const collectTargets = () => {
  const items = [];
  for (const name of [DEV_NAME, PROD_NAME]) {
    const t = targets(name);
    const dbStat = safeStat(t.db);
    if (dbStat) items.push({ kind: "db", path: t.db, size: dbStat.size });
    if (safeStat(t.artifacts)) items.push({ kind: "dir", path: t.artifacts });
    // Fichiers JSONL Pi du chat : on les vire aussi pour rester cohérent
    // avec le wipe de la table `chat_sessions` côté DB.
    if (safeStat(t.piSessions)) items.push({ kind: "dir", path: t.piSessions });
  }
  // Profils orphelins d'anciens noms d'app : on supprime le dossier entier
  // (base + artefacts + sessions), pas seulement la base.
  for (const name of LEGACY_NAMES) {
    const root = path.join(userConfigDir(), name);
    if (safeStat(root)) items.push({ kind: "dir", path: root, legacy: true });
  }
  return items;
};

const wipeDb = (dbPath) => {
  const Database = require("better-sqlite3");
  const db = new Database(dbPath);
  try {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      )
      .all()
      .map((r) => r.name);

    const wiped = tables.filter((t) => !PRESERVE_TABLES.has(t));
    const kept = tables.filter((t) => PRESERVE_TABLES.has(t));

    const run = db.transaction(() => {
      // Reporte la vérification des FK au COMMIT : à ce stade toutes les tables
      // wipées sont vides, donc aucune contrainte n'est violée. Sans ça, l'ordre
      // de DELETE entre parent/enfant peut casser la transaction.
      db.pragma("defer_foreign_keys = ON");
      for (const t of wiped) db.prepare(`DELETE FROM "${t}"`).run();
      if (wiped.length > 0) {
        const hasSeq = db
          .prepare(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'",
          )
          .get();
        if (hasSeq) {
          const placeholders = wiped.map(() => "?").join(",");
          db.prepare(
            `DELETE FROM sqlite_sequence WHERE name IN (${placeholders})`,
          ).run(...wiped);
        }
      }
      // Le channel `personal` est créé par la migration 12 (cf. DEFAULT_CHANNEL_ID
      // dans wf/domain/channel.ts) et sert d'ancre FK pour
      // wf_skills/wf_templates/wf_artifact_types/wf_parsers. Comme les migrations
      // ne sont pas rejouées au prochain boot, on doit le re-seeder ici sinon
      // `seedBuiltinSkills` crashe sur FOREIGN KEY au démarrage.
      const hasChannels = db
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name='channels'",
        )
        .get();
      if (hasChannels && wiped.includes("channels")) {
        db.prepare(
          `INSERT INTO channels (id, name, description, created_at, updated_at)
           VALUES ('personal', 'Personal', 'Channel par défaut.',
                   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        ).run();
      }
    });
    run();
    db.exec("VACUUM");
    return { wiped, kept };
  } finally {
    db.close();
  }
};

const main = async () => {
  const yes = argv.includes("--yes") || argv.includes("-y");
  const items = collectTargets();

  if (items.length === 0) {
    console.log("Rien à faire — aucune base ni artefact trouvés.");
    exit(0);
  }

  console.log("Cibles :");
  for (const i of items) {
    if (i.kind === "db") {
      console.log(
        `  - ${i.path}  (${formatBytes(i.size)}) — DELETE des tables sauf app_settings`,
      );
    } else {
      const tag = i.legacy
        ? "dossier orphelin — supprimé"
        : "dossier — supprimé";
      console.log(`  - ${i.path}/  (${tag})`);
    }
  }

  if (!yes) {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    const answer = (await rl.question("\nConfirmer ? [y/N] "))
      .trim()
      .toLowerCase();
    rl.close();
    if (
      answer !== "y" &&
      answer !== "yes" &&
      answer !== "o" &&
      answer !== "oui"
    ) {
      console.log("Annulé.");
      exit(0);
    }
  }

  for (const i of items) {
    if (i.kind === "db") {
      const { wiped, kept } = wipeDb(i.path);
      console.log(`✓ ${i.path}`);
      console.log(`    vidées     : ${wiped.join(", ") || "(aucune)"}`);
      console.log(`    conservées : ${kept.join(", ") || "(aucune)"}`);
    } else {
      rmSync(i.path, { recursive: true, force: true });
      console.log(`✓ supprimé ${i.path}`);
    }
  }
  console.log("\nWipe terminé.");
};

main().catch((err) => {
  console.error("Échec :", err);
  exit(1);
});
