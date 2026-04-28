"""分析师基类 - 提供深度感知的基础功能"""
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from .depth_config import (
    get_analyst_depth_config,
    get_technical_indicators_for_depth,
    get_fundamental_metrics_for_depth,
    is_feature_enabled_for_depth,
    get_data_days_for_depth,
    get_max_news_count_for_depth,
    get_report_detail_level_for_depth,
    AnalystDepth
)
from ..core.logging import logger


class BaseAnalyst(ABC):
    """分析师基类 - 提供深度感知的基础功能"""

    def __init__(self, name: str):
        """
        初始化基类

        Args:
            name: 分析师名称
        """
        self.name = name
        self.tool_call_count = 0
        self.max_tool_calls = 3
        logger.info(f"初始化 {self.name}")

    def get_depth_config(self, depth: int) -> Dict[str, Any]:
        """获取指定深度的配置"""
        return get_analyst_depth_config(depth)

    def get_technical_indicators(self, depth: int) -> List[str]:
        """获取指定深度使用的技术指标"""
        return get_technical_indicators_for_depth(depth)

    def get_fundamental_metrics(self, depth: int) -> List[str]:
        """获取指定深度使用的基本面指标"""
        return get_fundamental_metrics_for_depth(depth)

    def is_feature_enabled(self, depth: int, feature: str) -> bool:
        """检查指定深度是否启用某个特性"""
        return is_feature_enabled_for_depth(depth, feature)

    def get_data_days(self, depth: int) -> int:
        """获取指定深度需要的数据天数"""
        return get_data_days_for_depth(depth)

    def get_max_news_count(self, depth: int) -> int:
        """获取指定深度允许的最大新闻数量"""
        return get_max_news_count_for_depth(depth)

    def get_report_detail_level(self, depth: int) -> int:
        """获取指定深度的报告详细程度"""
        return get_report_detail_level_for_depth(depth)

    def should_use_llm(self, depth: int) -> bool:
        """判断是否应该使用LLM进行分析"""
        return self.is_feature_enabled(depth, "llm_analysis")

    def should_enable_sentiment_analysis(self, depth: int) -> bool:
        """判断是否应该启用情绪分析"""
        return self.is_feature_enabled(depth, "sentiment_analysis")

    def should_enable_risk_assessment(self, depth: int) -> bool:
        """判断是否应该启用风险评估"""
        return self.is_feature_enabled(depth, "risk_assessment")

    def should_enable_peer_comparison(self, depth: int) -> bool:
        """判断是否应该启用同业对比"""
        return self.is_feature_enabled(depth, "peer_comparison")

    def should_enable_historical_analysis(self, depth: int) -> bool:
        """判断是否应该启用历史分析"""
        return self.is_feature_enabled(depth, "historical_analysis")

    def should_enable_scenario_analysis(self, depth: int) -> bool:
        """判断是否应该启用场景分析"""
        return self.is_feature_enabled(depth, "scenario_analysis")

    def should_enable_sensitivity_analysis(self, depth: int) -> bool:
        """判断是否应该启用敏感性分析"""
        return self.is_feature_enabled(depth, "sensitivity_analysis")

    @abstractmethod
    async def analyze(
        self,
        ticker: str,
        stock_name: str,
        depth: int = 3,
        **kwargs
    ) -> Dict[str, Any]:
        """
        执行分析 - 子类必须实现

        Args:
            ticker: 股票代码
            stock_name: 股票名称
            depth: 分析深度 (1-5)
            **kwargs: 其他参数

        Returns:
            分析结果字典
        """
        pass

    def _get_depth_description(self, depth: int) -> str:
        """获取深度描述"""
        descriptions = {
            1: "快速分析",
            2: "深度分析",
            3: "全面分析"
        }
        return descriptions.get(depth, "快速分析")

    def _get_depth_chinese_name(self, depth: int) -> str:
        """获取深度中文名称"""
        config = self.get_depth_config(depth)
        return config.get("chinese_name", "快速分析")

    def _create_error_result(self, error_message: str) -> Dict[str, Any]:
        """创建错误结果"""
        return {
            "error": error_message,
            f"{self.name.lower().replace(' ', '_')}_report": "",
            "signal": "HOLD",
            "confidence": 0
        }
