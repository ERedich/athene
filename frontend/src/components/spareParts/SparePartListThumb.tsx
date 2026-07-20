import { useEffect, useRef, useState, type FocusEvent, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { Image as ImageIcon } from "lucide-react";
import { OverlayPanel } from "primereact/overlaypanel";

import { apiFetch } from "../../lib/api";
import { overlayAppendTo } from "../../lib/overlayAppendTo";

type SparePartListThumbProps = {
  sparePartId: string;
  hasPhoto: boolean;
};

export function SparePartListThumb({ sparePartId, hasPhoto }: SparePartListThumbProps) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const panelRef = useRef<OverlayPanel>(null);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!hasPhoto) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;

    void (async () => {
      try {
        const res = await apiFetch(`/api/spare-parts/${sparePartId}/photo?size=thumb`);
        if (!res.ok) return;
        const blob = await res.blob();
        const nextUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(nextUrl);
          return;
        }
        objectUrl = nextUrl;
        setUrl(nextUrl);
      } catch {
        if (!cancelled) setUrl(null);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (hideTimerRef.current != null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      panelRef.current?.hide();
    };
  }, [hasPhoto, sparePartId]);

  const clearHideTimer = () => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const scheduleHide = () => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      panelRef.current?.hide();
      hideTimerRef.current = null;
    }, 120);
  };

  const showPreview = (e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
    if (!url) return;
    clearHideTimer();
    panelRef.current?.show(e, e.currentTarget);
  };

  if (!hasPhoto) {
    return <span className="text-on-surface-variant">—</span>;
  }

  if (url) {
    return (
      <>
        <button
          type="button"
          className="inline-flex h-8 w-8 cursor-zoom-in items-center justify-center overflow-hidden rounded-sm border-0 bg-transparent p-0"
          onMouseEnter={showPreview}
          onMouseLeave={scheduleHide}
          onFocus={showPreview}
          onBlur={scheduleHide}
          aria-label={t("spareParts.thumbnailsPreviewAria")}
        >
          <img src={url} alt="" className="h-8 w-8 rounded-sm object-cover" loading="lazy" />
        </button>
        <OverlayPanel
          ref={panelRef}
          appendTo={overlayAppendTo}
          dismissable={false}
          className="app-sp-list-thumb-preview"
        >
          <div onMouseEnter={clearHideTimer} onMouseLeave={scheduleHide}>
            <img src={url} alt="" className="block h-48 w-48 rounded-sm object-cover" />
          </div>
        </OverlayPanel>
      </>
    );
  }

  return <ImageIcon className="h-4 w-4 text-sky-500" strokeWidth={1.75} />;
}
