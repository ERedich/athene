import { Dialog, type DialogProps } from "primereact/dialog";
import type { ReactNode, RefObject } from "react";

import { AtheneModalHeaderIcon } from "./AtheneModalHeaderIcon";

export type AppDialogProps = DialogProps & {
  /** Override default modal-help Athene open (e.g. work-order feedback). */
  onAskAthene?: () => void;
  /** Optional form root for field scraping when needed outside the dialog node. */
  atheneFormRootRef?: RefObject<HTMLElement | null>;
  /** Hide the Athene header star (rare). */
  hideAthene?: boolean;
};

function resolveIcons(icons: DialogProps["icons"], props: DialogProps): ReactNode {
  if (typeof icons === "function") return icons(props);
  return icons ?? null;
}

/**
 * App-wide Dialog wrapper: injects Athene star left of the close button.
 */
export function AppDialog({
  icons,
  onAskAthene,
  atheneFormRootRef,
  hideAthene,
  ...rest
}: AppDialogProps) {
  const atheneIcon = hideAthene ? null : (
    <AtheneModalHeaderIcon onAskAthene={onAskAthene} formRootRef={atheneFormRootRef} />
  );

  const existingIcons = resolveIcons(icons, { icons, ...rest });

  let mergedIcons: ReactNode = atheneIcon;
  if (existingIcons && atheneIcon) {
    mergedIcons = (
      <div className="mr-1 flex items-center gap-1">
        {atheneIcon}
        {existingIcons}
      </div>
    );
  } else if (existingIcons) {
    mergedIcons = existingIcons;
  } else if (atheneIcon) {
    mergedIcons = <div className="mr-1 flex items-center gap-1">{atheneIcon}</div>;
  }

  return <Dialog {...rest} icons={mergedIcons} />;
}
