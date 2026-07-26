export type SlaState = "ok" | "warn" | "overdue";

/** Warn when less than this fraction of the SLA window remains. */
export const SLA_WARN_REMAINING_FRACTION = 0.25;

export type SlaEnrichment = {
  slaReactionDueAt: string | null;
  slaResolutionDueAt: string | null;
  slaReactionState: SlaState | null;
  slaResolutionState: SlaState | null;
};

export function computeSlaState(
  dueAt: Date,
  windowMinutes: number,
  now: Date = new Date(),
): SlaState {
  if (now.getTime() >= dueAt.getTime()) return "overdue";
  if (windowMinutes <= 0) return "ok";
  const remainingMs = dueAt.getTime() - now.getTime();
  const windowMs = windowMinutes * 60_000;
  if (remainingMs / windowMs <= SLA_WARN_REMAINING_FRACTION) return "warn";
  return "ok";
}

export function enrichWorkOrderSla(input: {
  createdAt: string | Date | null | undefined;
  reactionMinutes: number | null | undefined;
  resolutionMinutes: number | null | undefined;
  now?: Date;
}): SlaEnrichment {
  if (!input.createdAt) {
    return {
      slaReactionDueAt: null,
      slaResolutionDueAt: null,
      slaReactionState: null,
      slaResolutionState: null,
    };
  }
  const created =
    input.createdAt instanceof Date ? input.createdAt : new Date(input.createdAt);
  if (Number.isNaN(created.getTime())) {
    return {
      slaReactionDueAt: null,
      slaResolutionDueAt: null,
      slaReactionState: null,
      slaResolutionState: null,
    };
  }
  const now = input.now ?? new Date();
  const reactionMinutes =
    typeof input.reactionMinutes === "number" && Number.isFinite(input.reactionMinutes)
      ? input.reactionMinutes
      : null;
  const resolutionMinutes =
    typeof input.resolutionMinutes === "number" && Number.isFinite(input.resolutionMinutes)
      ? input.resolutionMinutes
      : null;

  const reactionDue =
    reactionMinutes == null
      ? null
      : new Date(created.getTime() + reactionMinutes * 60_000);
  const resolutionDue =
    resolutionMinutes == null
      ? null
      : new Date(created.getTime() + resolutionMinutes * 60_000);

  return {
    slaReactionDueAt: reactionDue?.toISOString() ?? null,
    slaResolutionDueAt: resolutionDue?.toISOString() ?? null,
    slaReactionState:
      reactionDue && reactionMinutes != null
        ? computeSlaState(reactionDue, reactionMinutes, now)
        : null,
    slaResolutionState:
      resolutionDue && resolutionMinutes != null
        ? computeSlaState(resolutionDue, resolutionMinutes, now)
        : null,
  };
}
