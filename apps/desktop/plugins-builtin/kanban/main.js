// Kanban plugin — main half. Two IPC methods backed by a single JSON file
// under `<userData>/plugins-data/kanban/board.json`. All board state lives in
// the renderer; main is dumb storage + a one-shot migration hook.

const FILE = "board.json";

const newId = () => {
  // crypto.randomUUID is available in modern Node (>= 19) and is what the
  // renderer uses too. Falls back to a low-entropy id if it isn't present.
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

const CURRENT_VERSION = 3;

const emptyBoard = () => ({
  version: CURRENT_VERSION,
  columns: [
    { id: newId(), title: "To do", ticketIds: [] },
    { id: newId(), title: "In progress", ticketIds: [] },
    { id: newId(), title: "Done", ticketIds: [] },
  ],
  tickets: {},
});

const migrate = (raw) => {
  if (!raw || typeof raw !== "object") {
    throw new Error("board.json is not an object");
  }
  let board = raw;
  if (board.version === 1) {
    // v1 → v2: tickets gain an optional `type` field. Existing tickets stay
    // untyped (no `type`), so the upgrade is a pure version bump.
    board = { ...board, version: 2 };
  }
  if (board.version === 2) {
    // v2 → v3: tickets gain an optional `priority` field. Existing tickets stay
    // unprioritised (no `priority`), so the upgrade is a pure version bump.
    board = { ...board, version: 3 };
  }
  if (board.version === CURRENT_VERSION) return board;
  throw new Error(`board.json version ${board.version} is not supported`);
};

const isValidBoard = (raw) =>
  raw &&
  typeof raw === "object" &&
  raw.version === CURRENT_VERSION &&
  Array.isArray(raw.columns) &&
  raw.tickets &&
  typeof raw.tickets === "object";

exports.onload = async (api) => {
  if (!api.fs) {
    throw new Error("kanban plugin needs the 'fs:read' and 'fs:write' permissions");
  }

  api.registerIpcHandler("load-board", async () => {
    try {
      const raw = await api.fs.readFile(FILE);
      const parsed = JSON.parse(raw);
      return migrate(parsed);
    } catch (err) {
      // The plugin's main.js runs in-process — Node's original ENOENT is
      // preserved on `err.code`, no IPC envelope to strip.
      if (err && err.code === "ENOENT") {
        return emptyBoard();
      }
      throw err;
    }
  });

  api.registerIpcHandler("save-board", async (board) => {
    if (!isValidBoard(board)) {
      throw new Error("save-board: invalid board shape");
    }
    await api.fs.writeFile(FILE, JSON.stringify(board, null, 2));
    return { ok: true };
  });

  api.log.info(`loaded — board persisted at ${api.pluginDataDir}/${FILE}`);
};

exports.onunload = (api) => {
  api.log.info("unloading");
};
