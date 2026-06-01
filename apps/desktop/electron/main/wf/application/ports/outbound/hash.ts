/**
 * Outbound port for cryptographic hashing. Keeps the domain pure: the
 * "what" (SHA-256 of a sequence of strings) lives in the application/domain,
 * the "how" (Node's `crypto`, WebCrypto, …) is provided by an adapter.
 */
export interface HashPort {
  /**
   * Returns the lowercase-hex SHA-256 digest of the concatenation of the
   * provided parts. Implementations MUST be deterministic and stable across
   * processes — the digest is used as a cache / correlation key.
   */
  sha256(parts: ReadonlyArray<string>): string;
}
