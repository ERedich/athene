import { useCallback, useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "primereact/button";

import {
  appendDecimal,
  appendDigit,
  clearCalculator,
  evaluate,
  initialCalculatorState,
  setOperator,
  type CalculatorOperator,
  type CalculatorState,
} from "../lib/calculator";

type CalcKey =
  | { kind: "digit"; value: string; label: string; span?: number }
  | { kind: "decimal" }
  | { kind: "operator"; value: CalculatorOperator; label: string }
  | { kind: "clear" }
  | { kind: "equals" };

const KEY_ROWS: CalcKey[][] = [
  [
    { kind: "clear" },
    { kind: "operator", value: "÷", label: "÷" },
    { kind: "operator", value: "×", label: "×" },
    { kind: "operator", value: "-", label: "−" },
  ],
  [
    { kind: "digit", value: "7", label: "7" },
    { kind: "digit", value: "8", label: "8" },
    { kind: "digit", value: "9", label: "9" },
    { kind: "operator", value: "+", label: "+" },
  ],
  [
    { kind: "digit", value: "4", label: "4" },
    { kind: "digit", value: "5", label: "5" },
    { kind: "digit", value: "6", label: "6" },
    { kind: "equals" },
  ],
  [
    { kind: "digit", value: "1", label: "1" },
    { kind: "digit", value: "2", label: "2" },
    { kind: "digit", value: "3", label: "3" },
    { kind: "decimal" },
  ],
  [{ kind: "digit", value: "0", label: "0", span: 2 }],
];

function keyId(key: CalcKey, index: number): string {
  switch (key.kind) {
    case "digit":
      return `digit-${key.value}`;
    case "operator":
      return `op-${key.value}`;
    case "decimal":
      return "decimal";
    case "clear":
      return "clear";
    case "equals":
      return "equals";
    default:
      return `key-${index}`;
  }
}

function applyKey(state: CalculatorState, key: CalcKey): CalculatorState {
  switch (key.kind) {
    case "digit":
      return appendDigit(state, key.value);
    case "decimal":
      return appendDecimal(state);
    case "operator":
      return setOperator(state, key.value);
    case "clear":
      return clearCalculator();
    case "equals":
      return evaluate(state);
  }
}

export function CalculatorPage() {
  const { t } = useTranslation();
  const [state, setState] = useState<CalculatorState>(initialCalculatorState);

  const displayText = useMemo(() => {
    if (state.error) {
      return t("calculator.error");
    }
    return state.display;
  }, [state.display, state.error, t]);

  const handleKey = useCallback((key: CalcKey) => {
    setState((prev) => applyKey(prev, key));
  }, []);

  return (
    <div className="app-calculator-page min-h-0 flex-1 overflow-auto">
      <div className="app-calculator-panel">
        <div
          className="app-calculator-display"
          aria-live="polite"
          aria-atomic="true"
          aria-label={t("calculator.displayAria")}
        >
          {displayText}
        </div>
        <div className="app-calculator-grid" role="group" aria-label={t("calculator.keypadAria")}>
          {KEY_ROWS.flatMap((row, rowIndex) =>
            row.map((key, colIndex) => {
              const id = keyId(key, rowIndex * 10 + colIndex);
              const isPrimary =
                key.kind === "operator" || key.kind === "equals";
              const isClear = key.kind === "clear";

              let label = "";
              let ariaLabel = "";
              if (key.kind === "digit" || key.kind === "operator") {
                label = key.label;
                ariaLabel = key.label;
              } else if (key.kind === "decimal") {
                label = ".";
                ariaLabel = t("calculator.decimal");
              } else if (key.kind === "clear") {
                label = t("calculator.clear");
                ariaLabel = t("calculator.clear");
              } else if (key.kind === "equals") {
                label = "=";
                ariaLabel = t("calculator.equals");
              }

              const span =
                key.kind === "digit" && key.span ? key.span : undefined;

              return (
                <Button
                  key={id}
                  type="button"
                  label={label}
                  aria-label={ariaLabel}
                  style={
                    span
                      ? ({ gridColumn: `span ${span}` } as CSSProperties)
                      : undefined
                  }
                  className={`app-calculator-key${
                    key.kind === "equals" ? " app-calculator-key--equals" : ""
                  }${
                    key.kind === "digit" || key.kind === "decimal"
                      ? " app-calculator-key--digit"
                      : ""
                  }`}
                  severity={
                    isClear ? "secondary" : isPrimary ? undefined : "secondary"
                  }
                  outlined={!isPrimary}
                  onClick={() => handleKey(key)}
                />
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}
