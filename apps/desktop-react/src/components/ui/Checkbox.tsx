import { Check } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";

export function Checkbox({
  checked,
  onCheckedChange,
  disabled,
  label,
  description,
}: {
  checked: boolean;
  onCheckedChange(checked: boolean): void;
  disabled?: boolean;
  label: string;
  description?: string;
}) {
  return (
    <label className="ui-checkbox-row" data-disabled={disabled || undefined}>
      <CheckboxPrimitive.Root
        className="ui-checkbox"
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      >
        <CheckboxPrimitive.Indicator className="ui-checkbox-indicator">
          <Check size={14} />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <span className="ui-checkbox-copy">
        <span>{label}</span>
        {description ? <small>{description}</small> : null}
      </span>
    </label>
  );
}
