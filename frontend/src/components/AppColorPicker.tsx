import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { ColorPicker } from "primereact/colorpicker";

import {
  PRIME_COLOR_FAVORITES,
  colorsEqualHex,
  pickerValueFromStored,
  storedFromPickerValue,
} from "../lib/colorHex";
import { overlayAppendTo } from "../lib/overlayAppendTo";

type AppColorPickerProps = {
  /** Stored color including `#`, e.g. `#3b82f6`. */
  value: string;
  onChange: (colorHex: string) => void;
  inputId?: string;
  disabled?: boolean;
  showHex?: boolean;
  className?: string;
};

export function AppColorPicker({
  value,
  onChange,
  inputId,
  disabled = false,
  showHex = true,
  className = "",
}: AppColorPickerProps) {
  const { t } = useTranslation();
  const colorHex = storedFromPickerValue(value);

  return (
    <div className={`app-color-picker ${className}`.trim()}>
      <div className="app-color-picker__row">
        <span
          className="app-color-picker__swatch-wrap"
          style={{ "--app-color-swatch": colorHex } as CSSProperties}
        >
          <ColorPicker
            inputId={inputId}
            className="app-color-picker__prime"
            format="hex"
            value={pickerValueFromStored(colorHex)}
            disabled={disabled}
            appendTo={overlayAppendTo}
            onChange={(e) => {
              const raw = typeof e.value === "string" ? e.value : "";
              onChange(storedFromPickerValue(raw));
            }}
          />
        </span>
        {showHex ? (
          <span className="app-color-picker__hex font-mono text-sm text-on-surface-variant">
            {colorHex}
          </span>
        ) : null}
      </div>
      <div className="app-color-picker__favorites" role="list" aria-label={t("colorPicker.favorites")}>
        <span className="app-color-picker__favorites-label">{t("colorPicker.favorites")}</span>
        <div className="app-color-picker__favorites-swatches">
          {PRIME_COLOR_FAVORITES.map((fav) => {
            const selected = colorsEqualHex(colorHex, fav.hex);
            return (
              <button
                key={fav.key}
                type="button"
                role="listitem"
                className={`app-color-picker__favorite${selected ? " is-selected" : ""}`}
                style={{ backgroundColor: fav.hex }}
                title={t(`colorPicker.colors.${fav.key}`)}
                aria-label={t(`colorPicker.colors.${fav.key}`)}
                aria-pressed={selected}
                disabled={disabled}
                onClick={() => onChange(fav.hex)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
