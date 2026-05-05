const fs = require("fs");
const path = require("path");

/**
 * Load mobile/.env regardless of process.cwd() (npm workspaces / concurrent tasks).
 * Does not override variables already set in the environment.
 */
function loadMobileEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key) continue;
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

module.exports = ({ config }) => {
  loadMobileEnvFile();
  const apiBase =
    (process.env.EXPO_PUBLIC_API_BASE_URL || "").trim() || "http://localhost:3001";

  return {
    ...config,
    plugins: [
      ...((Array.isArray(config.plugins) && config.plugins) || []),
      [
        "expo-build-properties",
        {
          android: {
            usesCleartextTraffic: true,
          },
        },
      ],
    ],
    ios: {
      ...(config.ios || {}),
      infoPlist: {
        ...((config.ios && config.ios.infoPlist) || {}),
        NSAppTransportSecurity: {
          ...((config.ios &&
            config.ios.infoPlist &&
            config.ios.infoPlist.NSAppTransportSecurity) ||
            {}),
          NSAllowsLocalNetworking: true,
        },
      },
    },
    extra: {
      ...(typeof config.extra === "object" && config.extra ? config.extra : {}),
      apiBaseUrl: apiBase,
    },
  };
};
