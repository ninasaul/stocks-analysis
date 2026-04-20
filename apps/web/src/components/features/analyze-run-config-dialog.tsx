"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  BarChart3Icon,
  BookOpenIcon,
  GaugeIcon,
  InfoIcon,
  LayersIcon,
  LibraryIcon,
  NewspaperIcon,
  RadioIcon,
  SearchIcon,
  Share2Icon,
} from "lucide-react";
import { toast } from "sonner";
import type { AnalysisInput, PreferenceSnapshot } from "@/lib/contracts/domain";
import {
  fuzzyAnalyzeSymbolScore,
  parseAnalyzeSearchInput,
  type AnalyzeSymbolSearchItem,
} from "@/lib/analyze-symbol-search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { DatePicker } from "@/components/ui/date-picker";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const MODEL_OPTIONS = [
  "Qwen3.5-Flash",
  "Qwen3.5-Plus",
  "Qwen3.5-Max",
  "Qwen3.5-Coder",
] as const;

type AnalysisDepth = 1 | 2 | 3 | 4 | 5;
type AnalystRole = "market" | "fundamental" | "news" | "social";
type LanguagePref = "zh" | "en";

const DEPTH_META: Record<
  AnalysisDepth,
  { title: string; description: string; duration: string; Icon: typeof GaugeIcon }
> = {
  1: {
    title: "一级 · 快速分析",
    description: "基础数据概览，辅助快速判断",
    duration: "约 2～5 分钟",
    Icon: GaugeIcon,
  },
  2: {
    title: "二级 · 基础分析",
    description: "满足日常投资决策",
    duration: "约 3～6 分钟",
    Icon: BarChart3Icon,
  },
  3: {
    title: "三级 · 标准分析",
    description: "技术面与基本面结合，推荐默认",
    duration: "约 4～8 分钟",
    Icon: LayersIcon,
  },
  4: {
    title: "四级 · 深度分析",
    description: "多轮推演与更细颗粒研究",
    duration: "约 6～11 分钟",
    Icon: BookOpenIcon,
  },
  5: {
    title: "五级 · 全面分析",
    description: "覆盖主要假设与风险分支",
    duration: "约 8～16 分钟",
    Icon: LibraryIcon,
  },
};

const DEPTH_HOLDING_RISK: Record<
  AnalysisDepth,
  Pick<AnalysisInput, "holding_horizon" | "risk_tier">
> = {
  1: { holding_horizon: "intraday_to_days", risk_tier: "conservative" },
  2: { holding_horizon: "w1_to_w4", risk_tier: "balanced" },
  3: { holding_horizon: "m1_to_m3", risk_tier: "balanced" },
  4: { holding_horizon: "m1_to_m3", risk_tier: "aggressive" },
  5: { holding_horizon: "m3_plus", risk_tier: "aggressive" },
};

const DEPTH_BASE_COST: Record<AnalysisDepth, number> = {
  1: 0.85,
  2: 1.05,
  3: 1.5,
  4: 2.05,
  5: 2.55,
};

const ANALYST_ROWS: {
  id: AnalystRole;
  title: string;
  description: string;
  Icon: typeof RadioIcon;
  disabledForMarket?: AnalysisInput["market"];
}[] = [
  {
    id: "market",
    title: "市场分析师",
    description: "趋势结构、行业与宏观环境",
    Icon: RadioIcon,
  },
  {
    id: "fundamental",
    title: "基本面分析师",
    description: "财务质量、商业模式与竞争壁垒",
    Icon: BarChart3Icon,
  },
  {
    id: "news",
    title: "新闻分析师",
    description: "公告、新闻与事件驱动线索",
    Icon: NewspaperIcon,
  },
  {
    id: "social",
    title: "社媒分析师",
    description: "舆情与情绪线索",
    Icon: Share2Icon,
    disabledForMarket: "CN",
  },
];

const marketLabels: Record<AnalysisInput["market"], string> = {
  CN: "A 股",
  HK: "港股",
  US: "美股",
};

