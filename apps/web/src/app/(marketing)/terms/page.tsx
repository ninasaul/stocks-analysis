import type { Metadata } from "next";
import {
  LEGAL_DOC_DATE,
  LEGAL_DOC_VERSION,
  termsSections,
} from "@/lib/legal-content";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "用户服务条款 | 智谱投研",
  description: "服务范围、账号与订阅、支付与免责条款概述。",
};

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 md:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">用户服务条款</h1>
        <p className="text-muted-foreground text-sm">
          版本 {LEGAL_DOC_VERSION} · 更新日期 {LEGAL_DOC_DATE}
        </p>
      </header>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">目录</CardTitle>
          <CardDescription>本页内锚点跳转</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-1.5 text-sm">
            {termsSections.map((sec, i) => (
              <li key={sec.title}>
                <a className="text-primary underline-offset-4 hover:underline" href={`#terms-${i}`}>
                  {sec.title}
                </a>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Separator className="my-8" />
      <div className="flex flex-col gap-10">
        {termsSections.map((sec, i) => (
          <section key={sec.title} id={`terms-${i}`} className="scroll-mt-24 flex flex-col gap-3">
            <h2 className="text-lg font-medium">{sec.title}</h2>
            <div className="text-muted-foreground flex flex-col gap-2 text-sm leading-relaxed">
              {sec.body.map((p) => (
                <p key={p.slice(0, 40)}>{p}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
