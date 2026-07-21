import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Star } from "lucide-react";
import { Button } from "primereact/button";

import { AtheneWordmark } from "../components/AtheneWordmark";
import type { WorkOrderStatus } from "../lib/workOrderTypes";
import { queryOnboardingTarget } from "./onboardingDom";
import {
  ONBOARDING_ALPHA_VERSION,
  type OnboardingStep,
} from "./onboardingSteps";

const WORK_ORDER_STATUS_LEGEND: WorkOrderStatus[] = [
  "open",
  "assigned",
  "started",
  "paused",
  "continued",
  "ended",
  "done",
  "cancelled",
];

type Rect = { top: number; left: number; width: number; height: number };

type Props = {
  step: OnboardingStep;
  stepIndex: number;
  stepCount: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  stepOfKey?: string;
  skipKey?: string;
  backKey?: string;
  nextKey?: string;
  finishKey?: string;
};

const TARGET_PADDING = 8;
const GAP = 16;
/** Minimum inset from every viewport edge. */
const EDGE_INSET_RATIO = 0.05;
/** Fallback height before the bubble is measured. */
const ESTIMATED_BUBBLE_H = 320;

function edgeInset(size: number): number {
  return Math.max(12, size * EDGE_INSET_RATIO);
}

function readTargetRect(target: string): Rect | null {
  const el = queryOnboardingTarget(target);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 && r.height <= 0) return null;
  return {
    top: r.top - TARGET_PADDING,
    left: r.left - TARGET_PADDING,
    width: r.width + TARGET_PADDING * 2,
    height: r.height + TARGET_PADDING * 2,
  };
}

function clamp(n: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(n, min), max);
}

function bubblePlacement(
  rect: Rect | null,
  bubbleH: number,
): { style: CSSProperties; arrow: "left" | "right" | "top" | "bottom" } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const insetX = edgeInset(vw);
  const insetY = edgeInset(vh);
  const maxW = Math.max(240, vw - insetX * 2);
  const bubbleW = Math.min(380, maxW);
  const maxH = Math.max(180, vh - insetY * 2);
  const h = Math.min(bubbleH > 0 ? bubbleH : ESTIMATED_BUBBLE_H, maxH);

  const clampBox = (top: number, left: number) => ({
    top: clamp(top, insetY, vh - insetY - h),
    left: clamp(left, insetX, vw - insetX - bubbleW),
    width: bubbleW,
    maxHeight: maxH,
  });

  if (!rect) {
    const box = clampBox((vh - h) / 2, (vw - bubbleW) / 2);
    return {
      style: {
        position: "fixed",
        top: box.top,
        left: box.left,
        width: box.width,
        maxHeight: box.maxHeight,
      },
      arrow: "top",
    };
  }

  const spaceRight = vw - (rect.left + rect.width) - insetX;
  const spaceLeft = rect.left - insetX;
  const spaceBelow = vh - (rect.top + rect.height) - insetY;
  const spaceAbove = rect.top - insetY;

  // Prefer side placement when the bubble fits horizontally.
  if (spaceRight >= bubbleW + GAP) {
    const box = clampBox(
      rect.top + rect.height / 2 - h / 2,
      rect.left + rect.width + GAP,
    );
    return {
      style: {
        position: "fixed",
        top: box.top,
        left: box.left,
        width: box.width,
        maxHeight: box.maxHeight,
      },
      arrow: "left",
    };
  }

  if (spaceLeft >= bubbleW + GAP) {
    const box = clampBox(
      rect.top + rect.height / 2 - h / 2,
      rect.left - GAP - bubbleW,
    );
    return {
      style: {
        position: "fixed",
        top: box.top,
        left: box.left,
        width: box.width,
        maxHeight: box.maxHeight,
      },
      arrow: "right",
    };
  }

  // Vertical: prefer the side with more room (keeps bottom-of-sidebar targets from pushing off-screen).
  if (spaceAbove >= spaceBelow && spaceAbove >= GAP + 80) {
    const box = clampBox(
      rect.top - GAP - h,
      rect.left + rect.width / 2 - bubbleW / 2,
    );
    return {
      style: {
        position: "fixed",
        top: box.top,
        left: box.left,
        width: box.width,
        maxHeight: box.maxHeight,
      },
      arrow: "bottom",
    };
  }

  const box = clampBox(
    rect.top + rect.height + GAP,
    rect.left + rect.width / 2 - bubbleW / 2,
  );
  return {
    style: {
      position: "fixed",
      top: box.top,
      left: box.left,
      width: box.width,
      maxHeight: box.maxHeight,
    },
    arrow: "top",
  };
}

