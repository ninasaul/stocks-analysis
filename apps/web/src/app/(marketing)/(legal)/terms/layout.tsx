import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "用户服务条款 | 智谱投研",
  description: "服务边界、账号责任、订阅支付、责任限制与争议解决条款说明。",
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
