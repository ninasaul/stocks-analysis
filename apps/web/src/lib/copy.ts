/** User-facing product copy (avoid dev-only wording in UI). */

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
    "当前账号的今日股票预测次数已用尽。可前往订阅页查看套餐与价格并升级更高日配额。",
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
    "今日选股会话次数已达上限。可前往订阅页查看套餐与价格并升级更高日配额，或次日再试。",
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
  pageSubtitle: "可查看个人建议存档，并按历史记录进行复盘统计。",
  recapTitle: "复盘总览",
  recapDesc: "基于已存档记录汇总执行倾向、风险分布与质量稳定性。",
  recapInsufficientTitle: "数据不足",
  recapInsufficientDesc: "请先完成至少一次股票预测，再查看复盘统计。",
  avgConfidence: "平均置信度",
  avgExpectedReturn: "平均预期盈利率",
  expectedReturnHelp:
    "以报告生成时的参考价与模型目标价为基准测算的相对变动百分比；仅供复盘对照，不代表真实成交或已实现损益。",
  positiveExpectedShare: "正预期盈利率占比",
  downgradedRate: "门控降级占比",
  gatePassRate: "门控通过率",
  highRiskRate: "高风险占比",
  weeklyShare: "周线分析占比",
  actionDistribution: "动作分布",
  actionDistributionHint:
    "各动作条数占全部存档的百分比；若某一柱过高，说明结论类型过于集中。",
  recapSnapshotTitle: "数据摘要",
  recapSnapshotDesc: "汇总样本规模、置信与预期收益测算，便于快速把握整体倾向。",
  recapDistributionTitle: "动作与分布",
  recapDistributionDesc: "柱状图为各动作条数占比；右侧为门控、风险与周期维度的结构指标。",
  recapRiskMixTitle: "风险等级构成",
  recapRiskMixHint: "三条合计为 100%，对应各条存档的风险标签。",
  riskTierLow: "低风险",
  riskTierMedium: "中风险",
  riskTierHigh: "高风险",
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
  pageSubtitle: "账号支持用户名、邮箱或手机号登录；注册后自动创建会话并进入工作台。",
  passwordCardDesc: "使用用户名、邮箱或手机号与密码登录；新用户可先注册。",
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
  wechatNotConfigured: "微信登录尚未在服务端配置，请联系管理员或改用密码登录。",
  wechatQrLoadFailed: "无法获取微信登录二维码，请稍后重试。",
  wechatCallbackMissingCode: "授权未完成或链接无效，请返回登录页重试。",
  wechatCallbackStateMismatch: "登录状态校验未通过，请关闭本页后重新扫码。",
  wechatDenied: "你已取消微信授权。",
} as const;

export const accountCopy = {
  wechatBound: "已绑定",
  wechatNotBound: "未绑定",
  phoneMaskedLabel: "手机号（脱敏）",
  deactivateNote:
    "账号注销将按《隐私政策》处理数据删除与保留范围。完整申请入口将在账户安全能力接入后开放。",
} as const;

