import { rmSync } from "node:fs";
import path from "node:path";
import { app, ipcMain } from "electron";
import type Database from "better-sqlite3";
import { seedDefaultChannel } from "../wf/adapters/channel-registry/sqlite";

/**
 * Dossiers `userData` laissés par d'anciens noms d'app, relatifs à `appData`
 * (le parent de `userData` : `~/.config`, `~/Library/Application Support`,
 * `%APPDATA%`). Le nom du package (dev) et le `productName` electron-builder
 * (packagé) déterminent `userData` ; un rename change le dossier et abandonne
 * l'ancien profil avec toutes ses données. On les supprime au factory reset
 * pour qu'aucune donnée orpheline ne survive à un « Tout effacer ».
 *
 * À tenir à jour à chaque rename. Le nom courant (`@ctxfirst` / `CtxFirst`) ne
 * doit JAMAIS y figurer, sinon le reset effacerait le profil actif.
 */
const LEGACY_USERDATA_DIRS: string[] = [];

/**
 * Réinitialisation d'usine : vide *toutes* les tables SQLite (y compris
 * `app_settings`, contrairement au script CLI `wipe-db` qui la préserve) puis
 * supprime les données générées sur disque. Remet le profil à l'état d'une
 * installation fraîche.
 *
 * Re-seede le channel par défaut `personal` (cf. `seedDefaultChannel`) : il
 * sert d'ancre FK à wf_skills/wf_templates/wf_artifact_types/wf_parsers, et les
 * migrations ne sont pas rejouées au prochain boot — sans ce re-seed,
 * `seedBuiltinSkills` crashe sur une contrainte FOREIGN KEY au démarrage.
 */
const wipeDatabase = (db: Database.Database) => {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .all()
    .map((r) => (r as { name: string }).name);

  const run = db.transaction(() => {
    // Reporte la vérification des FK au COMMIT : à ce stade toutes les tables
    // sont vides, donc aucune contrainte n'est violée quel que soit l'ordre
    // des DELETE entre parent et enfant.
    db.pragma("defer_foreign_keys = ON");
    for (const t of tables) db.prepare(`DELETE FROM "${t}"`).run();

    const hasSeq = db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'",
      )
      .get();
    if (hasSeq) db.prepare("DELETE FROM sqlite_sequence").run();

    if (tables.includes("channels")) {
      seedDefaultChannel(db);
    }
  });
  run();
  db.exec("VACUUM");
};

export const registerMaintenanceHandlers = (db: Database.Database) => {
  // Efface tous les réglages user ET vide la base + les données disque, puis
  // tue le process. On ne relance pas : l'utilisateur rouvrira l'app lui-même.
  // Quitter (plutôt qu'un simple reload du renderer) reste nécessaire car les
  // caches en mémoire du main (scheduler, registres, artifact store) seraient
  // sinon désynchronisés du disque wipé.
  ipcMain.handle("app:factoryReset", async () => {
    wipeDatabase(db);

    const userData = app.getPath("userData");
    // Dossiers de données générées, miroir disque des tables qu'on vient de
    // vider (artefacts, sessions de chat Pi, scratch Pi, icônes de channels).
    for (const dir of ["artifacts", "pi-sessions", "pi-cwd", "channel-icons"]) {
      rmSync(path.join(userData, dir), { recursive: true, force: true });
    }

    // Supprime aussi les profils orphelins d'anciens noms d'app (cf. rename
    // : sans ça leurs templates/skills/artefacts
    // survivent au wipe et réapparaissent si l'app est relancée sous l'ancien
    // nom. `appData` est le dossier parent sous lequel vit chaque profil nommé.
    const appData = app.getPath("appData");
    for (const legacy of LEGACY_USERDATA_DIRS) {
      const target = path.resolve(appData, legacy);
      const rel = path.relative(appData, target);
      // Garde-fou : `target` doit être un *enfant direct* nommé de `appData`,
      // jamais `appData` lui-même (une entrée vide y résoudrait et effacerait
      // tout `~/.config`), jamais un chemin remontant hors de `appData`, et
      // jamais le profil actif. Sans ça une entrée mal formée nuke le dossier
      // de config partagé par toutes les apps de l'utilisateur.
      const isDirectChild =
        rel !== "" && !rel.startsWith("..") && !rel.includes(path.sep);
      if (!isDirectChild || target === userData) {
        console.warn(`[maintenance:ipc] skip unsafe legacy dir: ${legacy}`);
        continue;
      }
      rmSync(target, { recursive: true, force: true });
    }

    app.exit(0);
  });

  console.log("[maintenance:ipc] handlers registered");
};