function HelpTip({ label, content }: { label: string; content: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button type="button" variant="ghost" size="icon-xs" aria-label={label}>
            <InfoIcon />
          </Button>
        }
      />
      <TooltipContent side="top" align="start">
        <p className="m-0 max-w-64 text-xs leading-normal">{content}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function renderHighlightedText(text: string, query: string) {
  const q = query.trim();
  if (!q) return text;
  const lowerText = text.toLowerCase();
  const lowerQuery = q.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);
  if (index === -1) return text;
  const end = index + q.length;
  return (
    <>
      {text.slice(0, index)}
      <span className="bg-muted text-foreground rounded-sm">{text.slice(index, end)}</span>
      {text.slice(end)}
    </>
  );
}

function inferDepth(risk: AnalysisInput["risk_tier"], holding: AnalysisInput["holding_horizon"]): AnalysisDepth {
  if (holding === "intraday_to_days" && risk === "conservative") return 1;
  if (holding === "w1_to_w4") return 2;
  if (holding === "m3_plus") return 5;
  if (holding === "m1_to_m3" && risk === "aggressive") return 4;
  if (holding === "m1_to_m3") return 3;
  return 3;
}

function themeKey(role: AnalystRole) {
  return `analyst:${role}`;
}

function parseAnalystsFromThemes(themes: string[]): Set<AnalystRole> {
  const next = new Set<AnalystRole>();
  for (const t of themes) {
    if (t === "analyst:market") next.add("market");
    if (t === "analyst:fundamental") next.add("fundamental");
    if (t === "analyst:news") next.add("news");
    if (t === "analyst:social") next.add("social");
  }
  if (next.size === 0) {
    next.add("market");
    next.add("fundamental");
  }
  return next;
}

function parseModelFromThemes(themes: string[], key: "model_quick" | "model_deep", fallback: string) {
  const prefix = `${key}:`;
  for (const t of themes) {
    if (t.startsWith(prefix)) return t.slice(prefix.length) || fallback;
  }
  return fallback;
}

function parseLangFromThemes(themes: string[]): LanguagePref {
  for (const t of themes) {
    if (t === "lang:en") return "en";
    if (t === "lang:zh") return "zh";
  }
  return "zh";
}

function parseFeature(themes: string[], key: string) {
  return themes.includes(`feature:${key}`);
}

function stripConfigurableThemes(themes: string[]) {
  return themes.filter(
    (t) =>
      !t.startsWith("analyst:") &&
      !t.startsWith("feature:") &&
      !t.startsWith("lang:") &&
      !t.startsWith("model_quick:") &&
      !t.startsWith("model_deep:"),
  );
}

function formatDateInput(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildPreferenceSnapshot(args: {
  market: AnalysisInput["market"];
  depth: AnalysisDepth;
  analysts: Set<AnalystRole>;
  quickModel: string;
  deepModel: string;
  sentiment: boolean;
  riskAssessment: boolean;
  language: LanguagePref;
  analysisDate: string;
  linked: PreferenceSnapshot | null;
}): PreferenceSnapshot {
  const { holding_horizon, risk_tier } = DEPTH_HOLDING_RISK[args.depth];
  const base: PreferenceSnapshot = args.linked
    ? {
        ...args.linked,
        market: args.market,
        holding_horizon,
        risk_tier,
      }
    : {
        market: args.market,
        sector_mode: "unrestricted",
        sectors: [],
        themes: [],
        holding_horizon,
        risk_tier,
        style: "no_preference",
        cap_liquidity: "unrestricted",
        exclusions: [],
        other_notes: null,
      };

  const analystThemes = [...args.analysts].map(themeKey);
  const featureThemes = [
    args.sentiment ? "feature:sentiment" : null,
    args.riskAssessment ? "feature:risk_assessment" : null,
  ].filter(Boolean) as string[];
  const modelThemes = [`model_quick:${args.quickModel}`, `model_deep:${args.deepModel}`];
  const langTheme = `lang:${args.language}`;

  const themes = [
    ...stripConfigurableThemes(base.themes),
    ...analystThemes,
    ...featureThemes,
    ...modelThemes,
    langTheme,
  ];

  const dateLine = `分析日期：${args.analysisDate}`;
  const prior = base.other_notes?.trim();
  const other_notes = prior ? `${dateLine}\n${prior}` : dateLine;

  return { ...base, themes, other_notes };
}

export type AnalyzeRunConfigConfirm = {
  input: AnalysisInput;
  displayKeyword: string;
};

type AnalyzeRunConfigDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  /** 与 analyze 页一致的合并证券池（含最近分析），用于弹窗内模糊搜索。 */
  symbolSearchItems: AnalyzeSymbolSearchItem[];
  searchKeyword: string;
  market: AnalysisInput["market"];
  riskTier: AnalysisInput["risk_tier"];
  holdingHorizon: AnalysisInput["holding_horizon"];
  linkedPreference: PreferenceSnapshot | null;
  onConfirm: (payload: AnalyzeRunConfigConfirm) => void | Promise<void>;
};

