"""基本面分析师模块 - 负责财务数据和估值分析"""
from typing import Dict, Any, Optional, List
import json
import re

from .base_analyst import BaseAnalyst
from .depth_config import (
    get_fundamental_metrics_for_depth,
    AnalystDepth
)
from .prompts import get_analyst_prompt
from ..core.logging import logger
from ..core.stock_service import StockService
from ..llm.llm_service import LLMService


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
        risk_assessment: bool = False,
        user_id: int = None,
        preset_id: int = None,
        user_config_id: int = None,
        **kwargs
    ) -> tuple:
        """
        执行基本面分析

        Args:
            ticker: 股票代码
            stock_name: 股票名称
            depth: 分析深度 (1-3)
            llm: LLM客户端（可选）
            risk_assessment: 是否执行风险评估
            user_id: 用户ID（用于记录使用量）
            preset_id: 预设ID（用于记录使用量）
            user_config_id: 用户配置ID（用于记录使用量）
            **kwargs: 其他参数

        Returns:
            (基本面分析结果, token消耗)
        """
        self.tool_call_count = 0
        logger.info(f"📊 [{self.name}] 开始分析 {stock_name}({ticker})，深度={depth}，风险评估={risk_assessment}")

        try:
            metrics = self.get_fundamental_metrics(depth)
            logger.debug(f"[{self.name}] 深度{depth}使用的基本面指标: {metrics}")

            result, total_tokens = await self._perform_fundamental_analysis(
                ticker, stock_name, depth, llm, metrics, risk_assessment, user_id, preset_id, user_config_id
            )
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
        metrics: List[str] = None,
        risk_assessment: bool = False,
        user_id: int = None,
        preset_id: int = None,
        user_config_id: int = None
    ) -> tuple:
        """
        执行基本面分析

        Args:
            ticker: 股票代码
            stock_name: 股票名称
            depth: 分析深度
            llm: LLM客户端
            metrics: 要分析的基本面指标列表
            risk_assessment: 是否执行风险评估
            user_id: 用户ID（用于记录使用量）
            preset_id: 预设ID（用于记录使用量）
            user_config_id: 用户配置ID（用于记录使用量）

        Returns:
            (基本面分析结果, token消耗)
        """
        fundamental_data = StockService().fetch_fundamental(ticker)

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

        if risk_assessment:
            result["risk_assessment"] = self._assess_fundamental_risk(fundamental_data)

        total_tokens = 0
        if self.should_use_llm(depth) and llm:
            try:
                llm_analysis, tokens = await self._generate_llm_analysis(
                    ticker, stock_name, fundamental_data, depth, llm, metrics, user_id, preset_id, user_config_id
                )
                result["llm_analysis"] = llm_analysis
                total_tokens = tokens
            except Exception as e:
                logger.warning(f"[{self.name}] LLM分析失败: {e}")

        # 行业景气度评估（仅在深度>=2且有LLM时）
        if depth >= 2 and llm and user_id:
            industry = fundamental_data.get("industry", "")
            if industry:
                try:
                    sentiment_score, sentiment_tokens = await self._calculate_industry_sentiment(
                        industry, llm, user_id, preset_id, user_config_id
                    )
                    result["industry_sentiment"] = sentiment_score
                    total_tokens += sentiment_tokens
                except Exception as e:
                    logger.warning(f"[{self.name}] 行业景气度评估失败: {e}")

        return result, total_tokens

    def _calculate_fundamental_score(self, fundamental_data: Dict, metrics: List[str] = None) -> float:
        """
        计算基本面评分

        Args:
            fundamental_data: 基本面数据（扁平化结构，来自 stock_service.fetch_fundamental）
            metrics: 要使用的基本面指标列表

        Returns:
            基本面评分 (0-100)
        """
        score = 50
        # 默认使用指定的基本面指标列表
        metrics = metrics or ["PE", "PB", "ROE", "GROSS_PROFIT_RATE", "ASSET_LIABILITY_RATIO"]

        # PE 市盈率评分
        if "PE" in metrics:
            pe = fundamental_data.get("pe", 0)
            if pe and 10 <= pe <= 30:
                score += 10
            elif pe and (5 <= pe < 10 or 30 < pe <= 50):
                score += 5

        # PB 市净率评分
        if "PB" in metrics:
            pb = fundamental_data.get("pb", 0)
            if pb and 1 <= pb <= 3:
                score += 10
            elif pb and (0.5 <= pb < 1 or 3 < pb <= 5):
                score += 5

        # ROE 净资产收益率评分
        if "ROE" in metrics:
            roe = fundamental_data.get("roe", 0)
            if roe and roe > 15:
                score += 15
            elif roe and 10 <= roe <= 15:
                score += 10
            elif roe and 5 <= roe < 10:
                score += 5

        # GROSS_PROFIT_RATE 毛利率评分
        if "GROSS_PROFIT_RATE" in metrics:
            gross_profit_rate = fundamental_data.get("gross_profit_rate", 0)
            if gross_profit_rate and gross_profit_rate > 30:
                score += 15
            elif gross_profit_rate and 20 <= gross_profit_rate <= 30:
                score += 10
            elif gross_profit_rate and 10 <= gross_profit_rate < 20:
                score += 5

        # ASSET_LIABILITY_RATIO 资产负债率评分
        if "ASSET_LIABILITY_RATIO" in metrics:
            asset_liability_ratio = fundamental_data.get("asset_liability_ratio", 0)
            if asset_liability_ratio and asset_liability_ratio < 50:
                score += 10
            elif asset_liability_ratio and 50 <= asset_liability_ratio < 70:
                score += 5

        return min(100, max(0, score))

    def _assess_fundamental_risk(self, fundamental_data: Dict) -> Dict[str, Any]:
        """
        评估基本面风险

        Args:
            fundamental_data: 基本面数据

        Returns:
            风险评估结果
        """
        risk_items = []
        risk_level = "低"

        pe = fundamental_data.get("pe", 0)
        if pe and pe > 50:
            risk_items.append({"type": "估值风险", "description": f"PE={pe:.2f}偏高，可能存在估值泡沫风险", "severity": "高"})
            risk_level = "高"
        elif pe and pe > 30:
            risk_items.append({"type": "估值风险", "description": f"PE={pe:.2f}较高，估值偏贵", "severity": "中"})
            if risk_level != "高":
                risk_level = "中"

        pb = fundamental_data.get("pb", 0)
        if pb and pb > 5:
            risk_items.append({"type": "估值风险", "description": f"PB={pb:.2f}偏高", "severity": "中"})
            if risk_level != "高":
                risk_level = "中"

        roe = fundamental_data.get("roe", 0)
        if roe and roe < 5:
            risk_items.append({"type": "盈利风险", "description": f"ROE={roe:.2f}%较低，盈利能力弱", "severity": "高"})
            risk_level = "高"

        asset_liability_ratio = fundamental_data.get("asset_liability_ratio", 0)
        if asset_liability_ratio and asset_liability_ratio > 70:
            risk_items.append({"type": "财务风险", "description": f"资产负债率={asset_liability_ratio:.2f}%过高，偿债压力大", "severity": "高"})
            risk_level = "高"
        elif asset_liability_ratio and asset_liability_ratio > 50:
            risk_items.append({"type": "财务风险", "description": f"资产负债率={asset_liability_ratio:.2f}%偏高", "severity": "中"})
            if risk_level != "高":
                risk_level = "中"

        gross_profit_rate = fundamental_data.get("gross_profit_rate", 0)
        if gross_profit_rate and gross_profit_rate < 10:
            risk_items.append({"type": "盈利风险", "description": f"毛利率={gross_profit_rate:.2f}%过低，竞争力弱", "severity": "中"})
            if risk_level != "高":
                risk_level = "中"

        return {
            "risk_level": risk_level,
            "risk_items": risk_items,
            "summary": f"风险评估{risk_level}级，发现{len(risk_items)}个风险点"
        }

    async def _generate_llm_analysis(
        self,
        ticker: str,
        stock_name: str,
        fundamental_data: Dict,
        depth: int,
        llm,
        metrics: List[str] = None,
        user_id: int = None,
        preset_id: int = None,
        user_config_id: int = None
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
            user_id: 用户ID（用于记录使用量）
            preset_id: 预设ID（用于记录使用量）
            user_config_id: 用户配置ID（用于记录使用量）

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
            if user_id:
                response, token_usage = await LLMService.wrap_chat(
                    llm_client=llm,
                    user_id=user_id,
                    prompt=prompt,
                    preset_id=preset_id,
                    user_config_id=user_config_id
                )
            else:
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
        # 默认使用指定的基本面指标列表
        metrics = metrics or ["PE", "PB", "ROE", "GROSS_PROFIT_RATE", "ASSET_LIABILITY_RATIO"]

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
        if "GROSS_PROFIT_RATE" in metrics:
            report += f"| 销售毛利率 | {fundamental_data.get('gross_profit_rate', 'N/A')}% | 越高越好 |\n"

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

        if "ASSET_LIABILITY_RATIO" in metrics:
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

    async def _calculate_industry_sentiment(
        self,
        industry: str,
        llm,
        user_id: int,
        preset_id: Optional[int] = None,
        user_config_id: Optional[int] = None
    ) -> tuple:
        """
        使用LLM评估行业景气度
        
        Args:
            industry: 行业名称
            llm: LLM客户端实例
            user_id: 用户ID
            preset_id: 预设配置ID
            user_config_id: 用户配置ID
            
        Returns:
            tuple: (景气度分数 [0,1], token消耗数量)
        """
        prompt = f"""
请作为一位资深的行业分析师，对「{industry}」行业进行全面的景气度评估。

请从以下维度进行分析：
1. 行业整体增长趋势和发展前景
2. 当前政策支持力度和监管环境
3. 市场需求状况和下游应用场景
4. 行业竞争格局和头部企业表现
5. 技术创新进展和产业链完整性

评估标准：
- 0.0-0.3: 行业景气度较低，面临较大压力
- 0.3-0.6: 行业景气度中性，处于平稳发展阶段
- 0.6-1.0: 行业景气度较高，具备良好发展前景

请按照以下JSON格式输出结果：
{{
    "sentiment_score": 0.XX,
    "reason": "简要说明评估理由"
}}
"""
        
        result, tokens = await LLMService.wrap_chat(
            llm_client=llm,
            user_id=user_id,
            prompt=prompt,
            response_format="json",
            temperature=0.3,
            seed=42,
            preset_id=preset_id,
            user_config_id=user_config_id
        )
        
        total_tokens = tokens.get('total_tokens', 0)
        
        try:
            data = json.loads(result)
            sentiment_score = float(data.get("sentiment_score", 0.5))
            sentiment_score = max(0.0, min(1.0, sentiment_score))
        except (json.JSONDecodeError, ValueError):
            match = re.search(r'sentiment_score["\']?\s*[:=]\s*([\d.]+)', result)
            if match:
                sentiment_score = max(0.0, min(1.0, float(match.group(1))))
            else:
                sentiment_score = 0.5
        
        logger.info(f"📊 [{self.name}] 行业景气度评估完成: {industry} = {sentiment_score:.4f}")
        return sentiment_score, total_tokens
