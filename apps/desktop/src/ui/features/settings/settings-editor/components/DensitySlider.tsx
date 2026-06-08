import { Slider } from "@base-ui/react/slider";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type {
  DensityDescriptor,
  DensityId,
} from "@/ui/stores/appearance-store";

type DensitySliderProps = {
  density: DensityId;
  densities: readonly DensityDescriptor[];
  onSelect: (id: DensityId) => void;
};

const DensitySlider = ({ density, densities, onSelect }: DensitySliderProps) => {
  const activeIndex = Math.max(
    0,
    densities.findIndex((d) => d.id === density),
  );
  const activeDensity = densities[activeIndex];
  const lastIndex = densities.length - 1;

  return (
    <div className="flex flex-col gap-3 px-1 pt-1">
      <Slider.Root
        value={activeIndex}
        min={0}
        max={lastIndex}
        step={1}
        onValueChange={(v) => {
          const next = densities[v];
          if (next) onSelect(next.id);
        }}
      >
        <Slider.Control className="relative flex h-5 w-full touch-none items-center select-none">
          <Slider.Track className="relative h-1.5 w-full rounded-full bg-muted">
            <Slider.Indicator className="absolute h-full rounded-full bg-primary" />
            {densities.map((d, i) => (
              <span
                key={d.id}
                aria-hidden
                className={cn(
                  "absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border",
                  i <= activeIndex
                    ? "border-primary bg-primary"
                    : "border-border bg-background",
                )}
                style={{ left: `${(i / lastIndex) * 100}%` }}
              />
            ))}
          </Slider.Track>
          <Slider.Thumb className="size-4 rounded-full border-2 border-primary bg-background shadow-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />
        </Slider.Control>
      </Slider.Root>
      <div className="relative h-5 w-full">
        {densities.map((d, i) => {
          const selected = d.id === density;
          const alignClass =
            i === 0
              ? "-translate-x-0 text-left"
              : i === lastIndex
                ? "-translate-x-full text-right"
                : "-translate-x-1/2 text-center";
          return (
            <Button
              key={d.id}
              variant="ghost"
              size="xs"
              aria-pressed={selected}
              onClick={() => onSelect(d.id)}
              className={cn(
                "absolute top-0 h-auto whitespace-nowrap px-0 py-0 text-xs hover:bg-transparent",
                alignClass,
                selected
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              style={{ left: `${(i / lastIndex) * 100}%` }}
            >
              {d.label}
            </Button>
          );
        })}
      </div>
      {activeDensity && (
        <p className="text-xs text-muted-foreground">
          {activeDensity.description}
        </p>
      )}
    </div>
  );
};

export default DensitySlider;
