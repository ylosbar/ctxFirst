import { randomUUID } from "node:crypto";
import type { IdGenerator } from "../../application/ports/outbound/id-generator";

export const createCryptoIdGenerator = (): IdGenerator => ({
  newId: () => randomUUID(),
});
