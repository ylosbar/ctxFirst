import { useEffect, useRef } from "react";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import "./terminal.css";
import { useServices } from "@/ui/di/services-provider";
import { useActiveTheme } from "@/ui/stores/appearance-store";
import type { DevLogLine } from "@/application/ports/dev-log-gateway";

// Derive the xterm palette from the workbench theme tokens on :root so the
// terminal tracks the active app theme (light/dark + named variants) instead
// of a fixed palette. The appearance store keeps these CSS vars in sync; the
// hardcoded values only serve as a fallback when a var is unset.
const readTerminalTheme = (): ITheme => {
  if (typeof document === "undefined") {
    return { background: "#0b0d11", foreground: "#d6deeb", cursor: "#d6deeb" };
  }
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fb: string) =>
    cs.getPropertyValue(name).trim() || fb;
  const foreground = v("--foreground", "#d6deeb");
  return {
    background: v("--background", "#0b0d11"),
    foreground,
    cursor: foreground,
  };
};

// Read-only xterm host : pre-populates the scrollback from the main-process
// ring buffer, then streams every new line through the DevLogGateway. State
// for the terminal lives outside React (xterm owns the DOM); we only re-mount
// the instance when the component unmounts.
const TerminalView = () => {
  const { devLogGateway } = useServices();
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const activeTheme = useActiveTheme();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      convertEol: true,
      disableStdin: true,
      cursorBlink: false,
      cursorStyle: "bar",
      fontSize: 13,
      fontFamily:
        '"JetBrains Mono","Fira Code",ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace',
      scrollback: 5000,
      theme: readTerminalTheme(),
    });
    termRef.current = term;
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    try {
      fit.fit();
    } catch {
      /* container might be 0×0 if hidden; ResizeObserver retries later */
    }

    let lastSeq = -1;
    const write = (line: DevLogLine): void => {
      if (line.seq <= lastSeq) return;
      lastSeq = line.seq;
      term.writeln(line.text);
    };

    let unsubscribed = false;
    const unsub = devLogGateway.subscribe((line) => {
      if (!unsubscribed) write(line);
    });
    devLogGateway
      .getBuffer()
      .then((lines) => {
        if (unsubscribed) return;
        for (const line of lines) write(line);
      })
      .catch(() => {
        /* ignore — getBuffer failure just leaves the scrollback empty */
      });

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* noop */
      }
    });
    ro.observe(host);

    return () => {
      unsubscribed = true;
      unsub();
      ro.disconnect();
      term.dispose();
      termRef.current = null;
    };
  }, [devLogGateway]);

  // Re-skin the live terminal when the active theme changes (including the
  // hover preview from the theme picker). The store has already pushed the new
  // tokens onto :root, so we just re-read them.
  useEffect(() => {
    const term = termRef.current;
    if (term) term.options.theme = readTerminalTheme();
  }, [activeTheme]);

  return (
    <div
      ref={hostRef}
      className="h-full w-full overflow-hidden px-2 py-1"
      style={{ backgroundColor: "var(--background)" }}
    />
  );
};

export default TerminalView;