export function AnalyzeRunConfigDialog({
  open,
  onOpenChange,
  loading,
  symbolSearchItems,
  searchKeyword,
  market,
  riskTier,
  holdingHorizon,
  linkedPreference,
  onConfirm,
}: AnalyzeRunConfigDialogProps) {
  const reactId = useId();
  const fieldId = reactId.replace(/:/g, "");
  const formId = `${fieldId}-analyze-form`;
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const [searchDraft, setSearchDraft] = useState("");
  const [fallbackMarket, setFallbackMarket] = useState<AnalysisInput["market"]>("CN");
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [depth, setDepth] = useState<AnalysisDepth>(3);
  const [analysts, setAnalysts] = useState<Set<AnalystRole>>(() => new Set(["market", "fundamental"]));
  const [quickModel, setQuickModel] = useState<string>(MODEL_OPTIONS[0]);
  const [deepModel, setDeepModel] = useState<string>(MODEL_OPTIONS[1]);
  const [sentiment, setSentiment] = useState(true);
  const [riskAssessment, setRiskAssessment] = useState(true);
  const [language, setLanguage] = useState<LanguagePref>("zh");
  const [analysisDate, setAnalysisDate] = useState(() => formatDateInput(new Date()));
  const [previewNonce, setPreviewNonce] = useState(0);

  useEffect(() => {
    if (!open) return;
    setSearchDraft(searchKeyword.trim());
    setFallbackMarket(market);
    setDepth(inferDepth(riskTier, holdingHorizon));
    const themes = linkedPreference?.themes ?? [];
    setAnalysts(parseAnalystsFromThemes(themes));
    setQuickModel(parseModelFromThemes(themes, "model_quick", MODEL_OPTIONS[0]));
    setDeepModel(parseModelFromThemes(themes, "model_deep", MODEL_OPTIONS[1]));
    const hasFeatureTag = themes.some((t) => t.startsWith("feature:"));
    setSentiment(hasFeatureTag ? parseFeature(themes, "sentiment") : true);
    setRiskAssessment(hasFeatureTag ? parseFeature(themes, "risk_assessment") : true);
    setLanguage(parseLangFromThemes(themes));
    setAnalysisDate(formatDateInput(new Date()));
    setPreviewNonce(0);
    setSearchFocused(false);
    setActiveSearchIndex(0);
  }, [open, searchKeyword, market, riskTier, holdingHorizon, linkedPreference]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      document.getElementById(`${fieldId}-search`)?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, fieldId]);

  const filteredSearchItems = useMemo(() => {
    const query = searchDraft.trim().toLowerCase();
    if (!query) {
      return symbolSearchItems.slice(0, 10);
    }
    return symbolSearchItems
      .map((item, index) => ({
        item,
        recentRank: index,
        score: fuzzyAnalyzeSymbolScore(item, query),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.recentRank - b.recentRank;
      })
      .slice(0, 12)
      .map((entry) => entry.item);
  }, [symbolSearchItems, searchDraft]);

  useEffect(() => {
    if (!searchFocused) return;
    setActiveSearchIndex((prev) => {
      if (!filteredSearchItems.length) return 0;
      return Math.min(prev, filteredSearchItems.length - 1);
    });
  }, [filteredSearchItems.length, searchFocused]);

  useEffect(() => {
    if (!searchFocused) return;
    setActiveSearchIndex(0);
  }, [searchDraft, searchFocused]);

  const resolvedMarket = useMemo(() => {
    const p = parseAnalyzeSearchInput(searchDraft.trim(), fallbackMarket);
    return p?.market ?? fallbackMarket;
  }, [searchDraft, fallbackMarket]);

  useEffect(() => {
    if (resolvedMarket !== "CN") return;
    setAnalysts((prev) => {
      if (!prev.has("social")) return prev;
      const next = new Set(prev);
      next.delete("social");
      return next;
    });
  }, [resolvedMarket]);

  const applySearchItem = (item: AnalyzeSymbolSearchItem) => {
    setFallbackMarket(item.market);
    setSearchDraft(`${item.market}.${item.symbol}`);
    setSearchFocused(false);
  };

  const analystAddonEach = 0.15;
  const costPreview = useMemo(() => {
    const depthCost = DEPTH_BASE_COST[depth];
    const selected = [...analysts];
    const addon = selected.length * analystAddonEach;
    return {
      depthCost,
      addon,
      total: Math.round((depthCost + addon) * 100) / 100,
      lines: selected.map((id) => ({
        id,
        label: ANALYST_ROWS.find((r) => r.id === id)?.title ?? id,
        value: analystAddonEach,
      })),
    };
  }, [analysts, depth, previewNonce]);

  const handleDepthKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      let next: AnalysisDepth | null = null;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        if (depth < 5) next = ((depth + 1) as AnalysisDepth);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        if (depth > 1) next = ((depth - 1) as AnalysisDepth);
      } else if (event.key === "Home") {
        event.preventDefault();
        next = 1;
      } else if (event.key === "End") {
        event.preventDefault();
        next = 5;
      }
      if (next !== null) {
        setDepth(next);
        queueMicrotask(() => document.getElementById(`${fieldId}-depth-${next}`)?.focus());
      }
    },
    [depth, fieldId],
  );

  const handleDialogOpenChange = useCallback(
    (next: boolean) => {
      if (!next && loading) return;
      onOpenChange(next);
    },
    [loading, onOpenChange],
  );

  const modelHint =
    depth <= 2
      ? "当前深度偏轻量，快模型承担主要推理；深模型用于关键结论复核。"
      : depth >= 4
        ? "当前深度偏高负载，建议深模型使用更强规格，以降低结论波动。"
        : "标准深度下快模型覆盖大部分检索与归纳，深模型负责结构化决策链。";

  const toggleAnalyst = (id: AnalystRole, disabled?: boolean) => {
    if (disabled) return;
    setAnalysts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size <= 1) return next;
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const canSubmitSearch = useMemo(() => {
    const p = parseAnalyzeSearchInput(searchDraft.trim(), fallbackMarket);
    return Boolean(p?.symbol?.trim());
  }, [searchDraft, fallbackMarket]);

  const handleConfirm = async () => {
    if (loading) return;
    const parsed = parseAnalyzeSearchInput(searchDraft.trim(), fallbackMarket);
    if (!parsed?.symbol?.trim()) {
      toast.error("请选择或输入标的，支持代码、简称或 CN.600519 格式。");
      return;
    }
    const preference_snapshot = buildPreferenceSnapshot({
      market: parsed.market,
      depth,
      analysts,
      quickModel,
      deepModel,
      sentiment,
      riskAssessment,
      language,
      analysisDate,
      linked: linkedPreference,
    });
    const { holding_horizon, risk_tier } = DEPTH_HOLDING_RISK[depth];
    const input: AnalysisInput = {
      symbol: parsed.symbol,
      market: parsed.market,
      timeframe: "daily",
      risk_tier,
      holding_horizon,
      preference_snapshot,
    };
    const displayKeyword = `${parsed.market}.${parsed.symbol}`;
    await onConfirm({ input, displayKeyword });
  };

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleConfirm();
  };

  const depthLegendId = `${fieldId}-depth-legend`;
  const analystLegendId = `${fieldId}-analyst-legend`;
  const sentimentLabelId = `${fieldId}-sentiment-label`;
  const riskLabelId = `${fieldId}-risk-label`;

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        showCloseButton
        closeSrOnlyLabel="关闭"
        aria-busy={loading}
        className="flex min-h-0 max-h-[min(92vh,880px)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl"
      >
        <DialogHeader className="shrink-0 gap-1 border-b px-4 py-3">
          <DialogTitle>分析配置</DialogTitle>
        </DialogHeader>

        {/* 中间区在 flex 列中须 min-h-0，否则子项按内容撑高会导致无法滚动；原生 overflow-y-auto 比 ScrollArea 更易获得确定高度 */}
        <div
          className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain"
          role="region"
          aria-label="分析参数（可滚动）"
        >
          <form
            id={formId}
            noValidate
            onSubmit={handleFormSubmit}
            className="grid gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,280px)]"
            aria-label="分析参数"
            aria-busy={loading}
          >
            <FieldGroup className="gap-6">
              <FieldSet className="min-w-0 gap-4 border-0 p-0" disabled={loading}>
                <FieldLegend variant="label" className="px-0">
                  必填信息
                </FieldLegend>
                <FieldGroup className="gap-4">
                  <Field>
                    <FieldLabel htmlFor={`${fieldId}-search`}>
                      <span>搜索标的</span>
                      <HelpTip
                        label="搜索标的说明"
                        content="与页顶搜索同源；可点选下拉结果，也可手输代码。带 CN./HK./US. 前缀时以前缀为准。"
                      />
                    </FieldLabel>
                    <div
                      ref={searchBoxRef}
                      className="relative w-full max-w-full"
                      onBlur={(event) => {
                        const next = event.relatedTarget;
                        if (next instanceof Node && searchBoxRef.current?.contains(next)) return;
                        setSearchFocused(false);
                      }}
                    >
                      <InputGroup>
                        <InputGroupAddon align="inline-start">
                          <InputGroupText>
                            <SearchIcon aria-hidden className="size-4" />
                            <span className="sr-only">搜索股票</span>
                          </InputGroupText>
                        </InputGroupAddon>
                        <InputGroupInput
                          id={`${fieldId}-search`}
                          name="symbolSearch"
                          value={searchDraft}
                          onFocus={() => setSearchFocused(true)}
                          onChange={(e) => {
                            setSearchDraft(e.target.value);
                            if (!searchFocused) setSearchFocused(true);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowDown") {
                              e.preventDefault();
                              if (!searchFocused) setSearchFocused(true);
                              setActiveSearchIndex((prev) =>
                                filteredSearchItems.length
                                  ? Math.min(prev + 1, filteredSearchItems.length - 1)
                                  : 0,
                              );
                              return;
                            }
                            if (e.key === "ArrowUp") {
                              e.preventDefault();
                              if (!searchFocused) setSearchFocused(true);
                              setActiveSearchIndex((prev) =>
                                filteredSearchItems.length ? Math.max(prev - 1, 0) : 0,
                              );
                              return;
                            }
                            if (e.key === "Escape") {
                              setSearchFocused(false);
                              return;
                            }
                            if (e.key === "Enter") {
                              if (searchFocused && filteredSearchItems.length > 0) {
                                e.preventDefault();
                                const picked =
                                  filteredSearchItems[activeSearchIndex] ?? filteredSearchItems[0];
                                if (picked) applySearchItem(picked);
                              }
                            }
                          }}
                          placeholder="代码或简称，例如 茅台、AAPL；无下拉时可手输 CN.600519"
                          autoComplete="off"
                          aria-required="true"
                          aria-autocomplete="list"
                          aria-expanded={searchFocused && filteredSearchItems.length > 0}
                          aria-controls={searchFocused ? `${fieldId}-search-listbox` : undefined}
                        />
                      </InputGroup>
                      {searchFocused ? (
                        <div
                          id={`${fieldId}-search-listbox`}
                          role="listbox"
                          className="absolute top-full z-60 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border bg-popover p-1 shadow-md"
                        >
                          {filteredSearchItems.length ? (
                            filteredSearchItems.map((item, index) => (
                              <Button
                                key={item.key}
                                type="button"
                                role="option"
                                aria-selected={activeSearchIndex === index}
                                variant={activeSearchIndex === index ? "secondary" : "ghost"}
                                className="h-auto w-full justify-start py-2"
                                onMouseEnter={() => setActiveSearchIndex(index)}
                                onClick={() => applySearchItem(item)}
                              >
                                <div className="flex w-full items-start justify-between gap-2 text-left">
                                  <div className="flex min-w-0 flex-col items-start">
                                    <span>
                                      {item.market}.{renderHighlightedText(item.symbol, searchDraft)}
                                    </span>
                                    <span className="text-muted-foreground text-xs">
                                      {renderHighlightedText(item.name, searchDraft)}
                                    </span>
                                  </div>
                                  <Badge variant="outline">{marketLabels[item.market]}</Badge>
                                </div>
                              </Button>
                            ))
                          ) : (
                            <p className="text-muted-foreground px-2 py-1.5 text-sm">无匹配标的</p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${fieldId}-date`}>
                      <span>分析日期</span>
                      <HelpTip
                        label="分析日期说明"
                        content="日期会写入偏好快照，用于报告中结论时间基准的追溯。"
                      />
                    </FieldLabel>
                    <DatePicker
                      id={`${fieldId}-date`}
                      value={analysisDate}
                      onValueChange={setAnalysisDate}
                      disabled={loading}
                    />
                  </Field>
                </FieldGroup>
              </FieldSet>

              <FieldSet className="min-w-0 gap-3 border-0 p-0" disabled={loading}>
                <FieldLegend variant="label" className="flex items-center gap-1 px-0" id={depthLegendId}>
                  <span>分析深度</span>
                  <HelpTip
                    label="分析深度说明"
                    content="深度越高，报告覆盖的假设与验证步骤越多，耗时与算力预估同步上升。可用方向键、Home、End 切换。"
                  />
                </FieldLegend>
                <FieldGroup
                  data-slot="radio-group"
                  role="radiogroup"
                  aria-labelledby={depthLegendId}
                  aria-required="true"
                  className="grid gap-2 sm:grid-cols-2"
                  onKeyDown={handleDepthKeyDown}
                >
                  {([1, 2, 3, 4, 5] as const).map((level) => {
                    const meta = DEPTH_META[level];
                    const Icon = meta.Icon;
                    const selected = depth === level;
                    return (
                      <Button
                        key={level}
                        id={`${fieldId}-depth-${level}`}
                        type="button"
                        role="radio"
                        tabIndex={selected ? 0 : -1}
                        aria-checked={selected}
                        aria-setsize={5}
                        aria-posinset={level}
                        variant={selected ? "secondary" : "outline"}
                        className="h-auto min-h-8 w-full flex-col items-start gap-1 whitespace-normal py-3 text-wrap"
                        onClick={() => {
                          setDepth(level);
                          queueMicrotask(() => document.getElementById(`${fieldId}-depth-${level}`)?.focus());
                        }}
                      >
                        <span className="flex w-full items-center gap-2 text-left font-medium">
                          <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                          {meta.title}
                        </span>
                        <span className="w-full text-left text-xs font-normal text-muted-foreground">
                          {meta.description}
                        </span>
                        <span className="text-xs text-muted-foreground">{meta.duration}</span>
                      </Button>
                    );
                  })}
                </FieldGroup>
              </FieldSet>

              <FieldSet className="min-w-0 gap-3 border-0 p-0" disabled={loading}>
                <FieldLegend
                  variant="label"
                  className="flex items-center gap-1 px-0"
                  id={analystLegendId}
                >
                  <span>分析师团队</span>
                  <HelpTip
                    label="分析师团队说明"
                    content="至少保留一名分析师；可按研究重点增减团队。"
                  />
                </FieldLegend>
                <FieldGroup
                  data-slot="checkbox-group"
                  role="group"
                  aria-labelledby={analystLegendId}
                  className="grid gap-2 sm:grid-cols-2"
                >
                  {ANALYST_ROWS.map((row) => {
                    const disabled = row.disabledForMarket === resolvedMarket;
                    const checked = analysts.has(row.id) && !disabled;
                    const Icon = row.Icon;
                    const boxId = `${fieldId}-analyst-${row.id}`;
                    return (
                      <Field
                        key={row.id}
                        orientation="horizontal"
                        className="items-start gap-3 rounded-lg border p-3"
                      >
                        <Checkbox
                          id={boxId}
                          checked={checked}
                          disabled={disabled}
                          onCheckedChange={() => toggleAnalyst(row.id, disabled)}
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <FieldLabel htmlFor={boxId} className="w-full cursor-pointer gap-2 leading-snug">
                            <span className="flex items-center gap-2 font-medium">
                              <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                              {row.title}
                            </span>
                          </FieldLabel>
                          <FieldDescription>{row.description}</FieldDescription>
                          {disabled ? (
                            <FieldDescription>A 股市场下该角色不可用。</FieldDescription>
                          ) : null}
                        </div>
                      </Field>
                    );
                  })}
                </FieldGroup>
              </FieldSet>
            </FieldGroup>

            <FieldGroup className="gap-5 rounded-lg border bg-muted/20 p-4 lg:border-0 lg:bg-transparent lg:p-0">
              <FieldSet className="gap-4 border-0 p-0" disabled={loading}>
                <FieldLegend variant="label" className="flex items-center gap-1 px-0">
                  <span>高级选项</span>
                  <HelpTip label="模型选择说明" content={modelHint} />
                </FieldLegend>
                <FieldGroup className="gap-4">
                  <Field>
                    <FieldLabel htmlFor={`${fieldId}-model-quick`}>快模型</FieldLabel>
                    <Select
                      value={quickModel}
                      disabled={loading}
                      onValueChange={(v) => v && setQuickModel(v)}
                    >
                      <SelectTrigger id={`${fieldId}-model-quick`} className="w-full min-w-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MODEL_OPTIONS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${fieldId}-model-deep`}>深决策模型</FieldLabel>
                    <Select
                      value={deepModel}
                      disabled={loading}
                      onValueChange={(v) => v && setDeepModel(v)}
                    >
                      <SelectTrigger id={`${fieldId}-model-deep`} className="w-full min-w-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MODEL_OPTIONS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </FieldGroup>
              </FieldSet>

              <Separator />

              <FieldGroup className="gap-4">
                <Field orientation="responsive">
                  <FieldContent>
                    <FieldTitle id={sentimentLabelId} className="flex items-center gap-1">
                      <span>情绪分析</span>
                      <HelpTip
                        label="情绪分析说明"
                        content="开启后会在报告中纳入情绪与风险偏好相关结论。"
                      />
                    </FieldTitle>
                  </FieldContent>
                  <Switch
                    checked={sentiment}
                    onCheckedChange={(v) => setSentiment(Boolean(v))}
                    disabled={loading}
                    aria-labelledby={sentimentLabelId}
                  />
                </Field>
                <Field orientation="responsive">
                  <FieldContent>
                    <FieldTitle id={riskLabelId} className="flex items-center gap-1">
                      <span>风险评估</span>
                      <HelpTip
                        label="风险评估说明"
                        content="开启后会输出波动、仓位与失效条件等风险提示。"
                      />
                    </FieldTitle>
                  </FieldContent>
                  <Switch
                    checked={riskAssessment}
                    onCheckedChange={(v) => setRiskAssessment(Boolean(v))}
                    disabled={loading}
                    aria-labelledby={riskLabelId}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${fieldId}-lang`}>报告语言</FieldLabel>
                  <Select
                    value={language}
                    disabled={loading}
                    onValueChange={(v) => {
                      if (v === "zh" || v === "en") setLanguage(v);
                    }}
                  >
                    <SelectTrigger id={`${fieldId}-lang`} className="w-full min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="zh">中文</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>

              <Separator />

              <FieldSet className="gap-3 border-0 p-0" disabled={loading}>
                <FieldLegend variant="label" className="px-0">
                  算力预览
                </FieldLegend>
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">深度算力</span>
                    <span className="tabular-nums">{costPreview.depthCost.toFixed(2)}</span>
                  </div>
                  <p className="m-0 text-muted-foreground text-xs">团队加成（每名分析师）</p>
                  <ul className="flex flex-col gap-1">
                    {costPreview.lines.length ? (
                      costPreview.lines.map((line) => (
                        <li key={line.id} className="flex justify-between gap-2 text-xs">
                          <span className="truncate">{line.label}</span>
                          <span className="tabular-nums">+{line.value.toFixed(2)}</span>
                        </li>
                      ))
                    ) : (
                      <li className="text-xs text-muted-foreground">未选择分析师</li>
                    )}
                  </ul>
                  <Separator />
                  <div className="flex justify-between gap-2 font-medium">
                    <span>预估消耗</span>
                    <span className="tabular-nums">{costPreview.total.toFixed(2)}</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={loading}
                  onClick={() => setPreviewNonce((n) => n + 1)}
                >
                  刷新算力预览
                </Button>
              </FieldSet>
            </FieldGroup>
          </form>
        </div>

        <DialogFooter className="mx-0 mb-0 flex shrink-0 flex-col-reverse gap-2 border-t bg-muted/30 px-4 py-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => handleDialogOpenChange(false)} disabled={loading}>
            取消
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={loading || !canSubmitSearch}
            aria-busy={loading}
          >
            {loading ? (
              <>
                <Spinner />
                分析中
              </>
            ) : (
              "开始分析"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
