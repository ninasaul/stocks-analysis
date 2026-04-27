"""市场分析师模块 - 负责技术指标分析"""
from typing import Dict, Any, Optional, List
from .base_analyst import BaseAnalyst
from .depth_config import (
    get_technical_indicators_for_depth,
    AnalystDepth
)
from .prompts import get_analyst_prompt
from ..core.logging import logger
from ..data.indicators import TimingScorer


class MarketAnalyst(BaseAnalyst):
    """市场分析师 - 负责技术指标分析，继承自BaseAnalyst支持深度控制"""

    def __init__(self):
        """初始化市场分析师"""
        super().__init__("MarketAnalyst")
        self.max_tool_calls = 3
        # 不在初始化时创建TimingScorer，因为需要history参数
        # self.indicator_scorer = TimingScorer()

    async def analyze(
        self,
        ticker: str,
        stock_name: str,
        history: list,
        depth: int = 1,
        llm=None,
        **kwargs
    ) -> tuple:
        """
        执行市场分析（技术指标分析）

        Args:
            ticker: 股票代码
            stock_name: 股票名称
            history: 历史行情数据
            depth: 分析深度 (1-3)
            llm: LLM客户端（可选）
            **kwargs: 其他参数

        Returns:
            (市场分析结果, token消耗)
        """
        self.tool_call_count = 0
        logger.info(f"📈 [{self.name}] 开始分析 {stock_name}({ticker})，深度={depth} ({self._get_depth_chinese_name(depth)})")

        try:
            indicators = self.get_technical_indicators(depth)
            logger.debug(f"[{self.name}] 深度{depth}使用的技术指标: {indicators}")

            result, total_tokens = await self._perform_technical_analysis(ticker, stock_name, history, depth, llm, indicators)
            logger.info(f"✅ [{self.name}] {stock_name}({ticker}) 分析完成，信号={result.get('signal', 'N/A')}")
            return result, total_tokens
        except Exception as e:
            logger.error(f"❌ [{self.name}] {stock_name}({ticker}) 分析失败: {e}")
            return self._create_error_result(f"市场分析失败: {str(e)}"), 0

    async def _perform_technical_analysis(
        self,
        ticker: str,
        stock_name: str,
        history: list,
        depth: int,
        llm=None,
        indicators: List[str] = None
    ) -> tuple:
        """
        执行技术指标分析

        Args:
            ticker: 股票代码
            stock_name: 股票名称
            history: 历史行情数据
            depth: 分析深度
            llm: LLM客户端
            indicators: 要使用的技术指标列表

        Returns:
            (技术分析结果, token消耗)
        """
        if not history:
            return {
                "error": "历史数据为空",
                "market_report": "无法进行技术分析：缺少历史数据",
                "signal": "HOLD",
                "confidence": 0
            }, 0

        latest_price = history[-1].get("close", 0) if history else 0
        latest_date = history[-1].get("date", "") if history else ""

        # 创建 TimingScorer 实例并调用 score_all 方法
        scorer = TimingScorer(history, ticker)
        timing_result = scorer.score_all()
        logger.debug(f"[{self.name}] 技术指标分析结果: {timing_result}")
        
        signal = timing_result.get("signal", "HOLD")
        composite = timing_result.get("composite", 0)
        confidence = round((composite + 1) * 50, 2)

        market_report = self._generate_market_report(
            ticker, stock_name, history, timing_result, depth, indicators
        )

        result = {
            "market_report": market_report,
            "signal": signal,
            "confidence": confidence,
            "technical_score": composite,
            "bollinger_status": timing_result.get("bollinger_status", "中性"),
            "price_range": timing_result.get("price_range", {}),
            "current_price": latest_price,
            "latest_date": latest_date,
            "analysis_depth": depth,
            "depth_name": self._get_depth_chinese_name(depth),
            "indicators": {
                "ma": timing_result.get("ma", ""),
                "macd": timing_result.get("macd", ""),
                "rsi": timing_result.get("rsi", ""),
                "bollinger": timing_result.get("bollinger", ""),
                "volume": timing_result.get("volume", ""),
                "used_indicators": indicators or []
            }
        }

        if depth >= 4:
            result["advanced_indicators"] = {
                "cci": timing_result.get("cci", ""),
                "adx": timing_result.get("adx", ""),
                "kdj": timing_result.get("kdj", ""),
                "wr": timing_result.get("wr", "")
            }

        if depth == 5:
            result["expert_indicators"] = {
                "obv": timing_result.get("obv", ""),
                "dmi": timing_result.get("dmi", "")
            }

        total_tokens = 0
        if self.should_use_llm(depth) and llm:
            try:
                llm_analysis, tokens = await self._generate_llm_market_analysis(
                    ticker, stock_name, timing_result, depth, llm
                )
                result["llm_analysis"] = llm_analysis
                total_tokens = tokens
            except Exception as e:
                logger.warning(f"[{self.name}] LLM分析失败: {e}")

        return result, total_tokens

    async def _generate_llm_market_analysis(
        self,
        ticker: str,
        stock_name: str,
        timing_result: Dict[str, Any],
        depth: int,
        llm
    ) -> tuple:
        """
        使用LLM生成市场分析

        Args:
            ticker: 股票代码
            stock_name: 股票名称
            timing_result: 技术指标结果
            depth: 分析深度
            llm: LLM客户端

        Returns:
            (LLM生成的分析文本, token消耗)
        """
        if not llm:
            return "", 0

        # 获取基于深度的提示词
        prompt_template = get_analyst_prompt("market", depth)
        prompt = prompt_template.format(
            ticker=ticker,
            stock_name=stock_name
        )

        # 添加技术指标数据
        prompt += f"\n\n技术指标数据：\n"
        prompt += f"- 信号：{timing_result.get('signal', 'HOLD')}\n"
        prompt += f"- 综合评分：{timing_result.get('composite', 0):.2f}\n"
        prompt += f"- 布林带状态：{timing_result.get('bollinger_status', '中性')}\n"
        prompt += f"\n详细指标：\n"
        prompt += f"- MA：{timing_result.get('ma', 'N/A')}\n"
        prompt += f"- MACD：{timing_result.get('macd', 'N/A')}\n"
        prompt += f"- RSI：{timing_result.get('rsi', 'N/A')}\n"
        prompt += f"- BOLL：{timing_result.get('bollinger', 'N/A')}\n"
        prompt += "\n请基于以上数据提供专业的技术分析。\n"
        try:
            response, token_usage = await llm.chat(prompt)
            return response, token_usage.get('total_tokens', 0)
        except Exception as e:
            logger.error(f"[{self.name}] LLM分析调用失败: {e}")
            return "", 0

    def _generate_market_report(
        self,
        ticker: str,
        stock_name: str,
        history: list,
        timing_result: Dict[str, Any],
        depth: int,
        indicators: List[str] = None
    ) -> str:
        """
        生成市场分析报告

        Args:
            ticker: 股票代码
            stock_name: 股票名称
            history: 历史行情数据
            timing_result: 技术指标评分结果
            depth: 分析深度
            indicators: 要使用的技术指标列表

        Returns:
            市场分析报告文本
        """
        latest = history[-1] if history else {}
        current_price = latest.get("close", 0)
        change_pct = latest.get("change_pct", 0)

        signal = timing_result.get("signal", "HOLD")
        composite = timing_result.get("composite", 0)
        confidence = round((composite + 1) * 50, 2)

        depth_desc = self._get_depth_description(depth)
        indicators = indicators or self.get_technical_indicators(depth)

        report = f"""# {stock_name}（{ticker}）技术分析报告
**分析深度：{depth_desc} | 分析日期：{latest.get('date', 'N/A')}**
**使用指标：{', '.join(indicators)}**

---

## 一、股票基本信息

- **公司名称**：{stock_name}
- **股票代码**：{ticker}
- **当前价格**：{current_price:.2f}元
- **涨跌幅**：{change_pct:+.2f}%

---

## 二、技术指标分析

"""

        if "MA" in indicators:
            report += f"""### 1. 移动平均线（MA）分析
{timing_result.get('ma', '数据获取中...')}

"""

        if "MACD" in indicators:
            report += f"""### 2. MACD指标分析
{timing_result.get('macd', '数据获取中...')}

"""

        if "RSI" in indicators:
            report += f"""### 3. RSI相对强弱指标
{timing_result.get('rsi', '数据获取中...')}

"""

        if "BOLL" in indicators:
            report += f"""### 4. 布林带（BOLL）分析
{timing_result.get('bollinger', '数据获取中...')}

"""

        if "KDJ" in indicators and depth >= 3:
            report += f"""### 5. KDJ随机指标
{timing_result.get('kdj', '数据获取中...')}

"""

        if "WR" in indicators and depth >= 3:
            report += f"""### 6. WR威廉指标
{timing_result.get('wr', '数据获取中...')}

"""

        report += f"""---

## 三、价格趋势分析

**当前信号**：{signal}
**综合评分**：{confidence:.2f}/100
**布林带状态**：{timing_result.get('bollinger_status', '中性')}

---

## 四、投资建议

"""
        if signal == "BUY":
            report += f"""### 买入建议
- **信号强度**：强势买入信号
- **置信度**：{confidence:.2f}%
- **建议**：技术面显示积极信号，可考虑逢低买入

"""
        elif signal == "SELL":
            report += f"""### 卖出建议
- **信号强度**：强势卖出信号
- **置信度**：{confidence:.2f}%
- **建议**：技术面显示消极信号，建议考虑减仓或卖出

"""
        else:
            report += f"""### 持有建议
- **信号强度**：中性信号
- **置信度**：{confidence:.2f}%
- **建议**：技术面显示中性，建议观望等待明确信号

"""

        if depth >= 4:
            report += """---

## 五、深度技术分析（高级）

"""
            if "CCI" in indicators:
                report += f"""### CCI顺势指标
{timing_result.get('cci', '数据获取中...')}

"""

            if "ADX" in indicators:
                report += f"""### ADX平均趋向指标
{timing_result.get('adx', '数据获取中...')}

"""

            ma_data = timing_result.get("ma", "")
            if "多头" in str(ma_data):
                report += "### 均线系统分析\n- 均线呈多头排列，中期趋势向好\n"
            elif "空头" in str(ma_data):
                report += "### 均线系统分析\n- 均线呈空头排列，中期趋势偏弱\n"
            else:
                report += "### 均线系统分析\n- 均线排列不明显，趋势不明\n"

            report += """
### 量价配合分析
"""
            volume_data = timing_result.get("volume", "")
            if "放大" in str(volume_data):
                report += "- 成交量有所放大，市场参与度提高\n"
            elif "萎缩" in str(volume_data):
                report += "- 成交量萎缩，市场活跃度下降\n"
            else:
                report += "- 成交量变化不明显\n"

        if depth == 5:
            report += """

---

## 六、专家级技术分析

"""
            if "OBV" in indicators:
                report += f"""### OBV能量潮指标
{timing_result.get('obv', '数据获取中...')}

"""

            if "DMI" in indicators:
                report += f"""### DMI动向指标
{timing_result.get('dmi', '数据获取中...')}

"""

            report += """
---

## 七、风险提示

- 技术分析仅供参考，不构成投资建议
- 市场有风险，投资需谨慎
- 建议结合基本面分析做出投资决策
"""
        return report
