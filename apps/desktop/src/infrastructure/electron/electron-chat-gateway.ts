import type { ChatGateway } from "../../application/ports/chat-gateway";

export const createElectronChatGateway = (): ChatGateway => ({
  listSessions() {
    return window.api.chat.listSessions();
  },
  createSession(args) {
    return window.api.chat.createSession(args);
  },
  openSession(id) {
    return window.api.chat.openSession(id);
  },
  setSessionModel(args) {
    return window.api.chat.setSessionModel(args);
  },
  closeSession(id) {
    return window.api.chat.closeSession(id);
  },
  deleteSession(id) {
    return window.api.chat.deleteSession(id);
  },
  sendMessage(args) {
    return window.api.chat.sendMessage(args);
  },
  abortSession(sessionId) {
    return window.api.chat.abortSession(sessionId);
  },
  respondToolConfirmation(args) {
    return window.api.chat.respondToolConfirmation(args);
  },
  subscribe(listener) {
    return window.api.chat.onEvent((event) => listener(event));
  },
});
