import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { welcomeCopy } from "@/lib/copy";

export const metadata: Metadata = {
  title: "产品介绍 | 智谱投研",
  description: welcomeCopy.metaDescription,
};

const modules = [
  {
    title: "单票择时",
    desc: "五态结论、置信度与风险等级、评分分解与闸门降级说明、研究计划字段（关注区间、风险位、目标位、敞口、失效条件与有效期）。",
    href: "/app/analyze",
    cta: "打开股票预测",
  },
  {
    title: "对话式选股",
    desc: "偏好快照 D1～D9、结构化建议操作、候选结果区与进入单票择时的参数衔接。",
    href: "/app/pick",
    cta: "打开选股对话",
  },
  {
    title: "存档与复盘",
    desc: "登录后写入历史建议；列表与详情只读展示；复盘页提供命中率、平均 R 与失效触发率等汇总视图。",
    href: "/app/history",
    cta: "查看历史",
  },
  {
    title: "账号与订阅",
    desc: "手机号、验证码与微信等登录方式；套餐对比、支付流程与用量展示，并与分析能力联动。",
    href: "/subscription",
    cta: "查看订阅",
  },
] as const;

export default function WelcomePage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10 md:px-6 md:py-14">
      <div className="flex flex-col gap-2" id="overview">
        <h1 className="text-2xl font-semibold tracking-tight">产品介绍</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">{welcomeCopy.introLead}</p>
      </div>

      <Alert id="compliance">
        <AlertTitle>合规边界</AlertTitle>
        <AlertDescription className="leading-relaxed">
          不提供交易执行、不读取券商账户、不对收益作出承诺。输出均为研究结论与风险提示；详见
          <Button variant="link" className="mx-1 h-auto p-0 text-sm align-baseline" render={<Link href="/terms" />}>
            服务条款
          </Button>
          与
          <Button variant="link" className="mx-1 h-auto p-0 text-sm align-baseline" render={<Link href="/privacy" />}>
            隐私政策
          </Button>
          。
        </AlertDescription>
      </Alert>

      <div className="flex flex-col gap-4" id="modules">
        <h2 className="text-lg font-medium">{welcomeCopy.moduleCardTitle}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {modules.map((m) => (
            <Card key={m.title} className="flex flex-col">
              <CardHeader>
                <CardTitle className="text-base">{m.title}</CardTitle>
                <CardDescription className="text-pretty">{m.desc}</CardDescription>
              </CardHeader>
              <CardFooter className="mt-auto">
                <Button size="sm" render={<Link href={m.href} />}>
                  {m.cta}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>

      <Separator />

      <Card id="paths">
        <CardHeader>
          <CardTitle>典型用户路径</CardTitle>
          <CardDescription>{welcomeCopy.pathsCardDesc}</CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground flex flex-col gap-2 text-sm">
          <p>
            <span className="text-foreground font-medium">路径 A：</span>
            选股对话收敛偏好 → 候选 → 一键进入单票择时。
          </p>
          <p>
            <span className="text-foreground font-medium">路径 B：</span>
            在工作台直接输入市场与代码生成报告；若选股页已写入衔接参数，将自动预填相关字段。
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button render={<Link href="/" />}>返回首页</Button>
        <Button variant="secondary" render={<Link href="/app/analyze" />}>
          进入工作台
        </Button>
      </div>
    </div>
  );
}
