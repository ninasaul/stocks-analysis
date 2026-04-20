/** Static legal copy (FR-016 / FR-017); legal may replace body text. */

export const LEGAL_DOC_VERSION = "1.0";
export const LEGAL_DOC_DATE = "2026-04-16";

export const privacySections: { title: string; body: string[] }[] = [
  {
    title: "引言",
    body: [
      "本政策说明智谱投研如何收集、使用、存储与保护您的个人信息。正文可由法务定稿后替换，以页首版本号与更新日期为准。",
    ],
  },
  {
    title: "我们处理的数据类型",
    body: [
      "账号信息：手机号（脱敏展示）、登录方式、会话标识。",
      "使用数据：分析请求参数、选股对话偏好快照、订阅与用量统计。",
      "第三方：微信授权、支付渠道等在服务对接后适用；处理类型与目的以届时公示清单为准。",
    ],
  },
  {
    title: "保存期限与用户权利",
    body: [
      "您可申请查询、导出与注销账号；注销后业务数据按策略删除或匿名化（依法须保留的除外）。",
    ],
  },
];

export const termsSections: { title: string; body: string[] }[] = [
  {
    title: "服务范围",
    body: [
      "本产品为研究信息与分析工具，不构成投资建议、证券投资咨询或资产管理服务。不提供下单与交易执行。",
    ],
  },
  {
    title: "账号与订阅",
    body: [
      "您须对账号凭证保密。免费版与专业版的权益边界、用量规则与到期降级以订阅页及系统配置为准；支付成功以支付渠道回调及后台对账确认为准。",
    ],
  },
  {
    title: "免责声明",
    body: [
      "输出仅供参考，市场有风险。不对任何投资结果作出承诺或保证。",
    ],
  },
];
