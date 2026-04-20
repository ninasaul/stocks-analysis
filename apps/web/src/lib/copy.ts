/** User-facing product copy (avoid dev-only wording in UI). */

export const compliance = {
  researchDisclaimer:
    "仅供研究参考，不构成投资建议。本产品不提供下单、委托或任何交易执行能力。",
  toolPositioning:
    "本产品为证券研究信息与技术工具，不构成证券投资咨询或资产管理服务。",
} as const;

/** 落地页、订阅页、欢迎页与 App 内引导共用（与 `use-subscription-store` 套餐名一致）。 */
export const subscriptionTierPublicCopy = {
  freeTierName: "免费版",
  proTierName: "专业版",
  subscriptionPageTitle: "订阅与会员",
  plansSectionTitle: "套餐与价格",
  /** 与 `/subscription` 对齐的长按钮/链接 */
  ctaViewPlans: "查看订阅与价格",
  /** 页眉、对话框等窄位入口 */
  ctaViewPlansShort: "订阅与价格",
  /** 订阅页专业版卡片角标，与落地页定价区一致 */
  proRecommendedBadge: "推荐",
  /** 订阅页支付卡片标题 */
  checkoutProCardTitle: "开通专业版",
  /** 已付费态提示 */
  alreadyProAlertTitle: "已订阅专业版",
} as const;

export const analyzeCopy = {
  pageSubtitle:
    "综合评分权重与五态结论见下方卡片。今日剩余可生成次数见页眉或此处配额提示。",
  paramCardDesc: "标的格式：市场代码 + 证券代码，例如 CN 与 600519 组合为 CN.600519。",
  handoffToast: "已应用选股会话中的标的与偏好。",
  remindersCardDesc: "关键价位、事件窗口与失效触发摘要。",
  quotaDialogBody:
    "当前账号或访客身份下的今日股票预测次数已用尽。登录后可按免费版或专业版获得更高日配额；也可前往订阅页查看套餐与价格。",
  exportMdToast: "已开始下载 Markdown 文件。",
  exportPdfHint: "打印 / 生成 PDF",
  exportPdfNote: "通过浏览器打印可将本页保存为 PDF，导出字段与页面展示一致。",
} as const;

export const pickerCopy = {
  complianceAlertTitle: "风险提示",
  complianceAlertBody:
    "选股输出为研究辅助信息，不构成投资建议。候选依据来自已确认偏好快照，请以实际行情与披露为准。",
  resumeTitle: "未结束的会话",
  resumeBodyPrefix: "检测到本地未结束的选股会话，可继续上次进度或重新开始。",
  sessionProgressNote: "会话进度保存在本机浏览器，清除站点数据后将丢失。",
  preferenceCardDesc: "与 preference_snapshot 一致（D1～D8；D9 可折叠查看）。",
  chatCardDesc: "助手选项在载荷完整后展示；加载过程中请勿点选未完成区域。",
  candidatesCardDesc: "每条候选的说明与偏好维度键对应，便于核对筛股逻辑。",
  sensitiveRiskAlert:
    "当前风险档为「进取」，波动与回撤可能更大；请结合自身承受能力审慎参考。",
  quotaDialogBody:
    "今日选股会话次数已达上限。可登录后按免费版或专业版获得更高日配额，或次日再试；也可前往订阅页查看套餐与价格。",
  inputPlaceholder: "补充说明或偏好（可选）",
  optionsLoading: "正在整理可选项…",
  chatIntro:
    "你好，我是智谱投研选股助手。你可以先进行一般性咨询，或选择「帮我选股」以结构化方式收敛偏好并生成候选。",
  chatEmptyTitle: "你还没有发送消息",
  chatEmptyBody: "在底部选择对话模式后输入说明，Enter 发送；Shift+Enter 换行。",
  chatEmptyModeUnset: "请先在底部选择「随便问问」或「帮我选股」，再发送第一条消息。",
  chatEmptyModeConsult: "「随便问问」用于解释市场、术语与使用方式，不写入偏好快照。",
  chatEmptyModePick: "「帮我选股」按 D1～D8 收集已确认偏好，再生成候选列表。",
  candidatesSyncNote: "下方候选与上一条助手说明一致，便于对照筛股依据。",
  copyMessageSuccess: "已复制该条内容",
  copyMessageError: "复制未成功，请手动选择文本后复制。",
  inputShortcutEnterAria: "Enter 发送说明",
  inputShortcutEnterTooltip: "发送当前输入；未按住 Shift 时生效。",
  inputShortcutNewlineAria: "Shift+Enter 换行说明",
  inputShortcutNewlineTooltip: "插入换行，不发送。",
} as const;

