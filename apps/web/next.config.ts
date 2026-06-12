import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const webRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(webRoot, "../..");

function readBuildId() {
  const envBuildId =
    process.env.NEXT_BUILD_ID ??
    process.env.GITHUB_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA;
  if (envBuildId) {
    return envBuildId;
  }

  try {
    return execFileSync("git", ["rev-parse", "--verify", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "local-build";
  }
}

const nextConfig: NextConfig = {
  output: "export",
  outputFileTracingRoot: repoRoot,
  generateBuildId: async () => readBuildId(),
  typescript: {
    ignoreBuildErrors: true,
  },
  env: {
    NEXT_PUBLIC_AIMC_SERVER_BASE_URL:
      process.env.NEXT_PUBLIC_AIMC_SERVER_BASE_URL ??
      process.env.AIMC_SERVER_BASE_URL,
    AIMC_SERVER_BASE_URL: process.env.AIMC_SERVER_BASE_URL,
  },
};

export default nextConfig;
