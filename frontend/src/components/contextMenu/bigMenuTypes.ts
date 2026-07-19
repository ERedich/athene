import type { ReactNode } from "react";

export type BigMenuItem = {
  id: string;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  className?: string;
  onSelect: () => void;
  /** Extra actions in the same primary cell (e.g. Stop | Pause). */
  siblings?: BigMenuItem[];
};

export type BigMenuSection = {
  id: string;
  title?: string;
  variant: "primary" | "column";
  items: BigMenuItem[];
};

export type BigMenuAnchor = { x: number; y: number };
