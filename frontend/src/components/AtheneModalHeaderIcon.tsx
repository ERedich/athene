import { Star } from "lucide-react";
import { Button } from "primereact/button";
import { useTranslation } from "react-i18next";

import type { MouseEvent, RefObject } from "react";

import { LucideSpinner, lucidePrimeBtnIcon } from "../icons/lucide";
import { useAtheneAssistant } from "../assistant/AtheneAssistantContext";
import {
  collectModalFormFields,
  findDialogRootFromEventTarget,
} from "../assistant/collectModalFormFields";

type AtheneModalHeaderIconProps = {
  /** Override default modal-help open (e.g. work-order feedback mode). */
  onAskAthene?: () => void;
  /** Optional root to scrape when not inside a .p-dialog (fullscreen edit). */
  formRootRef?: RefObject<HTMLElement | null>;
};

export function AtheneModalHeaderIcon({ onAskAthene, formRootRef }: AtheneModalHeaderIconProps) {
  const { t } = useTranslation();
  const athene = useAtheneAssistant();

  const handleClick = (event: MouseEvent) => {
    if (onAskAthene) {
      onAskAthene();
      return;
    }
    const root =
      formRootRef?.current ?? findDialogRootFromEventTarget(event.currentTarget);
    const catalog = collectModalFormFields(root);
    athene.openForModalHelp({
      title: catalog.title || t("assistant.modalHelpFallbackTitle"),
      fields: catalog.fields,
    });
  };

  return (
    <Button
      type="button"
      text
      rounded
      className="!h-8 !min-h-8 !w-8 !min-w-8 !p-0 text-[var(--color-primary)]"
      icon={
        athene.busy ? (
          <LucideSpinner className={lucidePrimeBtnIcon} strokeWidth={1.75} />
        ) : (
          <Star className={lucidePrimeBtnIcon} strokeWidth={1.75} />
        )
      }
      title={t("assistant.askAthene")}
      aria-label={t("assistant.askAthene")}
      disabled={athene.busy}
      onClick={handleClick}
    />
  );
}
