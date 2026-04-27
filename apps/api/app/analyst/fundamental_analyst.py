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
            "thesis": fundamental_data.get("thesis", ""),
            "risks": fundamental_data.get("risks", []),
            "catalyst": fundamental_data.get("catalyst", ""),
            "valuation": fundamental_data.get("valuation", {}),
            "profitability": fundamental_data.get("profitability", {}),
            "growth": fundamental_data.get("growth", {}),
            "health": fundamental_data.get("health", {}),
            "analysis_depth": depth,
            "depth_name": self._get_depth_chinese_name(depth),
            "used_metrics": metrics or []
        }

        if depth >= 4:
            result["advanced_metrics"] = {
                "roic": fundamental_data.get("profitability", {}).get("roic", 0),
                "current_ratio": fundamental_data.get("health", {}).get("current_ratio", 0),
                "quick_ratio": fundamental_data.get("health", {}).get("quick_ratio", 0),
                "market_share": fundamental_data.get("market_share", ""),
                "competitors": fundamental_data.get("competitors", []),
                "moat": fundamental_data.get("moat", ""),
                "business_model": fundamental_data.get("business_model", "")
            }

        if depth == 5:
            result["expert_metrics"] = {
                "gross_margin": fundamental_data.get("profitability", {}).get("gross_margin", 0),
                "net_margin": fundamental_data.get("profitability", {}).get("net_margin", 0),
                "operating_cash_flow": fundamental_data.get("cash_flow", {}).get("operating", 0),
                "investing_cash_flow": fundamental_data.get("cash_flow", {}).get("investing", 0),
                "financing_cash_flow": fundamental_data.get("cash_flow", {}).get("financing", 0)
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
        valuation = fundamental_data.get("valuation", {})
        profitability = fundamental_data.get("profitability", {})
        growth = fundamental_data.get("growth", {})
        health = fundamental_data.get("health", {})

        depth_desc = self._get_depth_description(depth)
        metrics = metrics or self.get_fundamental_metrics(depth)

        report = f"""# {stock_name}（{ticker}）基本面分析报告
**分析深度：{depth_desc}**
**分析指标：{', '.join(metrics)}**

---

## 一、公司基本信息

- **公司名称**：{stock_name}
- **股票代码**：{ticker}

---

## 二、估值指标分析

### 主要估值指标

"""

        if "PE" in metrics:
            report += f"| 市盈率(PE) | {valuation.get('pe', 'N/A')} | 越低越有投资价值 |\n"
        if "PB" in metrics:
            report += f"| 市净率(PB) | {valuation.get('pb', 'N/A')} | 越低越有投资价值 |\n"
        if "PS" in metrics:
            report += f"| 市销率(PS) | {valuation.get('ps', 'N/A')} | 越低越有投资价值 |\n"
        if "PCF" in metrics:
            report += f"| 市现率(PCF) | {valuation.get('pcf', 'N/A')} | 越低越有投资价值 |\n"

        report += f"| 股息率 | {valuation.get('dividend_yield', 'N/A')}% | 越高越好 |\n"

        if "PE" in metrics:
            report += f"\n### 估值评估\n{self._evaluate_valuation(valuation)}\n"

        report += """

---

## 三、盈利能力分析

### 主要盈利指标

"""
        if "ROE" in metrics:
            report += f"| 净资产收益率(ROE) | {profitability.get('roe', 'N/A')}% | 越高越好 |\n"
        if "ROA" in metrics:
            report += f"| 资产收益率(ROA) | {profitability.get('roa', 'N/A')}% | 越高越好 |\n"
        if "GrossMargin" in metrics:
            report += f"| 毛利率 | {profitability.get('gross_margin', 'N/A')}% | 越高越好 |\n"
        if "NetMargin" in metrics:
            report += f"| 净利率 | {profitability.get('net_margin', 'N/A')}% | 越高越好 |\n"

        if "ROE" in metrics:
            report += f"\n### 盈利评估\n{self._evaluate_profitability(profitability)}\n"

        report += """

---

## 四、成长性分析

### 主要成长指标

"""
        if "RevenueGrowth" in metrics:
            report += f"| 营收增长率 | {growth.get('revenue_growth', 'N/A')}% | 越高越好 |\n"
        if "ProfitGrowth" in metrics:
            report += f"| 利润增长率 | {growth.get('profit_growth', 'N/A')}% | 越高越好 |\n"
        if "AssetGrowth" in metrics:
            report += f"| 资产增长率 | {growth.get('asset_growth', 'N/A')}% | 适度增长为宜 |\n"

        if "RevenueGrowth" in metrics:
            report += f"\n### 成长评估\n{self._evaluate_growth(growth)}\n"

        report += """

---

## 五、财务健康分析

### 主要财务指标

"""
        if "DebtRatio" in metrics:
            report += f"| 资产负债率 | {health.get('debt_ratio', 'N/A')}% | 越低越稳健 |\n"
        if "CurrentRatio" in metrics:
            report += f"| 流动比率 | {health.get('current_ratio', 'N/A')} | 大于2较好 |\n"
        if "QuickRatio" in metrics:
            report += f"| 速动比率 | {health.get('quick_ratio', 'N/A')} | 大于1较好 |\n"

        if "DebtRatio" in metrics:
            report += f"\n### 财务健康评估\n{self._evaluate_health(health)}\n"

        if depth >= 4:
            report += """

---

## 六、深度基本面分析（高级）

"""
            if fundamental_data.get("market_share"):
                report += f"### 行业地位评估\n- 市场占有率：{fundamental_data.get('market_share')}\n"
            if fundamental_data.get("competitors"):
                report += f"- 主要竞争对手：{fundamental_data.get('competitors')}\n"

            report += "\n### 竞争优势分析\n"
            if fundamental_data.get("moat"):
                report += f"- 护城河：{fundamental_data.get('moat')}\n"
            if fundamental_data.get("business_model"):
                report += f"- 商业模式：{fundamental_data.get('business_model')}\n"

            if "ROIC" in metrics:
                roic = fundamental_data.get("profitability", {}).get("roic", 0)
                report += f"- ROIC（投资资本回报率）：{roic}%\n"

        if depth >= 3 and fundamental_data.get("thesis"):
            report += f"""

---

## 七、投资逻辑

{fundamental_data.get('thesis', '暂无详细投资逻辑')}

"""

        if fundamental_data.get("risks"):
            report += """---

## 八、风险提示

"""
            for i, risk in enumerate(fundamental_data.get("risks", []), 1):
                report += f"{i}. {risk}\n"

        if depth == 5:
            report += """

---

## 九、现金流分析

### 经营现金流
"""
            cash_flow = fundamental_data.get("cash_flow", {})
            report += f"- 经营现金流：{cash_flow.get('operating', 'N/A')}\n"
            report += f"- 投资现金流：{cash_flow.get('investing', 'N/A')}\n"
            report += f"- 融资现金流：{cash_flow.get('financing', 'N/A')}\n"

            report += """

---

## 十、综合投资建议

"""
            pe = valuation.get("pe", 0)
            if pe > 0:
                if pe < 15:
                    report += "### 估值建议\n- 当前估值偏低，具有投资价值\n"
                elif 15 <= pe <= 30:
                    report += "### 估值建议\n- 当前估值合理，处于合理区间\n"
                else:
                    report += "### 估值建议\n- 当前估值偏高，注意风险\n"

            report += "\n### 综合评级\n"
            score = self._calculate_fundamental_score(fundamental_data, metrics)
            if score >= 80:
                report += "- **强烈推荐**：基本面优秀\n"
            elif score >= 60:
                report += "- **推荐**：基本面良好\n"
            elif score >= 40:
                report += "- **中性**：基本面一般\n"
            else:
                report += "- **回避**：基本面较差\n"

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
