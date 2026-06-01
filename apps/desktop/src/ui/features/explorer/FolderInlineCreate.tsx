import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Folder } from "lucide-react";

type Props = {
  readonly depth: number;
  readonly onSubmit: (name: string) => Promise<void> | void;
  readonly onCancel: () => void;
};

const FolderInlineCreate = ({ depth, onSubmit, onCancel }: Props) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async () => {
    const v = value.trim();
    if (!v) {
      onCancel();
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(v);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <>
      <div
        style={{ paddingInlineStart: 8 + depth * 12 }}
        className="flex h-7 items-center gap-1.5 pr-2"
      >
        <span aria-hidden className="h-3.5 w-3.5 shrink-0" />
        <Folder
          aria-hidden
          className="size-3.5 shrink-0 text-muted-foreground"
        />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => void submit()}
          onKeyDown={onKeyDown}
          disabled={submitting}
          maxLength={80}
          placeholder="Nom du dossier"
          className="min-w-0 flex-1 rounded-sm border border-border bg-background px-1 text-xs outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      {errorMessage ? (
        <div
          style={{ paddingInlineStart: 8 + (depth + 1) * 12 }}
          className="py-0.5 pr-2 text-2xs text-destructive"
        >
          {errorMessage}
        </div>
      ) : null}
    </>
  );
};

export default FolderInlineCreate;
