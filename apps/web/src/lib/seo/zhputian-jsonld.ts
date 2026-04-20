/** 结构化数据；设置 `NEXT_PUBLIC_SITE_URL`（无尾斜杠）后写入 canonical 与 Organization.url。 */
export function getZhputianLandingJsonLd() {
  const base =
    typeof process.env.NEXT_PUBLIC_SITE_URL === "string"
      ? process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")
      : "";

  const graph: Record<string, unknown>[] = [
    {
      "@type": "SoftwareApplication",
      name: "智谱投研",
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "CNY",
        lowPrice: "0",
        highPrice: "468",
        offerCount: 2,
        offers: [
          {
            "@type": "Offer",
            name: "免费版",
            price: "0",
            priceCurrency: "CNY",
            description: "登录后每日股票预测与选股会话基础配额",
          },
          {
            "@type": "Offer",
            name: "专业版月付",
            price: "49",
            priceCurrency: "CNY",
            priceValidUntil: "2027-12-31",
            description: "专业版连续包月",
          },
          {
            "@type": "Offer",
            name: "专业版年付",
            price: "468",
            priceCurrency: "CNY",
            priceValidUntil: "2027-12-31",
            description: "专业版按年续费",
          },
        ],
      },
    },
  ];

  if (base) {
    graph.unshift({
      "@type": "Organization",
      name: "智谱投研",
      url: base,
    });
  }

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}
