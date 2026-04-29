"""分析师模块"""
from .market_analyst import MarketAnalyst
from .fundamental_analyst import FundamentalAnalyst
from .news_analyst import NewsAnalyst
from .depth_config import (
    AnalystDepth,
    AnalystType,
    ANALYST_DEPTH_CONFIG,
    AnalysisDepthController,
    normalize_depth,
    get_depth_config,
    get_analyst_depth_config,
    get_time_estimate,
    get_analysts_for_depth,
    is_feature_enabled,
    get_fundamental_metrics_for_depth,
    get_depth_fundamental_metrics,
    get_data_days_for_depth,
    get_max_news_count_for_depth,
    get_report_detail_level_for_depth,
    get_depth_info,
    get_all_depths_info
)
from .prompts import (
    AnalystPromptConfig,
    ANALYST_PROMPTS,
    get_analyst_prompt
)
from .base_analyst import BaseAnalyst

__all__ = [
    "MarketAnalyst",
    "FundamentalAnalyst",
    "NewsAnalyst",
    "BaseAnalyst",
    "AnalystDepth",
    "AnalystType",
    "ANALYST_DEPTH_CONFIG",
    "AnalysisDepthController",
    "normalize_depth",
    "get_depth_config",
    "get_analyst_depth_config",
    "get_time_estimate",
    "get_analysts_for_depth",
    "is_feature_enabled",
    "get_depth_indicators",
    "get_fundamental_metrics_for_depth",
    "get_depth_fundamental_metrics",
    "get_data_days_for_depth",
    "get_max_news_count_for_depth",
    "get_report_detail_level_for_depth",
    "get_depth_info",
    "get_all_depths_info",
    "AnalystPromptConfig",
    "ANALYST_PROMPTS",
    "get_analyst_prompt"
]
