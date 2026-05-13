import { Loader2, Pause, Play, Square } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";

export type Loader2Props = ComponentPropsWithoutRef<typeof Loader2>;
export type PlayProps = ComponentPropsWithoutRef<typeof Play>;
export type PauseProps = ComponentPropsWithoutRef<typeof Pause>;
export type SquareProps = ComponentPropsWithoutRef<typeof Square>;

/** Spinner mit `animate-spin` – Ersatz für `pi-spin pi-spinner`. */
export function LucideSpinner({ className, ...rest }: Loader2Props) {
  return (
    <Loader2
      {...rest}
      aria-hidden
      className={[className, "animate-spin"].filter(Boolean).join(" ")}
    />
  );
}

/** Standard für PrimeReact `Button` innerhalb von `.p-button-icon` */
export const lucidePrimeBtnIcon = "!h-[1rem] !w-[1rem] shrink-0";

/** Suchfeld / Tabellenkopf („text-xs“) */
export const lucidePrimeInputSm = "!h-3 !w-3 shrink-0";

/** Tabellen-Spalte WO-Steuerung: Tailwind (+ index.css `.app-wo-fill-lucide`) */
export const lucideWoControlIcon =
  "!h-[18px] !w-[18px] shrink-0 app-wo-fill-lucide";

/** Auftrags-Steuerung: Lucide-Glyphen als Fill-Variante (Outline in 1rem kaum lesbar). */

export function AppPlayStartIcon({ className, ...rest }: PlayProps) {
  return (
    <Play
      {...rest}
      aria-hidden
      fill="currentColor"
      strokeWidth={0}
      className={[lucideWoControlIcon, className].filter(Boolean).join(" ")}
    />
  );
}

export function AppSquareStopIcon({ className, ...rest }: SquareProps) {
  return (
    <Square
      {...rest}
      aria-hidden
      fill="currentColor"
      strokeWidth={0}
      className={[lucideWoControlIcon, className].filter(Boolean).join(" ")}
    />
  );
}

export function AppPauseIcon({ className, ...rest }: PauseProps) {
  return (
    <Pause
      {...rest}
      aria-hidden
      fill="currentColor"
      strokeWidth={0}
      className={[lucideWoControlIcon, className].filter(Boolean).join(" ")}
    />
  );
}
