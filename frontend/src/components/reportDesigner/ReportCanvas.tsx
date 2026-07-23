import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  pageSizeMm,
  type ReportLayout,
  type ReportTextElement,
} from "../../lib/reportDesignerApi";

type Props = {
  layout: ReportLayout;
  selectedId: string | null;
  sampleRow: Record<string, unknown> | null;
  onSelect: (id: string | null) => void;
  onChangeElement: (id: string, patch: Partial<ReportTextElement>) => void;
};

const PX_PER_MM = 2.8;

function formatSample(value: unknown, fallback: string): string {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  }
  return String(value);
}

type DragState =
  | {
      kind: "move";
      id: string;
      startX: number;
      startY: number;
      origX: number;
      origY: number;
    }
  | {
      kind: "resize";
      id: string;
      startX: number;
      startY: number;
      origW: number;
      origH: number;
    };

export function ReportCanvas({
  layout,
  selectedId,
  sampleRow,
  onSelect,
  onChangeElement,
}: Props) {
  const page = useMemo(
    () => pageSizeMm(layout.pageSize, layout.orientation),
    [layout.orientation, layout.pageSize],
  );
  const pageRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const widthPx = page.width * PX_PER_MM;
  const heightPx = page.height * PX_PER_MM;

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      const dxMm = (e.clientX - drag.startX) / PX_PER_MM;
      const dyMm = (e.clientY - drag.startY) / PX_PER_MM;
      if (drag.kind === "move") {
        onChangeElement(drag.id, {
          x: Math.round(Math.max(0, drag.origX + dxMm) * 10) / 10,
          y: Math.round(Math.max(0, drag.origY + dyMm) * 10) / 10,
        });
      } else {
        onChangeElement(drag.id, {
          width: Math.round(Math.max(8, drag.origW + dxMm) * 10) / 10,
          height: Math.round(Math.max(4, drag.origH + dyMm) * 10) / 10,
        });
      }
    };

    const onUp = () => setDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, onChangeElement]);

  const startMove = useCallback(
    (e: React.PointerEvent, el: ReportTextElement) => {
      e.stopPropagation();
      onSelect(el.id);
      setDrag({
        kind: "move",
        id: el.id,
        startX: e.clientX,
        startY: e.clientY,
        origX: el.x,
        origY: el.y,
      });
    },
    [onSelect],
  );

  const startResize = useCallback(
    (e: React.PointerEvent, el: ReportTextElement) => {
      e.stopPropagation();
      onSelect(el.id);
      setDrag({
        kind: "resize",
        id: el.id,
        startX: e.clientX,
        startY: e.clientY,
        origW: el.width,
        origH: el.height,
      });
    },
    [onSelect],
  );

  return (
    <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-[color-mix(in_srgb,var(--color-surface-container)_70%,transparent)] p-4">
      <div
        ref={pageRef}
        className="relative shrink-0 bg-white shadow-[0_12px_40px_rgba(15,20,25,0.12)]"
        style={{ width: widthPx, height: heightPx }}
        onPointerDown={() => onSelect(null)}
      >
        {/* Margin guides */}
        <div
          className="pointer-events-none absolute border border-dashed border-[color-mix(in_srgb,#006099_35%,transparent)]"
          style={{
            left: layout.marginMm.left * PX_PER_MM,
            top: layout.marginMm.top * PX_PER_MM,
            right: layout.marginMm.right * PX_PER_MM,
            bottom: layout.marginMm.bottom * PX_PER_MM,
          }}
        />

        {layout.elements.map((el) => {
          const selected = el.id === selectedId;
          const display =
            el.type === "label"
              ? el.text || ""
              : formatSample(sampleRow?.[el.fieldId ?? ""], `{${el.fieldId ?? "?"}}`);
          return (
            <div
              key={el.id}
              className={`absolute cursor-move select-none ${
                selected
                  ? "outline outline-2 outline-[var(--color-primary)]"
                  : "outline outline-1 outline-[color-mix(in_srgb,#006099_25%,transparent)]"
              }`}
              style={{
                left: el.x * PX_PER_MM,
                top: el.y * PX_PER_MM,
                width: el.width * PX_PER_MM,
                height: el.height * PX_PER_MM,
                color: el.color,
                fontSize: el.fontSize,
                fontWeight: el.fontWeight === "bold" ? 700 : 400,
                textAlign: el.align,
                fontFamily: "Space Grotesk, Manrope, sans-serif",
                lineHeight: 1.2,
                overflow: "hidden",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                background:
                  el.type === "field"
                    ? "color-mix(in srgb, #006099 6%, transparent)"
                    : "transparent",
              }}
              onPointerDown={(e) => startMove(e, el)}
            >
              {display}
              {selected ? (
                <button
                  type="button"
                  aria-label="Resize"
                  className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-se-resize rounded-sm bg-[var(--color-primary)]"
                  onPointerDown={(e) => startResize(e, el)}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
