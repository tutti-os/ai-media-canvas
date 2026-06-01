import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  typescript: {
    ignoreBuildErrors: true,
  },
  env: {
    AIMC_SERVER_BASE_URL: process.env.AIMC_SERVER_BASE_URL,
  },
};

export default nextConfig;
