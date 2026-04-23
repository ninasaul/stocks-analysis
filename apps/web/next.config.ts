import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  reactCompiler: true,
};

initOpenNextCloudflareForDev();

export default nextConfig;
