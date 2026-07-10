import { Check, ChevronDown } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";
import { useId } from "react";

export type SelectOption = { value: string; label: string };

export function SelectField({
  label,
  value,
  options,
  onValueChange,
  disabled,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onValueChange(value: string): void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="ui-field">
      <label id={`${id}-label`}>{label}</label>
      <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectPrimitive.Trigger className="ui-select-trigger" aria-labelledby={`${id}-label`}>
          <SelectPrimitive.Value />
          <SelectPrimitive.Icon><ChevronDown size={16} /></SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content className="ui-select-content" position="popper">
            <SelectPrimitive.Viewport>
              {options.map((option) => (
                <SelectPrimitive.Item className="ui-select-item" value={option.value} key={option.value}>
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator><Check size={14} /></SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </div>
  );
}
