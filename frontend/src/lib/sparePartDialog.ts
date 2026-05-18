export const sparePartDialogTabs = {
  General: 0,
  StockData: 1,
} as const;

export type SparePartDialogTab = (typeof sparePartDialogTabs)[keyof typeof sparePartDialogTabs];
