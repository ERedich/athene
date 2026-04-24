type AtheneWordmarkProps = {
  /** Localized brand string (e.g. "ATHENE") — trailing underscore is always primary. */
  brand: string;
  className?: string;
};

export function AtheneWordmark({ brand, className }: AtheneWordmarkProps) {
  return (
    <span className={className}>
      <span className="text-on-surface">{brand}</span>
      <span className="text-primary" aria-hidden>
        _
      </span>
    </span>
  );
}
