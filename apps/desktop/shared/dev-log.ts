/**
 * Types partagés main ↔ renderer pour le panneau « dev log » : capture des
 * logs du process main (stdout/stderr) + des `console.*` du renderer, streamés
 * via IPC et rendus dans le terminal read-only du bottom dock.
 */

export type DevLogStream = "stdout" | "stderr" | "renderer";

export type DevLogLine = {
  readonly seq: number;
  readonly stream: DevLogStream;
  readonly text: string;
  readonly at: number;
};
