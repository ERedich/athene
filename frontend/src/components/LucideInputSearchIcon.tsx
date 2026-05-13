import { Search } from "lucide-react";
import { InputIcon } from "primereact/inputicon";

import { lucidePrimeInputSm } from "../icons/lucide";

/** Ersetzt `InputIcon` + PrimeIcons für Tabellen-/Toolbar-Suche. */
export function LucideInputSearchIcon() {
  return (
    <InputIcon className="text-on-surface-variant">
      <Search className={lucidePrimeInputSm} strokeWidth={1.75} aria-hidden />
    </InputIcon>
  );
}
