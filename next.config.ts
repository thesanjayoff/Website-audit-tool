import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/lighthouse/**/*"],
  },
  serverExternalPackages: [
    "better-sqlite3",
    "playwright",
    "lighthouse",
    "chrome-launcher",
    "pa11y",
  ],
};

export default nextConfig;
