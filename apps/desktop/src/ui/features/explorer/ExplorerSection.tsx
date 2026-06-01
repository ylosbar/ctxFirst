import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useCollapsibleState } from "@/components/ui/use-collapsible-state";

type Props = {
  readonly title: string;
  /** Suffixe `localStorage` pour persister l'état ouvert/fermé. */
  readonly persistKey: string;
  readonly defaultOpen?: boolean;
  /** Force l'ouverture (ex: recherche active) — outrepasse l'état persisté. */
  readonly forceOpen?: boolean;
  /** Badge de comptage affiché après le titre. */
  readonly count?: number;
  /** Élément inséré entre le chevron et le titre (ex: pastille de statut). */
  readonly leading?: ReactNode;
  /** Actions révélées au survol du header (façon VSCode). */
  readonly actions?: ReactNode;
  readonly children: ReactNode;
};

/**
 * Section repliable de la sidebar, façon accordéon VSCode : header plein,
 * titre en capitales, fond contrasté, contenu masqué tant que le header n'est
 * pas ouvert. Style aligné sur les lignes denses du tree explorer
 * (cf. `TreeFolderUser`) plutôt que sur la primitive `Section` du DS, conçue
 * pour des panneaux de contenu aérés.
 */
const ExplorerSection = ({
  title,
  persistKey,
  defaultOpen = true,
  forceOpen,
  count,
  leading,
  actions,
  children,
}: Props) => {
  const { open, toggle } = useCollapsibleState({
    persistKey,
    defaultOpen,
    controlled: forceOpen ? true : undefined,
  });

  return (
    <div className="flex flex-col">
      <div className="group/section sticky top-0 z-[1] flex h-[26px] items-stretch border-b border-border bg-muted/50 backdrop-blur-sm hover:bg-muted/80">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1 pl-1.5 pr-1 text-left text-2xs font-semibold uppercase tracking-wide text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <ChevronRight
            aria-hidden
            className={cn(
              "size-3.5 shrink-0 transition-transform",
              open && "rotate-90",
            )}
          />
          {leading}
          <span className="truncate">{title}</span>
          {count !== undefined ? (
            <span className="ml-1 shrink-0 rounded-full bg-foreground/10 px-1.5 py-px text-2xs font-medium tabular-nums text-muted-foreground">
              {count}
            </span>
          ) : null}
        </button>
        {actions ? (
          <div className="flex shrink-0 items-center gap-0.5 pr-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/section:opacity-100 has-[[data-popup-open]]:opacity-100">
            {actions}
          </div>
        ) : null}
      </div>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeInOut" }}
            className="flex flex-col overflow-hidden"
          >
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

export default ExplorerSection;
