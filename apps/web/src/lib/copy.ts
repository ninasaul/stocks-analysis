/** User-facing product copy (avoid dev-only wording in UI). */

export const compliance = {
  researchDisclaimer:
    "仅供研究参考，不构成投资建议。本产品不提供下单、委托或任何交易执行能力。",
  toolPositioning:
    "本产品为证券研究信息与技术工具，不构成证券投资咨询或资产管理服务。",
} as const;

export const analyzeCopy = {
  pageSubtitle:
    "综合评分权重与五态结论见下方卡片。今日剩余可生成次数见页眉或此处配额提示。",
  paramCardDesc: "标的格式：市场代码 + 证券代码，例如 CN 与 600519 组合为 CN.600519。",
  handoffToast: "已应用选股会话中的标的与偏好。",
  remindersCardDesc: "关键价位、事件窗口与失效触发摘要。",
  quotaDialogBody:
    "当前账号或访客身份下的今日股票预测次数已用尽。登录后可按订阅档位获得更高额度；也可前往订阅页了解专业档权益。",
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
    "今日选股会话次数已达上限。可登录后按订阅档位提升额度，或次日再试。",
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
  pageSubtitle: "套餐权益与用量以页面展示为准；支付结果以服务端确认回调为最终依据。",
  currentCardDesc: "当前订阅档位、周期与今日剩余用量。",
  resetFree: "恢复为免费档",
  tableDailyAnalysis: "每日股票预测次数",
  tablePickerSessions: "每日选股会话次数",
  payCta: "使用微信支付开通专业档",
  payFailSim: "模拟支付失败",
  payCancelSim: "模拟取消支付",
  alertNote:
    "到期未续费将自动降级至免费档；用量超限时在功能页会提示升级或续费，与订阅策略一致。",
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
  brandLine: "智谱投研",
  heroTitle: "让单票择时判断更可执行",
  heroLead:
    "在统一评分框架下融合技术、结构与事件信号，输出五态结论与结构化研究计划。",
  heroSupport:
    "报告覆盖关注区间、风险位、观察目标位与失效条件，便于按同一口径复盘。",
  heroBoundary:
    "仅供研究参考，不构成投资建议，不提供交易执行能力。",
  heroCtaPrimary: "开始股票预测",
  heroCtaSecondary: "进入选股对话",
  heroCtaLogin: "登录 / 注册",
  heroCtaSubscription: "了解订阅",
  highlightsHeading: "重点展示",
  highlights: [
    { label: "技术信号", value: "趋势、动量、量价结构" },
    { label: "综合得分", value: "多维信号统一评分" },
    { label: "建议操作", value: "五态结论与风险边界" },
  ] as const,
  pillarsHeading: "核心能力",
  pillars: [
    "单票结构化报告：五态结论、置信度与风险等级，关键价位与事件窗口摘要，支持 Markdown 与打印存档。",
    "对话式选股：在固定偏好维度上收敛约束，给出候选与可复述依据，并可衔接到单票择时。",
    "登录后写入建议历史与复盘统计；用量与订阅档位以账户与套餐页为准。",
  ] as const,
  pathsHeading: "快速入口",
  paths: [
    {
      title: "单票择时",
      desc: "输入标的与周期，快速得到结构化结论与风险边界。",
      cta: "去股票预测",
      href: "/app/analyze",
    },
    {
      title: "对话选股",
      desc: "通过问答收敛偏好，生成候选并衔接到股票预测。",
      cta: "去选股对话",
      href: "/app/pick",
    },
    {
      title: "订阅会员",
      desc: "查看套餐权益、当前状态与支付开通流程。",
      cta: "去订阅页",
      href: "/subscription",
    },
  ] as const,
  pricingHeading: "订阅与价格",
  pricingDesc:
    "至少提供免费档与专业档。价格与权益以订阅页实时展示与订单对账结果为准。",
  pricingCta: "查看完整套餐",
  ctaSecondaryOutline: "产品介绍",
  faqHeading: "常见问题",
  faqItems: [
    {
      q: "这个产品会直接给交易指令或自动下单吗？",
      a: "不会。本产品只提供研究信息与结构化分析结果，不提供下单、委托或交易执行能力。",
    },
    {
      q: "报告中的五态结论代表什么？",
      a: "五态结论用于表达当前研究判断的动作倾向，包括观望、试仓、加仓、减仓、离场，并会配套风险位与失效条件。",
    },
    {
      q: "为什么要看失效条件？",
      a: "失效条件用于定义何时终止原判断，避免在市场环境变化后继续沿用过时结论，是研究计划可执行与可复盘的关键字段。",
    },
    {
      q: "订阅怎么收费？",
      a: "套餐与价格以订阅页实时展示为准。当前版本至少包含免费档与专业档，专业档用于提供更高用量与会员权益。",
    },
    {
      q: "游客可以使用哪些能力？",
      a: "游客可在最低权益范围内体验核心流程；登录后可获得更完整的历史存档与权益体系。具体配额以页面公示与系统提示为准。",
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
    "您须对账号凭证保密。订阅档位、权益边界与到期降级规则以套餐页及系统配置为准；支付成功以支付渠道回调及后台对账确认为准。",
  thirdPartyNote:
    "涉及微信授权、支付等第三方处理时，将在本政策中列明处理类型与目的；具体以实际对接的第三方清单为准。",
} as const;
