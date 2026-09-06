/** Shared shell header action classes (see Guidelines + index.css). */
export const headerActionNavItem = "app-header-action-nav-item";
export const createHeaderActionNavItem = `${headerActionNavItem} app-header-action-nav-item--create`;
export const primaryHeaderActionNavItem = headerActionNavItem;
export const deleteHeaderActionNavItem = `${headerActionNavItem} app-header-action-nav-item--delete`;

export const createHeaderActionIcon = "app-header-action-icon--create";
export const primaryHeaderActionIcon = "app-header-action-icon--primary";
export const deleteHeaderActionIcon = "app-header-action-icon--delete";

/** @deprecated Prefer createHeaderActionNavItem — kept as aliases for gradual migration. */
export const createActionNavItem = createHeaderActionNavItem;
export const primaryActionNavItem = primaryHeaderActionNavItem;
export const deleteActionNavItem = deleteHeaderActionNavItem;
export const createActionIcon = createHeaderActionIcon;
export const primaryActionIcon = primaryHeaderActionIcon;
export const deleteActionIcon = deleteHeaderActionIcon;
