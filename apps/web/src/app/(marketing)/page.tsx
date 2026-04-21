import type { Metadata } from "next";
import Script from "next/script";
import { LandingHero } from "@/components/features/landing-hero";
import { getZhputianLandingJsonLd } from "@/lib/seo/zhputian-jsonld";

export const metadata: Metadata = {
  title: "智谱投研｜单票择时研究辅助",
  description:
    "单票择时结构化报告与对话式选股；研究工具定位，不提供投资咨询、收益承诺与交易执行。",
};

export default function MarketingHomePage() {
  const ld = getZhputianLandingJsonLd();
  return (
    <>
      <Script
        id="jsonld-zhputian-landing"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />
      <LandingHero />
    </>
  );
}
