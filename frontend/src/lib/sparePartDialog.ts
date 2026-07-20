export const sparePartDialogTabs = {
  General: 0,
  StockData: 1,
  StockPlanning: 2,
  Suppliers: 3,
  Documents: 4,
} as const;

export type SparePartDialogTab = (typeof sparePartDialogTabs)[keyof typeof sparePartDialogTabs];
