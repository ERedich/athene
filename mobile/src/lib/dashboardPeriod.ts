export type PeriodOfDay = "morning" | "afternoon" | "evening";

export function resolvePeriodOfDay(date: Date = new Date()): PeriodOfDay {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "evening";
}

export const PERIOD_GREETING_KEY: Record<PeriodOfDay, string> = {
  morning: "dashboard.greetingMorning",
  afternoon: "dashboard.greetingAfternoon",
  evening: "dashboard.greetingEvening",
};

/** Stats footer contrast against full-bleed period image. */
export const PERIOD_IMAGE_TONE: Record<PeriodOfDay, "light" | "dark"> = {
  morning: "light",
  afternoon: "light",
  evening: "dark",
};
