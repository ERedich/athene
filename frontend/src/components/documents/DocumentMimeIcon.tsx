import type { LucideIcon } from "lucide-react";

import { documentTypeMimeIcon } from "../../hooks/useWorkOrderEditDialogState";

type Props = {
  mimeType: string | null | undefined;
  fileName: string;
  /** Override when icon already resolved (e.g. pending File). */
  Icon?: LucideIcon;
  className?: string;
};

/**
 * Design foundation: document list mime icons are 1.25rem (20px), clamped via `.app-doc-ref-icon`.
 * Source pattern: Baumstruktur document references.
 */
export function DocumentMimeIcon({ mimeType, fileName, Icon, className }: Props) {
  const spec = documentTypeMimeIcon(mimeType ?? "application/octet-stream", fileName);
  const MimeIco = Icon ?? spec.Icon;
  return (
    <span className="app-doc-ref-icon" aria-hidden>
      <MimeIco
        className={className ?? spec.className}
        width={20}
        height={20}
        strokeWidth={1.75}
      />
    </span>
  );
}
