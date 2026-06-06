import { Checkbox } from "@/components/ui/checkbox";
import { FormLabel } from "@/components/ui/form-label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { McpToolParamInfo } from "@/application/ports/settings-gateway";

type McpToolPlaygroundFieldProps = {
  param: McpToolParamInfo;
  value: string;
  onChange: (next: string) => void;
};

const McpToolPlaygroundField = ({
  param,
  value,
  onChange,
}: McpToolPlaygroundFieldProps) => {
  const label = (
    <FormLabel className="text-2xs">
      <span className="font-mono">{param.name}</span>
      {!param.optional && <span className="text-destructive"> *</span>}
    </FormLabel>
  );

  if (param.kind === "boolean") {
    return (
      <div className="flex items-center gap-2">
        <Checkbox
          checked={value === "true"}
          onCheckedChange={(checked) => onChange(checked ? "true" : "false")}
        />
        {label}
      </div>
    );
  }

  if (param.kind === "json") {
    return (
      <div className="flex flex-col gap-1">
        {label}
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={6}
          placeholder="{}"
          className="font-mono text-xs"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {label}
      <Input
        type={param.kind === "number" ? "number" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
};

export default McpToolPlaygroundField;
