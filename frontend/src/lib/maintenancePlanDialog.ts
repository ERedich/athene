export const maintenancePlanDialogTabs = {
  General: 0,
  Planning: 1,
} as const;

export type MaintenancePlanDialogTab =
  (typeof maintenancePlanDialogTabs)[keyof typeof maintenancePlanDialogTabs];
