import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "隐私政策 | 智谱投研",
  description: "个人信息收集、使用、存储、保护与用户权利说明。",
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
