/**
 * IPC handlers for the dev-log panel : capture du stdout/stderr du process
 * main et des `console.*` du renderer, streamés ligne par ligne vers la vue
 * `terminal.devlog` du bottom dock.
 *
 * Forme calquée sur ipc/system.ts — un `registerDevLogHandlers(win)` qui pose
 * les handlers + s'abonne aux signaux Electron, gardé par `isDestroyed`.
 *
 * La capture stdout/stderr est limitée au mode dev (cf. `is.dev`) ; en prod
 * on ne touche pas aux streams natifs. La console renderer est captée dans
 * les deux modes — utile comme panneau "Output" générique.
 */
import { app, type BrowserWindow, ipcMain } from "electron";
import { is } from "@electron-toolkit/utils";
import type { DevLogLine, DevLogStream } from "@shared/dev-log";

const RING_CAPACITY = 2000;

const ring: DevLogLine[] = [];
let seqCounter = 0;

const push = (line: DevLogLine): void => {
  ring.push(line);
  if (ring.length > RING_CAPACITY) ring.splice(0, ring.length - RING_CAPACITY);
};

type StreamWriter = typeof process.stdout.write;

const wrapStream = (
  stream: NodeJS.WriteStream,
  streamName: DevLogStream,
  emit: (line: DevLogLine) => void,
): (() => void) => {
  const original: StreamWriter = stream.write.bind(stream);
  let pending = "";
  const writer: StreamWriter = ((
    chunk: string | Uint8Array,
    encodingOrCb?: BufferEncoding | ((err?: Error | null) => void),
    cb?: (err?: Error | null) => void,
  ) => {
    try {
      const text =
        typeof chunk === "string"
          ? chunk
          : Buffer.from(chunk).toString("utf8");
      pending += text;
      let idx = pending.indexOf("\n");
      while (idx !== -1) {
        const rawLine = pending.slice(0, idx);
        pending = pending.slice(idx + 1);
        // Drop trailing \r so CRLF on Windows doesn't leave an artefact.
        const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
        const entry: DevLogLine = {
          seq: ++seqCounter,
          stream: streamName,
          text: line,
          at: Date.now(),
        };
        push(entry);
        emit(entry);
        idx = pending.indexOf("\n");
      }
    } catch {
      /* never let the wrapper crash the original write */
    }
    return original(
      chunk as never,
      encodingOrCb as never,
      cb as never,
    );
  }) as StreamWriter;
  stream.write = writer;
  return () => {
    if (stream.write === writer) stream.write = original;
  };
};

export const registerDevLogHandlers = (win: BrowserWindow): void => {
  const emit = (line: DevLogLine): void => {
    if (!win.isDestroyed()) {
      win.webContents.send("devlog:line", line);
    }
  };

  const restorers: Array<() => void> = [];
  if (is.dev) {
    restorers.push(wrapStream(process.stdout, "stdout", emit));
    restorers.push(wrapStream(process.stderr, "stderr", emit));
  }

  // Console renderer — `webContents.on('console-message', …)` keeps the
  // legacy `(event, level, message, line, sourceId)` shape in Electron 34.
  // Map levels → stream so warning/error show as stderr.
  win.webContents.on("console-message", (_event, level, message) => {
    const streamName: DevLogStream = level >= 2 ? "stderr" : "renderer";
    const entry: DevLogLine = {
      seq: ++seqCounter,
      stream: streamName,
      text: message,
      at: Date.now(),
    };
    push(entry);
    emit(entry);
  });

  ipcMain.handle("devlog:getBuffer", (): DevLogLine[] => ring.slice());

  app.once("will-quit", () => {
    for (const restore of restorers) restore();
  });

  console.log("[devlog:ipc] handlers registered");
};
