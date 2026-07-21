import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { AtheneCoachmark } from "./AtheneCoachmark";
import { scrollOnboardingTargetIntoView } from "./onboardingDom";
import type { TourStep } from "./onboardingSteps";

export type AtheneTourLabels = {
  stepOfKey?: string;
  skipKey?: string;
  backKey?: string;
  nextKey?: string;
  finishKey?: string;
};

type Options = {
  steps: TourStep[];
  labels?: AtheneTourLabels;
};

export type AtheneTourApi = {
  active: boolean;
  /** Current step id while the tour is active; null when inactive. */
  currentStepId: string | null;
  start: () => void;
  stop: () => void;
  coachmark: ReactNode;
};

/**
 * Local Athene spotlight tour (no server persistence).
 * Used for in-app Help tours such as Monitoring.
 */
export function useAtheneTour({ steps, labels }: Options): AtheneTourApi {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const step = steps[stepIndex] ?? steps[0];

  useEffect(() => {
    if (!active || !step) return;
    const t1 = window.setTimeout(() => scrollOnboardingTargetIntoView(step.target), 50);
    const t2 = window.setTimeout(() => scrollOnboardingTargetIntoView(step.target), 280);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [active, step]);

  const start = useCallback(() => {
    setStepIndex(0);
    setActive(true);
  }, []);

  const stop = useCallback(() => {
    setActive(false);
    setStepIndex(0);
  }, []);

  const onNext = useCallback(() => {
    if (stepIndex >= steps.length - 1) {
      setActive(false);
      setStepIndex(0);
      return;
    }
    setStepIndex((i) => i + 1);
  }, [stepIndex, steps.length]);

  const onBack = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  const coachmark = useMemo(() => {
    if (!active || !step) return null;
    return (
      <AtheneCoachmark
        step={step}
        stepIndex={stepIndex}
        stepCount={steps.length}
        onNext={onNext}
        onBack={onBack}
        onSkip={stop}
        stepOfKey={labels?.stepOfKey}
        skipKey={labels?.skipKey}
        backKey={labels?.backKey}
        nextKey={labels?.nextKey}
        finishKey={labels?.finishKey}
      />
    );
  }, [
    active,
    step,
    stepIndex,
    steps.length,
    onNext,
    onBack,
    stop,
    labels?.stepOfKey,
    labels?.skipKey,
    labels?.backKey,
    labels?.nextKey,
    labels?.finishKey,
  ]);

  return {
    active,
    currentStepId: active && step ? step.id : null,
    start,
    stop,
    coachmark,
  };
}
