import { Button } from "@/components/ui/button";

type OnOffToggleProps = {
  value: boolean;
  onChange: (value: boolean) => void;
  onLabel: string;
  offLabel: string;
};

const OnOffToggle = ({ value, onChange, onLabel, offLabel }: OnOffToggleProps) => (
  <div className="inline-flex rounded-md border border-border p-0.5">
    <Button
      size="xs"
      variant={value ? "default" : "ghost"}
      onClick={() => onChange(true)}
      aria-pressed={value}
    >
      {onLabel}
    </Button>
    <Button
      size="xs"
      variant={value ? "ghost" : "default"}
      onClick={() => onChange(false)}
      aria-pressed={!value}
    >
      {offLabel}
    </Button>
  </div>
);

export default OnOffToggle;
