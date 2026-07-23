import { STANDARD_TAB_BADGE_CLASS } from "../../lib/tabs/constants";

type AppTabHeaderProps = {
  label: string;
  count?: number | string | null;
  /** When false, always hide badge even if count is non-zero. Default true. */
  hideZero?: boolean;
};

/** Standard tab label + optional count badge (LY_STANDARD_TABS). */
export function AppTabHeader({ label, count, hideZero = true }: AppTabHeaderProps) {
  const isZero = count === 0 || count === "0";
  const showBadge =
    count != null && count !== "" && !(hideZero && isZero);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{label}</span>
      {showBadge ? <span className={STANDARD_TAB_BADGE_CLASS}>{count}</span> : null}
    </span>
  );
}
