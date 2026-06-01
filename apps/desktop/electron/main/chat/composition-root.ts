/**
 * Composition root du module `chat`. Construit le `ChatService` à partir de
 * ses dépendances (SQLite, gateway Pi, dossier de sessions). Appelé une fois
 * au boot du main process, en parallèle de `buildWfEngine`.
 */
import path from "node:path";
import { mkdir, readdir, unlink } from "node:fs/promises";
import type Database from "better-sqlite3";
import { createSqliteChatSessionStore } from "./adapters/sqlite-chat-session-store";
import { createPiAgentSessionGateway } from "./adapters/pi-agent-session-gateway";
import { createChatService, type ChatService } from "./chat-service";
import type { AgentToolProvider } from "./application/ports/outbound/agent-tool-provider";

type BuildOptions = {
  db: Database.Database;
  /** Dossier où Pi écrit ses fichiers JSONL de session. */
  sessionsDir: string;
  /**
   * cwd neutre passé à Pi (header de session + ResourceLoader). Doit
   * exister sur disque mais n'a pas besoin d'être lu — on désactive tous
   * les scans Pi via les flags `no*` du ResourceLoader.
   */
  piCwd: string;
  /** Résout la clé OpenRouter à chaque création de session Pi. */
  getOpenRouterApiKey: () => Promise<string | null>;
  /**
   * Phase B : provider des tools locaux exposés au LLM via Pi `customTools`.
   * Injecté ici plutôt que construit localement pour que la dépendance
   * `chat → mcp` ne soit câblée que depuis la composition root du main.
   */
  toolProvider: AgentToolProvider;
  /**
   * Résout la valeur globale courante du base prompt système chat. Lu
   * uniquement à `createSession` — le resume relit le snapshot persisté.
   */
  getChatSystemPrompt: () => string | null;
};

export const buildChatService = async ({
  db,
  sessionsDir,
  piCwd,
  getOpenRouterApiKey,
  toolProvider,
  getChatSystemPrompt,
}: BuildOptions): Promise<ChatService> => {
  await mkdir(sessionsDir, { recursive: true });
  await mkdir(piCwd, { recursive: true });

  const store = createSqliteChatSessionStore({ db });
  const gateway = createPiAgentSessionGateway({
    getOpenRouterApiKey,
    cwd: piCwd,
    toolProvider,
  });
  const service = createChatService({
    store,
    gateway,
    sessionsDir,
    getChatSystemPrompt,
  });

  // Cleanup au boot : on supprime les fichiers JSONL orphelins (pas de row
  // SQLite correspondante). Évite l'accumulation si une création de session
  // a échoué après `mkdir` mais avant l'INSERT, ou si l'utilisateur a
  // bidouillé le dossier à la main.
  await sweepOrphanJsonl(sessionsDir, await store.listJsonlPaths());

  return service;
};

const sweepOrphanJsonl = async (
  sessionsDir: string,
  known: ReadonlyArray<string>,
): Promise<void> => {
  const knownSet = new Set(known.map((p) => path.resolve(p)));
  let entries: string[];
  try {
    entries = await readdir(sessionsDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    console.warn("[chat:boot] failed to read sessions dir:", err);
    return;
  }
  for (const name of entries) {
    if (!name.endsWith(".jsonl")) continue;
    const full = path.resolve(sessionsDir, name);
    if (knownSet.has(full)) continue;
    try {
      await unlink(full);
      console.log(`[chat:boot] removed orphan JSONL ${full}`);
    } catch (err) {
      console.warn(`[chat:boot] failed to remove orphan ${full}:`, err);
    }
  }
};
