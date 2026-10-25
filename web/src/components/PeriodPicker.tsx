import { useEffect, useRef } from "react";
import { Select, type SelectRootActions } from "@base-ui/react/select";
import { CalendarDays, Check, ChevronDown } from "lucide-react";

export type PeriodPickerProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: string[];
  disabled?: boolean;
};

/** A keyboard-accessible period menu with the same material as the toolbar. */
export default function PeriodPicker({
  value,
  onValueChange,
  options,
  disabled = false,
}: PeriodPickerProps) {
  const actions = useRef<SelectRootActions | null>(null);
  const periods = [...new Set(options)];

  useEffect(() => {
    if (disabled) actions.current?.close();
  }, [disabled]);

  return (
    <Select.Root<string>
      value={value}
      items={periods.map((period) => ({ value: period, label: period }))}
      disabled={disabled}
      modal={false}
      actionsRef={actions}
      onValueChange={(next) => {
        if (
          !disabled &&
          typeof next === "string" &&
          periods.includes(next) &&
          next !== value
        )
          onValueChange(next);
      }}
    >
      <Select.Trigger
        className="period-picker-trigger"
        aria-label="Fiscal period"
        disabled={disabled}
      >
        <CalendarDays
          className="period-picker-calendar"
          size={16}
          aria-hidden="true"
        />
        <Select.Value className="period-picker-value" />
        <Select.Icon className="period-picker-chevron">
          <ChevronDown size={15} aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          className="period-picker-positioner"
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          alignItemWithTrigger={false}
          positionMethod="fixed"
        >
          <Select.Popup className="period-picker-popup">
            <Select.List className="period-picker-list">
              {periods.map((period) => (
                <Select.Item
                  key={period}
                  value={period}
                  label={period}
                  disabled={disabled}
                  className="period-picker-option"
                >
                  <Select.ItemText>{period}</Select.ItemText>
                  <Select.ItemIndicator
                    className="period-picker-check"
                    keepMounted
                  >
                    <Check size={16} strokeWidth={2.5} aria-hidden="true" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
