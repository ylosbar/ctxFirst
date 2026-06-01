import os from "node:os";
import { describe, expect, it } from "vitest";
import { createChildProcessShellGateway } from "./child-process";

const isLinux = process.platform === "linux" || process.platform === "darwin";

describe("createChildProcessShellGateway", () => {
  it("captures stdout and exit code for a simple command", async () => {
    if (!isLinux) return;
    const gw = createChildProcessShellGateway();
    const result = await gw.run({
      command: ["sh", "-c", "echo hello"],
      useShell: false,
      cwd: os.tmpdir(),
      env: { PATH: process.env.PATH ?? "" },
      timeoutMs: 5_000,
      maxOutputBytes: 64 * 1024,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("hello");
    expect(result.stderr).toBe("");
  });

  it("propagates a non-zero exit code without throwing", async () => {
    if (!isLinux) return;
    const gw = createChildProcessShellGateway();
    const result = await gw.run({
      command: "exit 7",
      useShell: true,
      cwd: os.tmpdir(),
      env: { PATH: process.env.PATH ?? "" },
      timeoutMs: 5_000,
      maxOutputBytes: 64 * 1024,
    });
    expect(result.exitCode).toBe(7);
  });

  it("times out and reports exit code 'timeout'", async () => {
    if (!isLinux) return;
    const gw = createChildProcessShellGateway();
    const started = Date.now();
    const result = await gw.run({
      command: "sleep 30",
      useShell: true,
      cwd: os.tmpdir(),
      env: { PATH: process.env.PATH ?? "" },
      timeoutMs: 200,
      maxOutputBytes: 64 * 1024,
    });
    expect(result.exitCode).toBe("timeout");
    // SIGTERM at 200ms + KILL_GRACE 2s = ~2.2s nominal. Slow CI runners can
    // overshoot — assert only that the kill mechanism fired before the 30s
    // natural runtime, i.e. the timeout actually shortcut the wait.
    expect(Date.now() - started).toBeLessThan(20_000);
  }, 25_000);

  it("truncates stdout beyond maxOutputBytes", async () => {
    if (!isLinux) return;
    const gw = createChildProcessShellGateway();
    const result = await gw.run({
      // ~1KB of output
      command: "for i in $(seq 1 200); do printf '0123456789'; done",
      useShell: true,
      cwd: os.tmpdir(),
      env: { PATH: process.env.PATH ?? "" },
      timeoutMs: 5_000,
      maxOutputBytes: 256,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.length).toBe(256);
    expect(result.truncated.stdout).toBe(true);
  });

  it("pipes stdin to the child", async () => {
    if (!isLinux) return;
    const gw = createChildProcessShellGateway();
    const result = await gw.run({
      command: "cat",
      useShell: true,
      cwd: os.tmpdir(),
      env: { PATH: process.env.PATH ?? "" },
      timeoutMs: 5_000,
      maxOutputBytes: 64 * 1024,
      stdin: "piped\n",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("piped");
  });
});
