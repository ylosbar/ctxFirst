/**
 * Injectable unique-id generator. Kept behind a port so tests can supply a
 * deterministic counter instead of UUIDs.
 */
export interface IdGenerator {
  /** Returns a fresh identifier (opaque string, typically a UUID v4). */
  newId(): string;
}
