import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { LucideSpinner } from "../icons/lucide";
import { apiFetch } from "../lib/api";
import { isImageDocument } from "../lib/isImageDocument";

export type DocumentImageHoverPreviewState = {
  docId: string;
  title: string;
  url: string | null;
  loading: boolean;
  top: number;
  left: number;
};

export type ShowDocumentImageHoverPreviewArgs = {
  cacheKey: string;
  title: string;
  mimeType: string | null | undefined;
  fileName: string;
  anchor: DOMRect;
  /** Remote content URL (authenticated via apiFetch). */
  fetchUrl?: string;
  /** Local pending file — preview via object URL, no network. */
  file?: File;
};

/**
 * Design foundation: image document hover preview (Baumstruktur pattern).
 * 220ms delay, blob URL cache, fixed panel left of the row.
 */
export function useDocumentImageHoverPreview() {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<DocumentImageHoverPreviewState | null>(null);
  const cacheRef = useRef<Map<string, string>>(new Map());
  const hoverTimerRef = useRef<number | null>(null);
  const reqSeqRef = useRef(0);

  const clearPreview = useCallback(() => {
    if (hoverTimerRef.current != null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    reqSeqRef.current += 1;
    setPreview(null);
  }, []);

  const showPreview = useCallback((args: ShowDocumentImageHoverPreviewArgs) => {
    if (!isImageDocument(args.mimeType, args.fileName)) return;
    if (!args.fetchUrl && !args.file) return;

    if (hoverTimerRef.current != null) {
      window.clearTimeout(hoverTimerRef.current);
    }

    const previewW = 280;
    const previewH = 220;
    const gap = 12;
    const left = Math.max(8, Math.min(args.anchor.left - previewW - gap, window.innerWidth - previewW - 8));
    const top = Math.max(8, Math.min(args.anchor.top, window.innerHeight - previewH - 8));
    const cached = cacheRef.current.get(args.cacheKey);

    hoverTimerRef.current = window.setTimeout(() => {
      hoverTimerRef.current = null;
      if (cached) {
        setPreview({
          docId: args.cacheKey,
          title: args.title,
          url: cached,
          loading: false,
          top,
          left,
        });
        return;
      }

      if (args.file) {
        const blobUrl = URL.createObjectURL(args.file);
        const prev = cacheRef.current.get(args.cacheKey);
        if (prev) URL.revokeObjectURL(prev);
        cacheRef.current.set(args.cacheKey, blobUrl);
        setPreview({
          docId: args.cacheKey,
          title: args.title,
          url: blobUrl,
          loading: false,
          top,
          left,
        });
        return;
      }

      const fetchUrl = args.fetchUrl!;
      const seq = ++reqSeqRef.current;
      setPreview({
        docId: args.cacheKey,
        title: args.title,
        url: null,
        loading: true,
        top,
        left,
      });
      void (async () => {
        try {
          const res = await apiFetch(fetchUrl);
          if (!res.ok) throw new Error("preview");
          const blob = await res.blob();
          if (reqSeqRef.current !== seq) return;
          const blobUrl = URL.createObjectURL(blob);
          const prev = cacheRef.current.get(args.cacheKey);
          if (prev) URL.revokeObjectURL(prev);
          cacheRef.current.set(args.cacheKey, blobUrl);
          setPreview({
            docId: args.cacheKey,
            title: args.title,
            url: blobUrl,
            loading: false,
            top,
            left,
          });
        } catch {
          if (reqSeqRef.current !== seq) return;
          setPreview(null);
        }
      })();
    }, 220);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current != null) {
        window.clearTimeout(hoverTimerRef.current);
      }
      for (const url of cacheRef.current.values()) {
        URL.revokeObjectURL(url);
      }
      cacheRef.current.clear();
    };
  }, []);

  const previewPortal: ReactNode =
    preview && typeof document !== "undefined"
      ? createPortal(
          <div
            className="app-doc-image-preview"
            style={{ top: preview.top, left: preview.left }}
            role="img"
            aria-label={t("documentsUi.imagePreview", { name: preview.title })}
          >
            {preview.loading || !preview.url ? (
              <div className="app-doc-image-preview__loading">
                <LucideSpinner className="h-5 w-5" strokeWidth={1.75} />
              </div>
            ) : (
              <img src={preview.url} alt={preview.title} className="app-doc-image-preview__img" />
            )}
          </div>,
          document.body,
        )
      : null;

  return { showPreview, clearPreview, previewPortal, preview };
}
