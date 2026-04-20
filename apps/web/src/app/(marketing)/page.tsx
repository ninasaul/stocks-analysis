import type { Metadata } from "next";
import { LandingHero } from "@/components/features/landing-hero";

export const metadata: Metadata = {
  title: "智谱投研｜单票择时研究辅助",
  description:
    "单票择时结构化报告与对话式选股；研究工具定位，不提供投资咨询、收益承诺与交易执行。",
};

export default function MarketingHomePage() {
  return <LandingHero />;
}
