export const loginBgImagesLight = [
  "/login/bg/light-factory-floor.jpg",
  "/login/bg/light-maintenance.jpg",
] as const;

export const loginBgImagesDark = [
  "/login/bg/dark-night-plant.jpg",
  "/login/bg/dark-control-room.jpg",
] as const;

/** Static chrome background (AppShell); login uses theme slideshows above. */
export const loginBgImage = loginBgImagesDark[0];
