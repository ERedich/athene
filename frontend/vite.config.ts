import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

type PackageJson = {
  version?: string;
};

function runGitCommand(command: string): string {
  try {
    return execSync(command, { encoding: "utf8" }).trim();
  } catch {
    return "unavailable";
  }
}

const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as PackageJson;

const appVersion = packageJson.version?.trim() || "unavailable";
const latestCommitHash = runGitCommand("git rev-parse --short HEAD");
const latestCommitTimestamp = runGitCommand("git log -1 --format=%cI");
const currentBranch = runGitCommand("git rev-parse --abbrev-ref HEAD");

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __GIT_COMMIT_HASH__: JSON.stringify(latestCommitHash),
    __GIT_COMMIT_TIMESTAMP__: JSON.stringify(latestCommitTimestamp),
    __GIT_BRANCH__: JSON.stringify(currentBranch),
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    host: true,
    port: 4173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
