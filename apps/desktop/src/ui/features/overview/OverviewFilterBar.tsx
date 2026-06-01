import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { cn } from "@/lib/utils";
import {
  OVERVIEW_COLUMN_LABEL,
  OVERVIEW_COLUMN_ORDER,
} from "./build-overview-board";
import type { OverviewColumnId } from "./overview-types";

export type TemplateOption = {
  readonly ref: string;
  readonly name: string;
};

type ChipProps = {
  readonly label: string;
  readonly active: boolean;
  readonly onClick: () => void;
};

const FilterChip = ({ label, active, onClick }: ChipProps) => (
  <Badge
    size="sm"
    tone={active ? "info" : undefined}
    variant={active ? undefined : "outline"}
    className={cn(
      "cursor-pointer select-none",
      active ? "" : "opacity-50 hover:opacity-100",
    )}
    render={<button type="button" aria-pressed={active} onClick={onClick} />}
  >
    {label}
  </Badge>
);

const groupLabel = (text: string) => (
  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
    {text}
  </span>
);

type Props = {
  readonly templates: ReadonlyArray<TemplateOption>;
  readonly templateFilter: ReadonlySet<string>;
  readonly statusFilter: ReadonlySet<OverviewColumnId>;
  readonly query: string;
  readonly onToggleTemplate: (ref: string) => void;
  readonly onToggleStatus: (id: OverviewColumnId) => void;
  readonly onQueryChange: (value: string) => void;
  readonly onClear: () => void;
};

const OverviewFilterBar = ({
  templates,
  templateFilter,
  statusFilter,
  query,
  onToggleTemplate,
  onToggleStatus,
  onQueryChange,
  onClear,
}: Props) => {
  const hasActive =
    templateFilter.size > 0 || statusFilter.size > 0 || query.trim() !== "";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-3 py-2">
      <div className="flex flex-wrap items-center gap-1">
        {groupLabel("Statut")}
        {OVERVIEW_COLUMN_ORDER.map((id) => (
          <FilterChip
            key={id}
            label={OVERVIEW_COLUMN_LABEL[id]}
            active={statusFilter.has(id)}
            onClick={() => onToggleStatus(id)}
          />
        ))}
      </div>
      {templates.length > 0 ? (
        <>
          <div className="h-4 w-px bg-border" />
          <div className="flex flex-wrap items-center gap-1">
            {groupLabel("Template")}
            {templates.map((t) => (
              <FilterChip
                key={t.ref}
                label={t.name}
                active={templateFilter.has(t.ref)}
                onClick={() => onToggleTemplate(t.ref)}
              />
            ))}
          </div>
        </>
      ) : null}
      <div className="ml-auto flex items-center gap-2">
        <SearchInput
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Rechercher…"
          className="w-48"
        />
        {hasActive ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={onClear}
          >
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
};

export default OverviewFilterBar;
