export type CalculatorOperator = "+" | "-" | "×" | "÷";

export type CalculatorState = {
  display: string;
  previousValue: number | null;
  operator: CalculatorOperator | null;
  waitingForOperand: boolean;
  error: boolean;
};

export const initialCalculatorState = (): CalculatorState => ({
  display: "0",
  previousValue: null,
  operator: null,
  waitingForOperand: false,
  error: false,
});

export function formatCalculatorDisplay(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  const rounded = Math.round(value * 1e10) / 1e10;
  const str = String(rounded);
  if (str.includes("e") || str.includes("E")) {
    return rounded.toPrecision(10).replace(/\.?0+$/, "");
  }
  return str;
}

function parseDisplay(display: string): number {
  const parsed = Number(display);
  return Number.isFinite(parsed) ? parsed : 0;
}

function applyOperator(
  left: number,
  right: number,
  operator: CalculatorOperator,
): number | "divideByZero" {
  switch (operator) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "×":
      return left * right;
    case "÷":
      if (right === 0) {
        return "divideByZero";
      }
      return left / right;
  }
}

export function clearCalculator(): CalculatorState {
  return initialCalculatorState();
}

export function appendDigit(
  state: CalculatorState,
  digit: string,
): CalculatorState {
  if (state.error) {
    return { ...initialCalculatorState(), display: digit, waitingForOperand: false };
  }

  if (state.waitingForOperand) {
    return {
      ...state,
      display: digit,
      waitingForOperand: false,
    };
  }

  if (state.display === "0") {
    return { ...state, display: digit };
  }

  if (state.display.length >= 16) {
    return state;
  }

  return { ...state, display: state.display + digit };
}

export function appendDecimal(state: CalculatorState): CalculatorState {
  if (state.error) {
    return { ...initialCalculatorState(), display: "0.", waitingForOperand: false };
  }

  if (state.waitingForOperand) {
    return {
      ...state,
      display: "0.",
      waitingForOperand: false,
    };
  }

  if (state.display.includes(".")) {
    return state;
  }

  return { ...state, display: `${state.display}.` };
}

export function setOperator(
  state: CalculatorState,
  operator: CalculatorOperator,
): CalculatorState {
  if (state.error) {
    return initialCalculatorState();
  }

  const current = parseDisplay(state.display);

  if (state.previousValue !== null && state.operator && !state.waitingForOperand) {
    const result = applyOperator(state.previousValue, current, state.operator);
    if (result === "divideByZero") {
      return {
        ...initialCalculatorState(),
        display: "Error",
        error: true,
      };
    }
    return {
      display: formatCalculatorDisplay(result),
      previousValue: result,
      operator,
      waitingForOperand: true,
      error: false,
    };
  }

  return {
    ...state,
    previousValue: current,
    operator,
    waitingForOperand: true,
  };
}

export function evaluate(state: CalculatorState): CalculatorState {
  if (state.error) {
    return initialCalculatorState();
  }

  if (state.previousValue === null || state.operator === null) {
    return state;
  }

  const current = parseDisplay(state.display);
  const result = applyOperator(state.previousValue, current, state.operator);

  if (result === "divideByZero") {
    return {
      ...initialCalculatorState(),
      display: "Error",
      error: true,
    };
  }

  return {
    display: formatCalculatorDisplay(result),
    previousValue: null,
    operator: null,
    waitingForOperand: true,
    error: false,
  };
}
