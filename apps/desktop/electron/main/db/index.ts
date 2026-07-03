import path from "node:path";
import { app } from "electron";
import Database from "better-sqlite3";
import { migrations } from "./migrations";

let instance: Database.Database | null = null;

export const openDatabase = (): Database.Database => {
  if (instance) return instance;

  const file = path.join(app.getPath("userData"), "app.db");
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  runMigrations(db);

  instance = db;
  return db;
};

export const getDatabase = (): Database.Database => {
  if (!instance) throw new Error("Database not opened. Call openDatabase() first.");
  return instance;
};

export const closeDatabase = () => {
  if (!instance) return;
  instance.close();
  instance = null;
};

const runMigrations = (db: Database.Database) => {
  const current = (db.pragma("user_version", { simple: true }) as number) ?? 0;
  const pending = migrations
    .filter((m) => m.version > current)
    .sort((a, b) => a.version - b.version);

  if (pending.length === 0) return;

  const apply = db.transaction((ms: typeof migrations) => {
    for (const m of ms) {
      if (m.sql) db.exec(m.sql);
      if (m.run) m.run(db);
      db.pragma(`user_version = ${m.version}`);
    }
  });
  apply(pending);
};
