import JsonViewLib from "@uiw/react-json-view";
import { lightTheme } from "@uiw/react-json-view/light";
import { darkTheme } from "@uiw/react-json-view/dark";
import { useThemeVariant } from "../stores/appearance-store";

const tryParseJson = (s: string): unknown => {
  const trimmed = s.trim();
  if (trimmed.length === 0) return undefined;
  const first = trimmed[0];
  if (first !== "{" && first !== "[") return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
};

const isObjectOrArray = (v: unknown): v is object =>
  typeof v === "object" && v !== null;

const TextFallback = ({ text }: { text: string }) => (
  <pre className="m-0 whitespace-pre-wrap break-words px-2.5 py-2 font-mono text-xs leading-snug">
    {text}
  </pre>
);

type Props = {
  value: unknown;
  collapsed?: boolean | number;
};

const JsonView = ({ value, collapsed = 2 }: Props) => {
  const variant = useThemeVariant();
  const theme = variant === "dark" ? darkTheme : lightTheme;

  let displayValue: unknown = value;
  if (typeof value === "string") {
    const parsed = tryParseJson(value);
    if (parsed === undefined) return <TextFallback text={value} />;
    displayValue = parsed;
  }

  if (!isObjectOrArray(displayValue)) {
    return <TextFallback text={String(displayValue)} />;
  }

  return (
    <div className="px-2.5 py-2 text-xs">
      <JsonViewLib
        value={displayValue}
        style={{ ...theme, backgroundColor: "transparent" }}
        collapsed={collapsed}
        displayDataTypes={false}
        displayObjectSize
        enableClipboard
        indentWidth={12}
      />
    </div>
  );
};

export default JsonView;
