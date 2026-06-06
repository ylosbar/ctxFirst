import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useT } from "@/ui/i18n";
import type { Category, CategoryId } from "../parts/categories";

type CategoryNavProps = {
  readonly categories: readonly Category[];
  readonly active: CategoryId;
  readonly onSelect: (id: CategoryId) => void;
};

const CategoryNav = ({ categories, active, onSelect }: CategoryNavProps) => {
  const t = useT();
  return (
    <nav className="flex w-56 shrink-0 flex-col gap-0.5 border-r border-border bg-sidebar px-2 py-4">
      <h3 className="px-2 pb-2 text-2xs font-semibold tracking-wide uppercase text-muted-foreground">
        {t("settings.options")}
      </h3>
      {categories.map((c) => {
        const Icon = c.icon;
        const isActive = c.id === active;
        return (
          <Button
            key={c.id}
            variant="ghost"
            size="sm"
            aria-pressed={isActive}
            onClick={() => onSelect(c.id)}
            className={cn(
              "w-full justify-start gap-2 px-2 py-1.5 text-sm",
              isActive
                ? "bg-accent text-accent-foreground hover:bg-accent"
                : "text-muted-foreground",
            )}
          >
            <Icon className="size-4" />
            <span>{c.label}</span>
          </Button>
        );
      })}
    </nav>
  );
};

export default CategoryNav;
