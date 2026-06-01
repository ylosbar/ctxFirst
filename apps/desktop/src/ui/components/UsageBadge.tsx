import { Badge } from "../../components/ui/badge";
import { totalTokens, type Usage } from "../../domain/chat";
import { cn } from "@/lib/utils";

const formatTokens = (n: number): string => {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
};

const UsageBadge = ({
  usage,
  label,
  className,
}: {
  usage: Usage;
  label?: string;
  className?: string;
}) => {
  const total = totalTokens(usage);
  const cache = (usage.cacheCreate ?? 0) + (usage.cacheRead ?? 0);
  const detail = cache > 0
    ? `in ${formatTokens(usage.input)} · out ${formatTokens(usage.output)} · cache ${formatTokens(cache)}`
    : `in ${formatTokens(usage.input)} · out ${formatTokens(usage.output)}`;
  return (
    <Badge
      variant="ghost"
      size="sm"
      font="mono"
      title={detail}
      className={cn("text-muted-foreground", className)}
    >
      {label && <span>{label}</span>}
      <span>{formatTokens(total)} tok</span>
    </Badge>
  );
};

export default UsageBadge;
