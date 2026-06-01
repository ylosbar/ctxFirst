import type {
  ShellGateway,
  ShellRunRequest,
  ShellRunResult,
} from "../../application/ports/outbound/shell-gateway";

export type ScriptedShellResponse = Partial<ShellRunResult> & {
  /** Optional predicate to decide which request this response answers. */
  match?: (req: ShellRunRequest) => boolean;
};

export type FakeShellGateway = ShellGateway & {
  /** Push a scripted response. Consumed FIFO unless `match` is set. */
  enqueueResponse(resp: ScriptedShellResponse): void;
  /** All requests received, in order. */
  readonly invocations: ReadonlyArray<ShellRunRequest>;
  reset(): void;
};

const defaultResult = (): ShellRunResult => ({
  exitCode: 0,
  signal: null,
  stdout: "",
  stderr: "",
  truncated: { stdout: false, stderr: false },
  durationMs: 1,
});

export const createFakeShellGateway = (): FakeShellGateway => {
  const queue: ScriptedShellResponse[] = [];
  const invocations: ShellRunRequest[] = [];

  return {
    async run(req): Promise<ShellRunResult> {
      invocations.push(req);
      const idx = queue.findIndex((r) => !r.match || r.match(req));
      if (idx === -1) {
        throw new Error(
          `[fake-shell] no scripted response left for invocation #${invocations.length}: ${JSON.stringify(req.command)}`,
        );
      }
      const [resp] = queue.splice(idx, 1);
      return { ...defaultResult(), ...resp };
    },
    enqueueResponse(resp) {
      queue.push(resp);
    },
    get invocations() {
      return invocations;
    },
    reset() {
      queue.length = 0;
      invocations.length = 0;
    },
  };
};
