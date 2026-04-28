"""基本面分析师模块 - 负责财务数据和估值分析"""
from typing import Dict, Any, Optional, List
from .base_analyst import BaseAnalyst
from .depth_config import (
    get_fundamental_metrics_for_depth,
    AnalystDepth
)
from .prompts import get_analyst_prompt
from ..core.logging import logger
from ..data.fetcher import fetch_fundamental


class FundamentalAnalyst(BaseAnalyst):
    """基本面分析师 - 负责财务数据和估值分析，继承自BaseAnalyst支持深度控制"""

    def __init__(self):
        """初始化基本面分析师"""
        super().__init__("FundamentalAnalyst")
        self.max_tool_calls = 1

    async def analyze(
        self,
        ticker: str,
        stock_name: str,
        depth: int = 1,
        llm=None,
        **kwargs
    ) -> tuple:
        """
        执行基本面分析

        Args:
            ticker: 股票代码
            stock_name: 股票名称
            depth: 分析深度 (1-3)
            llm: LLM客户端（可选）
            **kwargs: 其他参数

        Returns:
            (基本面分析结果, token消耗)
        """
        self.tool_call_count = 0
        logger.info(f"📊 [{self.name}] 开始分析 {stock_name}({ticker})，深度={depth} ({self._get_depth_chinese_name(depth)})")

        try:
            metrics = self.get_fundamental_metrics(depth)
            logger.debug(f"[{self.name}] 深度{depth}使用的基本面指标: {metrics}")

            result, total_tokens = await self._perform_fundamental_analysis(ticker, stock_name, depth, llm, metrics)
            logger.info(f"✅ [{self.name}] {stock_name}({ticker}) 分析完成, token消耗: {total_tokens}")
            return result, total_tokens
        except Exception as e:
            logger.error(f"❌ [{self.name}] {stock_name}({ticker}) 分析失败: {e}")
            return self._create_error_result(f"基本面分析失败: {str(e)}"), 0

    async def _perform_fundamental_analysis(
        self,
        ticker: str,
        stock_name: str,
        depth: int,
        llm=None,
        metrics: List[str] = None
    ) -> tuple:
        """
        执行基本面分析

        Args:
            ticker: 股票代码
            stock_name: 股票名称
            depth: 分析深度
            llm: LLM客户端
            metrics: 要使用的基本面指标列表

        Returns:
            (基本面分析结果, token消耗)
        """
        fundamental_data = fetch_fundamental(ticker)

        if not fundamental_data:
            return {
                "error": "基本面数据获取失败",
                "fundamentals_report": "无法进行基本面分析：缺少财务数据",
                "score": 0,
                "thesis": "",
                "risks": []
            }, 0

        result = {
            "fundamentals_report": self._generate_fundamentals_report(
                ticker, stock_name, fundamental_data, depth, metrics
            ),
            "fundamental_data": fundamental_data,
            "score": self._calculate_fundamental_score(fundamental_data, metrics),
            "analysis_depth": depth,
            "depth_name": self._get_depth_chinese_name(depth),
            "used_metrics": metrics or []
        }

        total_tokens = 0
        if self.should_use_llm(depth) and llm:
            try:
                llm_analysis, tokens = await self._generate_llm_analysis(
                    ticker, stock_name, fundamental_data, depth, llm, metrics
                )
                result["llm_analysis"] = llm_analysis
                total_tokens = tokens
            except Exception as e:
                logger.warning(f"[{self.name}] LLM分析失败: {e}")

        return result, total_tokens

    def _calculate_fundamental_score(self, fundamental_data: Dict, metrics: List[str] = None) -> float:
        """
        计算基本面评分

        Args:
            fundamental_data: 基本面数据
            metrics: 要使用的基本面指标列表

        Returns:
            基本面评分 (0-100)
        """
        score = 50
        metrics = metrics or ["PE", "PB", "ROE"]

        valuation = fundamental_data.get("valuation", {})
        if "PE" in metrics and valuation:
            pe = valuation.get("pe", 0)
            if 10 <= pe <= 30:
                score += 10
            elif 5 <= pe < 10 or 30 < pe <= 50:
                score += 5

        profitability = fundamental_data.get("profitability", {})
        if "ROE" in metrics and profitability:
            roe = profitability.get("roe", 0)
            if roe > 15:
                score += 15
            elif 10 <= roe <= 15:
                score += 10
            elif 5 <= roe < 10:
                score += 5

        growth = fundamental_data.get("growth", {})
        if "RevenueGrowth" in metrics and growth:
            revenue_growth = growth.get("revenue_growth", 0)
            if revenue_growth > 20:
                score += 15
            elif 10 <= revenue_growth <= 20:
                score += 10
            elif 5 <= revenue_growth < 10:
                score += 5

        health = fundamental_data.get("health", {})
        if "DebtRatio" in metrics and health:
            debt_ratio = health.get("debt_ratio", 0)
            if debt_ratio < 50:
                score += 10
            elif 50 <= debt_ratio < 70:
                score += 5

        return min(100, max(0, score))

    async def _generate_llm_analysis(
        self,
        ticker: str,
        stock_name: str,
        fundamental_data: Dict,
        depth: int,
        llm,
        metrics: List[str] = None
    ) -> tuple:
        """
        使用LLM生成基本面分析

        Args:
            ticker: 股票代码
            stock_name: 股票名称
            fundamental_data: 基本面数据
            depth: 分析深度
            llm: LLM客户端
            metrics: 要使用的基本面指标列表

        Returns:
            (LLM生成的分析文本, token消耗)
        """
        if not llm:
            return "", 0

        metrics = metrics or self.get_fundamental_metrics(depth)

        # 获取基于深度的提示词
        prompt_template = get_analyst_prompt("fundamental", depth)
        prompt = prompt_template.format(
            ticker=ticker,
            stock_name=stock_name
        )

        # 添加基本面数据
        valuation = fundamental_data.get("valuation", {})
        profitability = fundamental_data.get("profitability", {})
        growth = fundamental_data.get("growth", {})
        health = fundamental_data.get("health", {})
        cash_flow = fundamental_data.get("cash_flow", {})

        prompt += f"\n\n基本面数据：\n"
        prompt += f"- 估值指标：PE={valuation.get('pe', 'N/A')}, PB={valuation.get('pb', 'N/A')}, PS={valuation.get('ps', 'N/A')}\n"
        prompt += f"- 盈利能力：ROE={profitability.get('roe', 'N/A')}%(净资产收益率)\n"
        prompt += f"- 成长性：营收增长={growth.get('revenue_growth', 'N/A')}%\n"
        prompt += f"- 财务健康：资产负债率={health.get('debt_ratio', 'N/A')}%\n"
        if "CashFlow" in metrics:
            prompt += f"- 现金流：经营现金流={cash_flow.get('operating_cash_flow', 'N/A')}\n"
        prompt += "\n请基于以上数据提供专业的基本面分析。\n"
        try:
            response, token_usage = await llm.chat(prompt)
            return response, token_usage.get('total_tokens', 0)
        except Exception as e:
            logger.warning(f"[{self.name}] LLM分析失败: {e}")
            return "", 0

    def _generate_fundamentals_report(
        self,
        ticker: str,
        stock_name: str,
        fundamental_data: Dict,
        depth: int,
        metrics: List[str] = None
    ) -> str:
        """
        生成基本面分析报告

        Args:
            ticker: 股票代码
            stock_name: 股票名称
            fundamental_data: 基本面数据
            depth: 分析深度
            metrics: 要使用的基本面指标列表

        Returns:
            基本面分析报告文本
        """
        depth_desc = self._get_depth_description(depth)
        metrics = metrics or self.get_fundamental_metrics(depth)

        report = f"""# {stock_name}（{ticker}）基本面分析报告
**分析深度：{depth_desc}**
**分析指标：{', '.join(metrics)}**

---

## 一、公司基本信息

- **公司名称**：{stock_name}
- **股票代码**：{ticker}
- **所属行业**：{fundamental_data.get('industry', 'N/A')}

---

## 二、估值指标分析

### 主要估值指标

"""

        if "PE" in metrics:
            report += f"| 市盈率(PE) | {fundamental_data.get('pe', 'N/A')} | 越低越有投资价值 |\n"
        if "PB" in metrics:
            report += f"| 市净率(PB) | {fundamental_data.get('pb', 'N/A')} | 越低越有投资价值 |\n"

        report += """

### 估值评估
"""

        if "PE" in metrics:
            pe = fundamental_data.get('pe')
            if pe:
                if pe < 10:
                    report += "- 市盈率较低，估值相对合理，具有投资价值\n"
                elif pe < 20:
                    report += "- 市盈率适中，估值合理\n"
                else:
                    report += "- 市盈率较高，估值可能偏高\n"

        report += """

---

## 三、盈利能力分析

### 主要盈利指标

"""

        if "ROE" in metrics:
            report += f"| 净资产收益率(ROE) | {fundamental_data.get('roe', 'N/A')}% | 越高越好 |\n"
        if "GrossMargin" in metrics:
            report += f"| 毛利率 | {fundamental_data.get('gross_profit_rate', 'N/A')}% | 越高越好 |\n"

        report += """

### 盈利评估
"""

        if "ROE" in metrics:
            roe = fundamental_data.get('roe')
            if roe:
                if roe > 15:
                    report += "- 净资产收益率较高，盈利能力强\n"
                elif roe > 10:
                    report += "- 净资产收益率适中，盈利能力良好\n"
                else:
                    report += "- 净资产收益率较低，盈利能力一般\n"

        report += """

---

## 四、财务健康分析

### 主要健康指标

"""

        report += f"| 资产负债率 | {fundamental_data.get('asset_liability_ratio', 'N/A')}% | 越低越健康 |\n"

        report += """

### 健康评估
"""

        asset_liability_ratio = fundamental_data.get('asset_liability_ratio')
        if asset_liability_ratio:
            if asset_liability_ratio < 50:
                report += "- 资产负债率较低，财务状况健康\n"
            elif asset_liability_ratio < 70:
                report += "- 资产负债率适中，财务状况良好\n"
            else:
                report += "- 资产负债率较高，财务风险较大\n"

        score_val = self._calculate_fundamental_score(fundamental_data, metrics)
        report = f"""

---

## 五、综合评估

### 基本面评分
- **评分**：{score_val:.2f}/100

### 投资建议
"""

        if score_val >= 80:
            report += "- **建议买入**：基本面优秀，具有较高投资价值\n"
        elif score_val >= 60:
            report += "- **建议持有**：基本面良好，可以继续持有\n"
        else:
            report += "- **建议观望**：基本面一般，建议谨慎投资\n"

        report += """

### 风险提示
- 本分析基于公开数据，仅供参考，不构成投资建议
- 市场环境变化可能影响分析结果
- 投资者应结合自身风险承受能力做出决策
"""

        return report
    def _evaluate_valuation(self, valuation: Dict) -> str:
        """评估估值水平"""
        pe = valuation.get("pe", 0)
        if pe <= 0:
            return "无法评估（亏损）"
        elif pe < 10:
            return "估值较低，投资价值较高"
        elif 10 <= pe < 20:
            return "估值合理"
        elif 20 <= pe < 30:
            return "估值适中"
        elif 30 <= pe < 50:
            return "估值偏高"
        else:
            return "估值泡沫化，风险较大"

    def _evaluate_profitability(self, profitability: Dict) -> str:
        """评估盈利能力"""
        roe = profitability.get("roe", 0)
        if roe > 20:
            return "盈利能力优秀"
        elif 15 <= roe <= 20:
            return "盈利能力良好"
        elif 10 <= roe < 15:
            return "盈利能力一般"
        elif 5 <= roe < 10:
            return "盈利能力较弱"
        else:
            return "盈利能力差"

    def _evaluate_growth(self, growth: Dict) -> str:
        """评估成长性"""
        revenue_growth = growth.get("revenue_growth", 0)
        if revenue_growth > 30:
            return "成长性优秀"
        elif 15 <= revenue_growth <= 30:
            return "成长性良好"
        elif 5 <= revenue_growth < 15:
            return "成长性一般"
        elif 0 <= revenue_growth < 5:
            return "成长性较弱"
        else:
            return "成长性为负"

    def _evaluate_health(self, health: Dict) -> str:
        """评估财务健康"""
        debt_ratio = health.get("debt_ratio", 0)
        if debt_ratio < 30:
            return "财务非常稳健"
        elif 30 <= debt_ratio < 50:
            return "财务稳健"
        elif 50 <= debt_ratio < 70:
            return "财务中性"
        elif 70 <= debt_ratio < 90:
            return "财务偏紧"
        else:
            return "财务风险较大"
