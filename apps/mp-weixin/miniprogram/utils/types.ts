export type Market = "CN" | "HK" | "US";

export type HoldingHorizon =
  | "intraday_to_days"
  | "w1_to_w4"
  | "m1_to_m3"
  | "m3_plus";

export type StylePref = "value" | "growth" | "momentum" | "no_preference";

export type RiskTier = "conservative" | "balanced" | "aggressive";

export type CapLiquidity = "unrestricted" | "large_mid_liquid" | "small_volatile_ok";

export type SectorMode = "unrestricted" | "specified";

export type PreferenceSnapshot = {
  market: Market;
  sector_mode: SectorMode;
  sectors: string[];
  themes: string[];
  holding_horizon: HoldingHorizon;
  style: StylePref;
  risk_tier: RiskTier;
  cap_liquidity: CapLiquidity;
  exclusions: string[];
  other_notes: string | null;
};

export type AnalysisInput = {
  symbol: string;
  market: Market;
  timeframe: "daily" | "weekly";
  risk_tier: RiskTier;
  holding_horizon: HoldingHorizon;
  preference_snapshot?: PreferenceSnapshot;
};

export type FiveState = "wait" | "trial" | "add" | "reduce" | "exit";

export type TimingReport = {
  id: string;
  symbol: string;
  market: Market;
  timeframe: "daily" | "weekly";
  risk_tier: RiskTier;
  holding_horizon: HoldingHorizon;
  action: FiveState;
  action_reason: string;
  confidence: number;
  risk_level: "low" | "medium" | "high";
  score_breakdown: {
    technical: number;
    structure_risk: number;
    event_discount: number;
    total: number;
  };
  gate_downgraded: boolean;
  gate_reason: string | null;
  plan: {
    focus_range: string;
    risk_level_price: string;
    target_price: string;
    risk_exposure_pct: string;
    invalidation: string;
    valid_until: string;
  };
  evidence_positive: string[];
  evidence_negative: string[];
  evidence_conflicts?: string[];
  reminders: string[];
  data_version: string;
  created_at: number;
};

export type ArchiveEntry = TimingReport & { title: string };

export type CandidateStock = {
  code: string;
  name: string;
  reason: string;
  snapshot_keys: string[];
};
