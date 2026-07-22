export const isProduction = process.env.NODE_ENV === "production";
export const configuredSessionSecret = process.env.SESSION_SECRET;

if (!configuredSessionSecret || configuredSessionSecret.length < 16) {
  throw new Error(
    "[athene-backend] SESSION_SECRET is required and must be at least 16 characters.",
  );
}

export const sessionSecret = configuredSessionSecret;
