import { type ReactNode } from "react";

type SettingRowProps = {
  readonly title: string;
  readonly description?: ReactNode;
  readonly children: ReactNode;
};

const SettingRow = ({ title, description, children }: SettingRowProps) => {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-border pb-4 last:border-b-0 last:pb-0">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm font-medium">{title}</p>
        {description && (
          <div className="text-xs text-muted-foreground">{description}</div>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
};

export default SettingRow;