export const landingCopy = {
  heroEyebrow: "智谱投研 · 面向个人投资者的研究辅助",
  heroTitleLine1: "单票择时分析",
  heroTitleLine2: "结构化报告与复核",
  heroLead:
    "在统一评分下汇总技术、结构与风险、事件折扣等维度，输出五态结论与研究计划要点，供您整理单票择时判断。",
  heroSupport:
    "报告载明关注区间、风险位、观察目标位及失效条件，便于对照关键价位，并支持导出或打印以便自行留档。",
  heroBoundary:
    "仅提供研究信息与分析工具，不构成投资建议，不提供任何交易执行能力。",
  heroCtaPrimary: "进入工作台",
  heroCtaSecondary: "查看使用说明",
  heroCtaLogin: "登录或注册",
  heroLoginHint: "登录后可使用股票预测与选股对话，并在同一处查看订阅与当日剩余次数。",
  heroStats: [
    { value: "5", label: "五态结论" },
    { value: "综合", label: "评分与拆解" },
    { value: "固定", label: "报告版式字段" },
  ] as const,
  heroTrustHeading: "报告中的重点信息",
  heroTrustPills: ["五态与综合评分", "关键价位与失效条件", "导出与打印留痕"] as const,
  featuresHeading: "核心功能说明",
  featuresSectionLead:
    "已确定标的：生成单票结构化择时报告。尚未收窄范围：以选股对话确认条件并获取候选及说明。登录后：可查阅已保存建议并进入复盘。内容由大模型在您提供信息的基础上生成，仅供研究参考，请结合公开信息自行判断与复核。",
  featuresMatrixSummary: {
    label: "功能概览",
    value: "4",
    caption: "单票分析 · 选股辅助 · 建议记录 · 智能生成",
  } as const,
  featuresAnalyzeCta: "进入股票预测",
  features: [
    {
      scope: "股票预测",
      title: "单票结构化择时报告",
      description:
        "一页呈现结论倾向、综合评分、风险等级与研究计划，并标明关注区间、风险位、观察目标位及失效条件；支持 Markdown 导出或浏览器打印，便于留档与复核。",
      deliverable: "固定版式、关键价位、导出与打印",
      useCase: "单票研判、核对关键价位与失效条件时使用。",
    },
    {
      scope: "选股对话",
      title: "条件化候选筛选",
      description:
        "以对话方式确认市场、风险偏好与持有周期等条件，生成附带依据说明的候选列表；可按需进入单票报告，使筛选结论与深读分析在同一路径内衔接。",
      deliverable: "偏好摘要、候选依据、衔接单票分析",
      useCase: "关注面较宽、需可解释筛选再下钻时使用。",
    },
    {
      scope: "登录后",
      title: "建议记录与复盘",
      description:
        "登录后自动保存股票预测相关建议，支持按时间查阅当时结论与复盘摘要；列表与复盘所涉字段口径与正式报告一致，便于对照当时判断。",
      deliverable: "建议列表、复盘视图、口径一致",
      useCase: "留存研究记录、定期回顾判断质量时使用。",
    },
    {
      scope: "智能生成",
      title: "大模型驱动的研究输出",
      description:
        "股票预测与选股说明均由大模型在您提交信息的基础上生成：单票写入固定版式字段，选股结合对话输出候选与自然语言依据；均可导出或打印，决策与风险须由您本人把关。",
      deliverable: "模型说明、版式字段、与对话衔接",
      useCase: "借助 AI 汇总与表述要点、自行完成决策把关时使用。",
    },
  ] as const,
  howItWorksHeading: "工作原理",
  howItWorksBody:
    "全流程由 AI Agent 驱动：根据你的输入自动选择「股票预测」或「选股对话」路径，边交互边收敛，再生成结构化结论并沉淀到历史复盘。登录后可在「我的账号 / 订阅」查看当日额度与套餐状态；股票预测与选股会话按日分别计次。",
  pricingHeading: subscriptionTierPublicCopy.plansSectionTitle,
  pricingDesc:
    "免费版登录后生效，含基础研究与历史存档；专业版在股票预测与选股会话的每日次数上更高。访客规则、权益字段与支付入口以订阅页为准。",
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
  pricingBelowPlansNote:
    "登录后为免费版；更高额度见订阅页。扣款与到账以支付渠道及后台为准；日用量与各档说明见订阅页。",
  pricingCta: subscriptionTierPublicCopy.ctaViewPlans,
  pricingPlanCtaFree: "在订阅页查看免费版",
  pricingPlanCtaPro: "在订阅页开通专业版",
  pricingBadgePro: subscriptionTierPublicCopy.proRecommendedBadge,
  faqHeading: "常见问题",
  faqItems: [
    {
      q: "智谱投研是否提供交易指令或自动下单？",
      a: "不提供。智谱投研定位为研究辅助工具，仅输出结构化分析信息，不提供下单、委托、跟单或任何自动交易执行能力。",
    },
    {
      q: "五态结论如何用于实际研究决策？",
      a: "五态用于表达当前动作倾向（观望、试仓、加仓、减仓、离场）。建议与风险位、目标位、失效条件一起使用：执行前先核对边界，执行后按同一口径复盘结果。",
    },
    {
      q: "为什么失效条件是必看字段？",
      a: "失效条件定义了原判断不再成立的边界。一旦触发，应停止沿用原方案并重新评估，避免在市场结构变化后继续执行过期结论。",
    },
    {
      q: "订阅如何计费？",
      a: "当前提供免费使用、月付、季付、年付四档。各档价格、日配额与权益说明以订阅页公示为准；专业版在每日股票预测和选股会话次数上高于免费使用档。",
    },
    {
      q: "月付、季付、年付在权益上有区别吗？",
      a: "三种周期的功能边界与日配额口径一致，主要差异是计费周期与结算金额。实际生效状态、扣款结果和到期时间以订单记录与对账结果为准。",
    },
    {
      q: "未登录与登录后有什么区别？",
      a: "未登录可在访客配额内体验核心流程；登录后进入免费使用档，可使用更完整的历史记录与权益体系。当前身份与剩余配额会在页面实时提示。",
    },
    {
      q: "到期或超限后会发生什么？",
      a: "订阅到期未续费时将按规则回落至免费使用档；当日配额超限时，页面会给出明确提示，并提供升级或续费入口。",
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
} as const;

export const marketingFooterCopy = {
  brandTagline: "面向个人投资者的单票择时研究辅助：结构化报告、选股对话与建议存档。",
  brandDisclaimer: "仅供研究参考，不构成投资建议；不提供交易执行。",
  columns: [
    {
      title: "产品",
      links: [
        { href: "/#landing-features", label: "功能" },
        { href: "/#landing-pricing", label: "套餐与价格" },
        { href: "/#landing-how", label: "使用说明" },
        { href: "/welcome", label: "产品介绍" },
      ],
    },
    {
      title: "账户",
      links: [
        { href: "/login", label: "登录" },
        { href: "/subscription", label: "订阅与配额" },
        { href: "/app/analyze", label: "进入工作台" },
        { href: "/#landing-faq", label: "常见问题" },
      ],
    },
    {
      title: "法律信息",
      links: [
        { href: "/privacy", label: "隐私政策" },
        { href: "/terms", label: "服务条款" },
      ],
    },
  ] as const,
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
