const defaultSessionSecret = "dev-only-insecure-session-secret";

export const isProduction = process.env.NODE_ENV === "production";
export const configuredSessionSecret = process.env.SESSION_SECRET;
export const sessionSecret = configuredSessionSecret ?? defaultSessionSecret;