export const historyCopy = {
  pageSubtitle: "登录后可保存与查看个人建议存档；访客不保留历史列表。",
  needLoginTitle: "需要登录",
  needLoginDesc: "登录后可写入并查看建议存档与复盘统计。",
  recapTitle: "复盘总览",
  recapDesc: "基于已存档记录汇总执行倾向、风险分布与质量稳定性。",
  recapInsufficientTitle: "数据不足",
  recapInsufficientDesc: "请先完成至少一次股票预测，再查看复盘统计。",
  avgConfidence: "平均置信度",
  downgradedRate: "门控降级占比",
  highRiskRate: "高风险占比",
  weeklyShare: "周线分析占比",
  actionDistribution: "动作分布",
} as const;

export const subscriptionCopy = {
  pageSubtitle: "套餐权益与用量以本页为准；支付结果以服务端确认回调与对账为最终依据。",
  currentCardDesc: "当前套餐名称、计费周期与今日剩余用量（与落地页及欢迎页所述免费版、专业版一致）。",
  resetFree: "恢复为免费版",
  tableDailyAnalysis: "每日股票预测次数",
  tablePickerSessions: "每日选股会话次数",
  guestColumnLabel: "访客（未登录）",
  payCta: "使用微信支付开通专业版",
  payFailSim: "模拟支付失败",
  payCancelSim: "模拟取消支付",
  alertNote:
    "到期未续费将自动降级至免费版；用量超限时在功能页会提示升级或续费，与订阅策略一致。",
  paySuccessDesc: "订阅状态已更新。可返回工作台继续使用。",
  payRetryDesc: "请稍后重试，或联系客服处理订单异常。",
  orderSectionTitle: "订单记录",
  orderSectionDesc: "近期订阅订单（对账以支付渠道与后台为准）。",
} as const;

export const loginCopy = {
  pageSubtitle: "当前版本在浏览器本地完成身份校验与会话展示，便于产品与交互验收。",
  passwordCardDesc: "使用已注册的 11 位大陆手机号与密码登录；新用户可先注册。",
  smsCardDesc: "使用短信验证码登录；验证码发送与校验接入完成后将走服务端通道。",
  wechatCardDesc: "使用微信扫码授权登录；二维码有效期见下方计时。",
  qrPlaceholder: "微信扫码区域",
  wechatComplete: "确认授权",
  smsSentToast: "验证码已发送（当前为本地流程，未连接短信网关）。",
  resetSuccessToast: "密码已重置，请使用新密码登录。",
  resetDialogDesc:
    "通过已绑定手机号与短信验证码校验身份后设置新密码；完整流程接入后由服务端校验。",
  smsFieldNote: "验证码发送间隔由系统限制；接入短信服务后将发送真实验证码。",
  errors: {
    passwordWrong: "账号或密码不正确，请检查后重试。",
    registerFailed: "注册未成功，请稍后重试或更换手机号。",
    smsWrong: "验证码不正确或已失效，请重新获取后输入。",
  },
} as const;

export const accountCopy = {
  wechatBound: "已绑定",
  wechatNotBound: "未绑定",
  phoneMaskedLabel: "手机号（脱敏）",
  deactivateNote:
    "账号注销将按《隐私政策》处理数据删除与保留范围。完整申请入口将在账户安全能力接入后开放。",
} as const;

