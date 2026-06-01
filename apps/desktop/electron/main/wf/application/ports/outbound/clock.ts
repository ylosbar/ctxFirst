/**
 * Injectable clock — never call `new Date()` directly in the domain or
 * application layers. Use this port so tests can freeze time.
 */
export interface ClockPort {
  /** Current instant formatted as ISO-8601 string. */
  now(): string;
}
