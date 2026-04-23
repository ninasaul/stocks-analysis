import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import createMDX from "@next/mdx";

const withMDX = createMDX();

const nextConfig: NextConfig = {
  output: "standalone",
  reactCompiler: true,
  pageExtensions: ["ts", "tsx", "md", "mdx"],
};

initOpenNextCloudflareForDev();

export default withMDX(nextConfig);