export const landingCopy = {
  heroEyebrow: "智谱投研 · 结构化证券研究工具",
  heroTitleLine1: "单票择时研究",
  heroTitleLine2: "标准化交付与复核",
  heroLead:
    "以统一评分框架整合技术、结构与事件信号，稳定输出五态结论与可执行研究计划。",
  heroSupport:
    "报告覆盖关注区间、风险位、观察目标位与失效条件，便于团队按同一口径复核与留痕。",
  heroBoundary:
    "仅提供研究信息与分析工具，不构成投资建议，不提供任何交易执行能力。",
  heroCtaPrimary: "进入工作台",
  heroCtaSecondary: "查看使用方式",
  heroCtaLogin: "登录或注册",
  heroLoginHint: "登录后可在工作台使用股票预测与选股对话，并统一查看订阅与用量状态。",
  heroStats: [
    { value: "5", label: "五态结论口径" },
    { value: "多维", label: "统一评分框架" },
    { value: "固定字段", label: "研究计划结构" },
  ] as const,
  heroTrustHeading: "面向研究闭环的统一交付字段",
  heroTrustPills: ["五态结论口径", "风险位与失效条件", "结构化留痕与导出"] as const,
  featuresHeading: "研究工作流与交付标准",
  featuresSectionLead:
    "围绕“分析、筛选、复盘”三类任务构建统一工作流，确保输入、结论与回看使用同一字段口径。",
  features: [
    {
      scope: "工作流 A",
      title: "单票分析与执行参考",
      description:
        "针对单只标的输出动作倾向、置信度、风险等级与关键价位，并同步给出失效条件与结论有效期。",
      deliverable: "五态结论、关注区间、风险位、目标位、失效条件",
      useCase: "用于盘中决策前复核、盘后归因与短周期跟踪。",
    },
    {
      scope: "工作流 B",
      title: "偏好收敛与候选生成",
      description:
        "通过对话逐步确认风险偏好、持有周期与主题约束，生成可解释的候选清单并保留筛选依据。",
      deliverable: "偏好快照、候选列表、入选理由与淘汰说明",
      useCase: "用于建立待研究标的池，并一键衔接至单票分析。",
    },
    {
      scope: "工作流 C",
      title: "历史存档与复盘追踪",
      description:
        "登录后自动写入建议记录并汇总复盘指标，支持按时间回看同口径字段下的历史判断与执行结果。",
      deliverable: "建议存档、复盘统计、同口径历史回看视图",
      useCase: "用于策略迭代评估、团队复盘与流程审计留痕。",
    },
    {
      scope: "工作流 D",
      title: "权益配额与使用治理",
      description:
        "在统一订阅规则下管理分析与选股日配额，并在超限、到期、降级等场景给出一致提示与升级路径。",
      deliverable: "档位口径、日配额提示、超限与到期处理规则",
      useCase: "用于保障高频使用下的资源可控、权限透明与体验一致。",
    },
  ] as const,
  howItWorksHeading: "标准使用路径",
  howItWorksLead:
    "按统一路径推进研究任务，减少跨模块切换与口径偏差。",
  howItWorksSteps: [
    {
      title: "明确任务并补齐输入",
      description: "选择分析或选股模块，补齐市场、周期与风险等关键输入。",
    },
    {
      title: "读取结论并完成复核",
      description: "围绕结论、关键位、失效条件与候选依据进行执行前复核。",
    },
    {
      title: "沉淀记录并持续跟踪",
      description: "写入历史并定期复盘，根据需要扩展订阅配额与使用容量。",
    },
  ] as const,
  pricingHeading: subscriptionTierPublicCopy.plansSectionTitle,
  pricingDesc:
    "免费版在登录后生效，覆盖日常研究与存档；专业版在每日股票预测与选股会话上提供更高额度。完整权益字段、访客规则与支付入口与订阅页一致。",
  pricingBillingOptions: [
    {
      name: "免费使用",
      price: "¥0",
      note: "登录后即生效",
      description: "覆盖基础研究流程，适合先体验再升级。",
      features: ["每日股票预测 5 次", "每日选股会话 5 次", "支持历史写入与查看"],
      cta: "查看免费版详情",
    },
    {
      name: "月付",
      price: "¥49/月",
      note: "按月续费",
      description: "适合持续跟踪阶段，按月管理预算。",
      features: ["每日股票预测 80 次", "每日选股会话 30 次", "包含全部免费版能力"],
      cta: "选择月付",
    },
    {
      name: "季付",
      price: "¥147/季",
      note: "按季续费",
      description: "适合季度节奏复盘，减少频繁续费操作。",
      features: ["每日股票预测 80 次", "每日选股会话 30 次", "包含全部免费版能力"],
      cta: "选择季付",
    },
    {
      name: "年付",
      price: "¥468/年",
      note: "约合 ¥39/月",
      description: "适合全年稳定使用，长期成本更优。",
      features: ["每日股票预测 80 次", "每日选股会话 30 次", "包含全部免费版能力"],
      cta: "选择年付",
    },
  ] as const,
  pricingFootnote:
    "价格与扣款结果以支付渠道回调及后台对账为准；自然日用量与各档完整说明以订阅页为准。",
  pricingCta: subscriptionTierPublicCopy.ctaViewPlans,
  pricingPlanCtaFree: "在订阅页查看免费版",
  pricingPlanCtaPro: "在订阅页开通专业版",
  pricingBadgePro: subscriptionTierPublicCopy.proRecommendedBadge,
  faqHeading: "常见问题",
  faqItems: [
    {
      q: "智谱投研是否提供交易指令或自动下单？",
      a: "不提供。智谱投研仅提供研究信息与结构化分析工具，不提供下单、委托或任何交易执行能力。",
    },
    {
      q: "五态结论如何用于实际研究决策？",
      a: "五态结论用于表达当前研究动作倾向（观望、试仓、加仓、减仓、离场），并与风险位、目标位、失效条件配套使用，便于执行前复核与事后复盘。",
    },
    {
      q: "为什么失效条件是必看字段？",
      a: "失效条件定义了原判断失去适用性的边界。触发后应停止沿用原方案并重新评估，避免在市场结构变化后继续执行过期结论。",
    },
    {
      q: "订阅如何计费？",
      a: "当前提供免费使用、月付、季付、年付四档。各档价格、配额与权益说明以订阅页公示为准；专业版在每日股票预测与选股会话次数上高于免费使用档。",
    },
    {
      q: "月付、季付、年付在权益上有区别吗？",
      a: "三种周期的功能边界与日配额口径一致，差异在计费周期与结算金额。订阅生效状态、扣款结果与周期到期时间以订单与对账结果为准。",
    },
    {
      q: "未登录与登录后有什么区别？",
      a: "未登录可在访客配额内体验核心流程；登录后进入免费使用档，获得更完整的历史写入与权益体系。当前身份与剩余配额会在页面实时提示。",
    },
    {
      q: "到期或超限后会发生什么？",
      a: "订阅到期未续费时将按规则回落至免费使用档；当日配额超限时，页面会给出明确提示并提供升级或续费入口。",
    },
  ] as const,
  previewMeta: "报告结构示意 · 不含标的与实时行情",
  previewTitle: "单票择时报告",
  previewFootnote:
    "上表为交付字段结构示意，不构成任何证券的研究结论或交易建议。",
  previewStatesLabel: "建议操作（五态）",
  previewStatesLine: "观望 · 试仓 · 加仓 · 减仓 · 离场",
  previewRows: ["技术信号摘要", "综合得分", "风险位与失效条件"] as const,
  previewPlaceholder: "—",
  complianceTrigger: "法律与产品定位说明",
  complianceTitle: "研究工具定位与使用边界",
  complianceBody: `${compliance.toolPositioning}不提供收益承诺。${compliance.researchDisclaimer}`,
} as const;

export const welcomeCopy = {
  metaDescription: "产品能力说明、合规边界与主要入口。",
  introLead:
    "智谱投研聚焦单只股票择时研究：将分析过程收敛为可观察的价格带、风险边界与五态建议。以下为当前版本已覆盖的主要能力模块。",
  moduleCardTitle: "能力模块",
  pathsCardDesc: "与主导航中的入口关系一致。",
} as const;

export const legalCopy = {
  privacyIntro:
    "本政策说明智谱投研如何收集、使用、存储与保护您的个人信息。正文可由法务定稿后替换，版本号与更新日期以页首为准。",
  termsAccountBody:
    "您须对账号凭证保密。免费版与专业版的权益边界、用量规则与到期降级以订阅页及系统配置为准；支付成功以支付渠道回调及后台对账确认为准。",
  thirdPartyNote:
    "涉及微信授权、支付等第三方处理时，将在本政策中列明处理类型与目的；具体以实际对接的第三方清单为准。",
} as const;
