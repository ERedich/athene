export const sparePartDialogTabs = {
  General: 0,
  StockData: 1,
  StockPlanning: 2,
  Documents: 3,
} as const;

export type SparePartDialogTab = (typeof sparePartDialogTabs)[keyof typeof sparePartDialogTabs];
