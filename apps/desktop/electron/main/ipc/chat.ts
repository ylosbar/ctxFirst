/**
 * IPC handlers du chat global piloté par Pi. Pattern identique aux autres
 * domaines (wf, settings, …) : `invoke` pour les opérations unaires, et
 * un canal push `chat:event` pour le streaming des deltas / tool calls /
 * fin de session.
 *
 * Les événements de session Pi sont fan-outés à *toute* fenêtre vivante :
 * en pratique on n'a qu'une `BrowserWindow`, mais ça évite un binding par
 * fenêtre + simplifie le contrat (l'UI filtre par `sessionId`).
 */
import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import type { ChatService } from "../chat/chat-service";
import type { ChatEvent } from "../chat/chat-event-types";
import type { ChatViewContextSnapshot } from "../chat/domain/chat-session";

type CreateArgs = {
  initialContext: ChatViewContextSnapshot | null;
  model: string;
  title?: string;
};
type SendArgs = {
  sessionId: string;
  userMessage: string;
  liveContext: ChatViewContextSnapshot | null;
};
type IdArgs = { id: string };
type SessionIdArgs = { sessionId: string };

const short = (s: string | undefined, n = 8) => (s ? s.slice(0, n) : "-");

export const registerChatHandlers = (win: BrowserWindow, chat: ChatService) => {
  const send = (payload: ChatEvent) => {
    if (win.isDestroyed()) return;
    win.webContents.send("chat:event", payload);
  };

  ipcMain.handle("chat:listSessions", async () => {
    return chat.listSessions();
  });

  ipcMain.handle("chat:createSession", async (_e: IpcMainInvokeEvent, args: CreateArgs) => {
    console.log(`[chat:ipc] createSession model=${args.model}`);
    const session = await chat.createSession(args);
    console.log(`[chat:ipc] createSession → ${short(session.id)}`);
    return session;
  });

  ipcMain.handle("chat:openSession", async (_e, args: IdArgs) => {
    console.log(`[chat:ipc] openSession ${short(args.id)}`);
    return chat.openSession(args.id, send);
  });

  ipcMain.handle(
    "chat:setSessionModel",
    async (_e, args: { sessionId: string; model: string }) => {
      console.log(
        `[chat:ipc] setSessionModel ${short(args.sessionId)} model=${args.model}`,
      );
      return chat.setSessionModel(args);
    },
  );

  ipcMain.handle("chat:closeSession", async (_e, args: IdArgs) => {
    console.log(`[chat:ipc] closeSession ${short(args.id)}`);
    await chat.closeSession(args.id);
  });

  ipcMain.handle("chat:deleteSession", async (_e, args: IdArgs) => {
    console.log(`[chat:ipc] deleteSession ${short(args.id)}`);
    await chat.deleteSession(args.id);
  });

  ipcMain.handle("chat:sendMessage", async (_e, args: SendArgs) => {
    console.log(
      `[chat:ipc] sendMessage session=${short(args.sessionId)} len=${args.userMessage.length}`,
    );
    await chat.sendMessage(args);
  });

  ipcMain.handle("chat:abortSession", async (_e, args: SessionIdArgs) => {
    console.log(`[chat:ipc] abortSession ${short(args.sessionId)}`);
    await chat.abortSession(args.sessionId);
  });

  ipcMain.handle(
    "chat:respondToolConfirmation",
    async (
      _e,
      args: { sessionId: string; toolCallId: string; approved: boolean },
    ) => {
      console.log(
        `[chat:ipc] respondToolConfirmation session=${short(args.sessionId)} ` +
          `toolCall=${short(args.toolCallId)} approved=${args.approved}`,
      );
      await chat.respondToolConfirmation(args);
    },
  );

  console.log("[chat:ipc] handlers registered");
};
