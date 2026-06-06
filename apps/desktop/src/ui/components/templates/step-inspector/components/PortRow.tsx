export const PortGroupLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
    {children}
  </div>
);

export const PortRow = ({
  name,
  meta,
  color,
  children,
}: {
  name: string;
  meta: string;
  /** Handle color from {@link portColor} — ties this row to its canvas handle. */
  color: string;
  children: React.ReactNode;
}) => (
  <div
    className="flex flex-col gap-1 border-l-2 pl-2"
    style={{ borderColor: color }}
  >
    <div className="flex items-baseline justify-between gap-2">
      <span className="font-mono text-xs font-semibold">{name}</span>
      <span className="text-2xs text-muted-foreground">{meta}</span>
    </div>
    {children}
  </div>
);
