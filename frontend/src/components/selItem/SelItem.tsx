import type { ChangeEvent, FocusEvent, KeyboardEvent } from "react";
import { Search } from "lucide-react";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";

import { lucidePrimeBtnIcon } from "../../icons/lucide";

export type SelItemProps = {
  inputId?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
  onOpenPicker: () => void;
  invalid?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  pickerAriaLabel?: string;
};

/**
 * Generic selection field: PrimeReact InputGroup (InputText + picker button).
 */
export function SelItem({
  inputId,
  value,
  onChange,
  onBlur,
  onOpenPicker,
  invalid = false,
  disabled = false,
  placeholder,
  className,
  pickerAriaLabel,
}: SelItemProps) {
  return (
    <div className={["p-inputgroup app-sel-item", className].filter(Boolean).join(" ")}>
      <InputText
        id={inputId}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        className={invalid ? "p-invalid" : undefined}
        autoComplete="off"
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <Button
        type="button"
        icon={<Search className={lucidePrimeBtnIcon} strokeWidth={1.75} aria-hidden />}
        disabled={disabled}
        aria-label={pickerAriaLabel}
        title={pickerAriaLabel}
        onClick={onOpenPicker}
      />
    </div>
  );
}
