import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { apiFetch } from "../lib/api";
import { AtheneCoachmark } from "./AtheneCoachmark";
import {
  requestEnsureSidebarExpanded,
  requestExpandNavGroup,
  scrollOnboardingTargetIntoView,
} from "./onboardingDom";
import { ONBOARDING_STEPS } from "./onboardingSteps";

type OnboardingContextValue = {
  active: boolean;
};

const OnboardingContext = createContext<OnboardingContextValue>({ active: false });

export function useOnboarding(): OnboardingContextValue {
  return useContext(OnboardingContext);
}

type Props = {
  children: ReactNode;
  /** When true, shell enter animation is done (or was never needed). */
  shellReady: boolean;
};

export function OnboardingProvider({ children, shellReady }: Props) {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [active, setActive] = useState(false);
  const [completing, setCompleting] = useState(false);

  const needsTour = user.onboardingCompletedAt == null;

  useEffect(() => {
    if (!shellReady || !needsTour || completing) return;
    setActive(true);
    setStepIndex(0);
  }, [shellReady, needsTour, completing]);

  const step = ONBOARDING_STEPS[stepIndex] ?? ONBOARDING_STEPS[0];

  useEffect(() => {
    if (!active || !step) return;
    requestEnsureSidebarExpanded();
    if (step.expandNavGroup) {
      requestExpandNavGroup(step.expandNavGroup);
    }
    if (step.route) {
      void navigate(step.route);
    }
    const t1 = window.setTimeout(() => scrollOnboardingTargetIntoView(step.target), 50);
    const t2 = window.setTimeout(() => scrollOnboardingTargetIntoView(step.target), 280);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [active, step, navigate]);

  const complete = useCallback(async () => {
    if (completing) return;
    setCompleting(true);
    setActive(false);
    try {
      await apiFetch("/api/auth/onboarding/complete", { method: "POST" });
      await refresh();
    } catch {
      setCompleting(false);
      setActive(true);
    }
  }, [completing, refresh]);

  const onNext = useCallback(() => {
    if (stepIndex >= ONBOARDING_STEPS.length - 1) {
      void complete();
      return;
    }
    setStepIndex((i) => i + 1);
  }, [stepIndex, complete]);

  const onBack = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  const onSkip = useCallback(() => {
    void complete();
  }, [complete]);

  const value = useMemo(() => ({ active }), [active]);

  return (
    <OnboardingContext.Provider value={value}>
      {children}
      {active && step ? (
        <AtheneCoachmark
          step={step}
          stepIndex={stepIndex}
          stepCount={ONBOARDING_STEPS.length}
          onNext={onNext}
          onBack={onBack}
          onSkip={onSkip}
        />
      ) : null}
    </OnboardingContext.Provider>
  );
}
