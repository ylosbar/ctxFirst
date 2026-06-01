import { Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ExitCodeValue = number | "timeout";

export type ExitCodesConfig = Readonly<
  Record<string, ReadonlyArray<ExitCodeValue> | "*">
>;

type Row = {
  /** Stable identity across re-renders — survives renames + reorders. */
  id: string;
  name: string;
  /** Raw text the user typed for the exit codes column. */
  codesText: string;
  /** When true, this row carries the `"*"` catch-all sentinel. */
  isCatchAll: boolean;
};

type Props = {
  value: ExitCodesConfig;
  onChange: (next: ExitCodesConfig) => void;
};

const PORT_NAME_RE = /^[a-z][a-z0-9_-]{0,31}$/;
const RESERVED_PORT_NAMES = new Set(["stdout", "stderr"]);

/**
 * Parses a free-text exit-codes cell. Accepts comma / whitespace separated
 * integers and the literal `"timeout"` token. Empty / unparseable input
 * returns `{ values: [], errors: [...] }` so the caller can flag the row.
 */
const parseCodesCell = (
  text: string,
): { values: ExitCodeValue[]; errors: string[] } => {
  const tokens = text
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const values: ExitCodeValue[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const tok of tokens) {
    if (seen.has(tok)) {
      errors.push(`code "${tok}" listed twice`);
      continue;
    }
    seen.add(tok);
    if (tok === "timeout") {
      values.push("timeout");
      continue;
    }
    const n = Number(tok);
    if (!Number.isInteger(n) || n < -128 || n > 255) {
      errors.push(`"${tok}" is not a valid exit code`);
      continue;
    }
    values.push(n);
  }
  return { values, errors };
};

const formatCodesCell = (codes: ReadonlyArray<ExitCodeValue> | "*"): string => {
  if (codes === "*") return "";
  return codes.map((c) => String(c)).join(", ");
};

const newRowId = (() => {
  let n = 0;
  return () => `row-${++n}`;
})();

const configToRows = (cfg: ExitCodesConfig): Row[] =>
  Object.entries(cfg).map(([name, codes]) => ({
    id: newRowId(),
    name,
    codesText: formatCodesCell(codes),
    isCatchAll: codes === "*",
  }));

type ValidationResult =
  | { kind: "ok"; config: ExitCodesConfig }
  | {
      kind: "errors";
      rowErrors: Map<string, string>;
      globalError: string | null;
    };

/**
 * Validates the row set against the same rules `parseExitCodes` enforces
 * server-side (cf. `shell-exec.ts`): port name shape, uniqueness, no reserved
 * names, exactly one catch-all, no duplicate codes across rows. Returns the
 * normalised `ExitCodesConfig` when clean, otherwise per-row + global error
 * messages so the editor can surface them inline.
 */
const validateRows = (rows: ReadonlyArray<Row>): ValidationResult => {
  const rowErrors = new Map<string, string>();
  let globalError: string | null = null;

  if (rows.length < 2) globalError = "Au moins 2 ports requis.";

  const seenNames = new Set<string>();
  const seenCodes = new Map<string, string>(); // code → first row id
  let catchAllCount = 0;

  for (const row of rows) {
    const name = row.name.trim();
    if (!PORT_NAME_RE.test(name)) {
      rowErrors.set(
        row.id,
        "Nom invalide (lettres minuscules, chiffres, _ ou -, max 32).",
      );
    } else if (RESERVED_PORT_NAMES.has(name)) {
      rowErrors.set(row.id, `"${name}" est réservé (stdout / stderr).`);
    } else if (seenNames.has(name)) {
      rowErrors.set(row.id, `Nom "${name}" déjà utilisé.`);
    } else {
      seenNames.add(name);
    }

    if (row.isCatchAll) {
      catchAllCount += 1;
      continue;
    }

    const { values, errors } = parseCodesCell(row.codesText);
    if (errors.length > 0) {
      const existing = rowErrors.get(row.id);
      rowErrors.set(row.id, existing ?? errors.join(" — "));
      continue;
    }
    if (values.length === 0) {
      if (!rowErrors.has(row.id)) {
        rowErrors.set(row.id, "Au moins un exit code requis.");
      }
      continue;
    }
    for (const v of values) {
      const key = String(v);
      const prior = seenCodes.get(key);
      if (prior !== undefined && prior !== row.id) {
        const msg = `Code ${key} déjà mappé sur un autre port.`;
        if (!rowErrors.has(row.id)) rowErrors.set(row.id, msg);
      } else {
        seenCodes.set(key, row.id);
      }
    }
  }

  if (catchAllCount === 0) {
    globalError = globalError ?? "Un port catch-all (★) est obligatoire.";
  } else if (catchAllCount > 1) {
    globalError = "Un seul catch-all autorisé.";
  }

  if (rowErrors.size > 0 || globalError) {
    return { kind: "errors", rowErrors, globalError };
  }

  const out: Record<string, ReadonlyArray<ExitCodeValue> | "*"> = {};
  for (const row of rows) {
    const name = row.name.trim();
    if (row.isCatchAll) {
      out[name] = "*";
    } else {
      out[name] = parseCodesCell(row.codesText).values;
    }
  }
  return { kind: "ok", config: out };
};

const ShellExecExitCodeEditor = ({ value, onChange }: Props) => {
  const headingId = useId();
  const [rows, setRows] = useState<Row[]>(() => configToRows(value));

  // Push validated changes upward. Local state is the source of truth for
  // raw input; `onChange` fires only when validation passes — invalid edits
  // stay visible in the UI without writing a broken config to the step.
  useEffect(() => {
    const result = validateRows(rows);
    if (result.kind === "ok") {
      onChange(result.config);
    }
    // We deliberately depend on `rows` only — `onChange` identity from
    // parents (which build it inline) would re-trigger on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const validation = useMemo(() => validateRows(rows), [rows]);

  const setRow = (id: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const promoteCatchAll = (id: string) => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        isCatchAll: r.id === id,
        // Clear the codes cell of the new catch-all so we don't leave stale
        // text behind (it would be ignored anyway).
        codesText: r.id === id ? "" : r.codesText,
      })),
    );
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { id: newRowId(), name: "", codesText: "", isCatchAll: false },
    ]);
  };

  const rowErrors =
    validation.kind === "errors" ? validation.rowErrors : new Map();
  const globalError =
    validation.kind === "errors" ? validation.globalError : null;

  return (
    <div className="flex flex-col gap-2" aria-labelledby={headingId}>
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-1.5 text-center font-medium">★</th>
              <th className="px-2 py-1.5 text-left font-medium">Port</th>
              <th className="px-2 py-1.5 text-left font-medium">Exit codes</th>
              <th className="w-8 px-2 py-1.5" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rowError = rowErrors.get(row.id);
              return (
                <tr
                  key={row.id}
                  className={cn(
                    "border-t",
                    rowError ? "bg-destructive/5" : undefined,
                  )}
                >
                  <td className="px-2 py-1 text-center align-middle">
                    <input
                      type="radio"
                      name="shell-exec-exit-codes-catchall"
                      checked={row.isCatchAll}
                      onChange={() => promoteCatchAll(row.id)}
                      aria-label="Définir ce port comme catch-all"
                    />
                  </td>
                  <td className="px-2 py-1 align-middle">
                    <Input
                      className="h-7 font-mono"
                      value={row.name}
                      placeholder="ok"
                      onChange={(e) =>
                        setRow(row.id, { name: e.target.value })
                      }
                    />
                  </td>
                  <td className="px-2 py-1 align-middle">
                    {row.isCatchAll ? (
                      <span className="text-xs italic text-muted-foreground">
                        catch-all (tout exit code non listé)
                      </span>
                    ) : (
                      <Input
                        className="h-7 font-mono"
                        value={row.codesText}
                        placeholder="0, 1, timeout"
                        onChange={(e) =>
                          setRow(row.id, { codesText: e.target.value })
                        }
                      />
                    )}
                  </td>
                  <td className="px-1 py-1 align-middle">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => removeRow(row.id)}
                      disabled={rows.length <= 2}
                      aria-label="Supprimer le port"
                    >
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          <span>
            Conventions usuelles : <code>ls</code> = 0/1/2,{" "}
            <code>grep</code> = 0/1/2, <code>diff</code> = 0/1/2.
          </span>
          <span>
            Séparer plusieurs codes par une virgule. Le token{" "}
            <code>timeout</code> est autorisé.
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addRow}
        >
          <Plus />
          Ajouter un port
        </Button>
      </div>
      {globalError ? (
        <Callout tone="danger">{globalError}</Callout>
      ) : null}
      {rowErrors.size > 0 && !globalError ? (
        <Callout tone="warning">
          Corriger les lignes en rouge pour appliquer le mapping.
        </Callout>
      ) : null}
    </div>
  );
};

export default ShellExecExitCodeEditor;
