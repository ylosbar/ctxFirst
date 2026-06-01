import { type Usage } from "../../domain/chat";

const formatTokens = (n: number): string => {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
};

const ContextTimelineCell = ({
  usage,
  maxContext,
}: {
  usage?: Usage;
  maxContext: number;
}) => {
  const ctx = usage
    ? usage.input + (usage.cacheRead ?? 0) + (usage.cacheCreate ?? 0)
    : 0;
  const pct =
    usage && maxContext > 0 ? Math.min(100, (ctx / maxContext) * 100) : 0;

  return (
    <div
      className="relative w-20 shrink-0 self-stretch pl-3"
      aria-hidden={!usage}
    >
      <div className="absolute inset-y-0 left-0 w-px bg-border" />
      {usage && (
        <div className="flex h-full flex-col justify-center gap-1">
          <div className="flex items-center gap-1.5">
            <div className="size-1.5 shrink-0 rounded-full bg-primary" />
            <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-primary"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <span
            className="pl-3 font-mono text-xl leading-none text-muted-foreground"
            title={`Context: ${ctx.toLocaleString()} tokens`}
          >
            {formatTokens(ctx)}
          </span>
        </div>
      )}
    </div>
  );
};

export default ContextTimelineCell;