export function AtheneCoachmark({
  step,
  stepIndex,
  stepCount,
  onNext,
  onBack,
  onSkip,
  stepOfKey = "onboarding.stepOf",
  skipKey = "onboarding.skip",
  backKey = "onboarding.back",
  nextKey = "onboarding.next",
  finishKey = "onboarding.finish",
}: Props) {
  const { t } = useTranslation();
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [bubbleH, setBubbleH] = useState(ESTIMATED_BUBBLE_H);
  const isLast = stepIndex >= stepCount - 1;
  const isFirst = stepIndex <= 0;

  const measure = useCallback(() => {
    setRect(readTargetRect(step.target));
  }, [step.target]);

  useLayoutEffect(() => {
    measure();
    const id = window.setTimeout(measure, 80);
    const id2 = window.setTimeout(measure, 320);
    return () => {
      window.clearTimeout(id);
      window.clearTimeout(id2);
    };
  }, [measure, step.id]);

  useEffect(() => {
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [measure]);

  const { style: bubbleStyle, arrow } = bubblePlacement(rect, bubbleH);

  useLayoutEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;
    const h = el.getBoundingClientRect().height;
    if (h > 0 && Math.abs(h - bubbleH) > 1) {
      setBubbleH(h);
    }
  }, [bubbleStyle, bubbleH, step.id, step.bodyKey]);

  const body = t(step.bodyKey, { version: ONBOARDING_ALPHA_VERSION });

  return createPortal(
    <div className="app-onboarding" role="dialog" aria-modal="true" aria-labelledby="app-onboarding-title">
      <div className="app-onboarding__dim" aria-hidden />
      {rect ? (
        <div
          className="app-onboarding__spotlight"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }}
          aria-hidden
        />
      ) : null}
      <div
        ref={bubbleRef}
        className={`app-onboarding__bubble app-onboarding__bubble--arrow-${arrow}`}
        style={bubbleStyle}
      >
        <div className="app-onboarding__bubble-head">
          <span className="app-onboarding__avatar" aria-hidden>
            <Star className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <AtheneWordmark brand={t("login.brand")} className="font-mono text-sm font-semibold tracking-tight" />
          <span className="app-onboarding__step-count">
            {t(stepOfKey, { current: stepIndex + 1, total: stepCount })}
          </span>
        </div>
        <h2 id="app-onboarding-title" className="app-onboarding__title">
          {t(step.titleKey)}
        </h2>
        <div className="app-onboarding__body">
          <p className="app-onboarding__body-text">{body}</p>
          {step.showStatusLegend ? (
            <ul className="app-onboarding__status-legend" aria-label={t(step.titleKey)}>
              {WORK_ORDER_STATUS_LEGEND.map((status) => (
                <li
                  key={status}
                  className={`app-onboarding__status-chip app-onboarding__status-chip--${status}`}
                >
                  {t(`workOrders.statusValues.${status}`)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="app-onboarding__actions">
          <Button
            type="button"
            text
            size="small"
            label={t(skipKey)}
            onClick={onSkip}
            className="!px-2"
          />
          <div className="app-onboarding__actions-end">
            {!isFirst ? (
              <Button
                type="button"
                outlined
                size="small"
                label={t(backKey)}
                onClick={onBack}
              />
            ) : null}
            <Button
              type="button"
              size="small"
              label={isLast ? t(finishKey) : t(nextKey)}
              onClick={onNext}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
