import { useEffect, useState } from "react";
import bwipjs from "bwip-js/browser";
import QRCode from "qrcode";

type ReportCodePreviewProps = {
  kind: "qr" | "barcode";
  value: string;
  width: number;
  height: number;
  color?: string;
  align?: "left" | "center" | "right";
  emptyLabel: string;
  kindLabel: string;
};

function normalizeHexColor(raw: string | undefined, fallback = "#111827"): string {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : fallback;
}

export function ReportCodePreview({
  kind,
  value,
  width,
  height,
  color,
  align = "left",
  emptyLabel,
  kindLabel,
}: ReportCodePreviewProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const trimmed = value.trim();
  const ink = normalizeHexColor(color);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    if (!trimmed) return;

    void (async () => {
      try {
        if (kind === "qr") {
          const url = await QRCode.toDataURL(trimmed, {
            width: Math.max(Math.round(width), 32),
            margin: 1,
            errorCorrectionLevel: "M",
            color: {
              dark: ink,
              light: "#00000000",
            },
          });
          if (!cancelled) setSrc(url);
          return;
        }

        const canvas = document.createElement("canvas");
        bwipjs.toCanvas(canvas, {
          bcid: "code128",
          text: trimmed,
          scale: 2,
          height: Math.max(8, Math.round(height / 3)),
          includetext: false,
          barcolor: ink.slice(1),
        });
        if (!cancelled) setSrc(canvas.toDataURL("image/png"));
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [kind, trimmed, width, height, ink]);

  if (!trimmed || failed || !src) {
    return (
      <div
        className="flex h-full w-full flex-col items-center justify-center gap-0.5 overflow-hidden border border-slate-400 bg-slate-50 px-1 text-center"
        style={{ fontSize: "10px", lineHeight: 1.2 }}
      >
        <span className="font-semibold uppercase tracking-wide text-slate-700">{kindLabel}</span>
        <span className="truncate font-mono text-[9px] text-slate-500">
          {trimmed ? kindLabel : emptyLabel}
        </span>
      </div>
    );
  }

  const objectPosition =
    align === "right" ? "right center" : align === "center" ? "center center" : "left center";

  return (
    <img
      src={src}
      alt={kindLabel}
      draggable={false}
      className="h-full w-full object-contain"
      style={{ imageRendering: "pixelated", objectPosition }}
    />
  );
}
