import type { Metadata } from "next";
import Script from "next/script";
import { subscriptionTierPublicCopy } from "@/lib/copy";

const subscriptionPageDescription =
  "免费版与专业版套餐与价格、访客与登录日配额、月付与年付说明；支付结果以服务端确认与对账为准。";

export const metadata: Metadata = {
  title: subscriptionTierPublicCopy.subscriptionPageTitle,
  description: subscriptionPageDescription,
};

export default function SubscriptionLayout({ children }: { children: React.ReactNode }) {
  const base =
    typeof process.env.NEXT_PUBLIC_SITE_URL === "string"
      ? process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")
      : "";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: subscriptionTierPublicCopy.subscriptionPageTitle,
    ...(base ? { url: `${base}/subscription` } : {}),
    description: subscriptionPageDescription,
  };

  return (
    <>
      <Script
        id="jsonld-subscription"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  );
}
