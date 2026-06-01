import type { DevLogGateway } from "../../application/ports/dev-log-gateway";

export const createElectronDevLogGateway = (): DevLogGateway => ({
  async getBuffer() {
    return window.api.devLog.getBuffer();
  },
  subscribe(onLine) {
    return window.api.devLog.onLine(onLine);
  },
});
