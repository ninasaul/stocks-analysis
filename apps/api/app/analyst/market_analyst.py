"""市场分析师模块 - 负责技术指标分析"""
from typing import Dict, Any, Optional, List
import numpy as np
from .base_analyst import BaseAnalyst
from .depth_config import AnalystDepth
from .prompts import get_analyst_prompt
from ..core.logging import logger
from ..core.indicators import TimingScorer
from ..llm.llm_service import LLMService


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
        user_id: int = None,
        preset_id: int = None,
        user_config_id: int = None,
        **kwargs
    ) -> tuple:
        """
        执行市场分析（技术指标分析）

        Args:
            ticker: 股票代码
            stock_name: 股票名称
            history: 历史行情数据
            depth: 分析深度（1-3）
            llm: LLM客户端
            user_id: 用户ID（用于记录使用量）
            preset_id: 预设ID（用于记录使用量）
            user_config_id: 用户配置ID（用于记录使用量）
            **kwargs: 其他参数

        Returns:
            (分析结果, token消耗)
        """
        self.tool_call_count = 0
        logger.info(f"📈 [{self.name}] 开始分析 {stock_name}({ticker})，深度={depth} ({self._get_depth_chinese_name(depth)})")

        try:
            result, total_tokens = await self._perform_technical_analysis(ticker, stock_name, history, depth, llm, user_id, preset_id, user_config_id)
            logger.info(f"✅ [{self.name}] {stock_name}({ticker}) 分析完成，信号={result.get('signal', 'N/A')}")
            return result, total_tokens
        except Exception as e:
            logger.error(f"❌ [{self.name}] {stock_name}({ticker}) 分析失败: {e}")
            return self._create_error_result(f"市场分析失败: {str(e)}"), 0

    def _calculate_price_range(self, history: list, signal: str) -> Dict[str, Any]:
        """
        计算价格区间信息

        Args:
            history: 历史行情数据
            signal: 交易信号

        Returns:
            价格区间信息
        """
        if not history or len(history) < 20:
            return {"error": "数据不足，无法计算价格区间"}

        closes = np.array([d.get("close", 0) for d in history])
        volumes = np.array([d.get("volume", 0) for d in history])
        current_price = closes[-1]

        ma20 = np.mean(closes[-20:])
        std20 = np.std(closes[-20:])
        upper_band = ma20 + 2 * std20
        lower_band = ma20 - 2 * std20

        ma10 = np.mean(closes[-10:]) if len(closes) >= 10 else ma20

        if signal == "BUY":
            best_buy_price = round(lower_band, 2)
            secondary_buy_price = round((lower_band + ma20) / 2, 2)
            stop_loss = round(lower_band * 0.97, 2)
            take_profit = round(ma20 * 1.1, 2)
            sell_range = {}
        elif signal == "SELL":
            best_sell_price = round(upper_band, 2)
            secondary_sell_price = round((upper_band + ma20) / 2, 2)
            stop_loss = round(upper_band * 1.03, 2)
            take_profit = round(ma20 * 0.9, 2)
            buy_range = {}
        else:
            best_buy_price = round(lower_band, 2)
            secondary_buy_price = round((lower_band + ma20) / 2, 2)
            best_sell_price = round(upper_band, 2)
            secondary_sell_price = round((upper_band + ma20) / 2, 2)
            stop_loss = round(lower_band * 0.97, 2)
            take_profit = round(upper_band * 1.05, 2)
            buy_range = {
                "best_buy_price": best_buy_price,
                "secondary_buy_price": secondary_buy_price,
                "stop_loss": stop_loss,
                "take_profit": round(ma20, 2)
            }
            sell_range = {
                "best_sell_price": best_sell_price,
                "secondary_sell_price": secondary_sell_price,
                "stop_loss": round(upper_band * 1.03, 2),
                "take_profit": round(ma20 * 0.95, 2)
            }
            return {
                "current_price": round(current_price, 2),
                "bollinger": f"上轨{upper_band:.2f}/中轨{ma20:.2f}/下轨{lower_band:.2f}",
                "ma": f"MA10={ma10:.2f}/MA20={ma20:.2f}",
                "buy_range": buy_range,
                "sell_range": sell_range
            }

        if signal == "BUY":
            return {
                "current_price": round(current_price, 2),
                "bollinger": f"上轨{upper_band:.2f}/中轨{ma20:.2f}/下轨{lower_band:.2f}",
                "ma": f"MA10={ma10:.2f}/MA20={ma20:.2f}",
                "buy_range": {
                    "best_buy_price": best_buy_price,
                    "secondary_buy_price": secondary_buy_price,
                    "stop_loss": stop_loss,
                    "take_profit": take_profit
                }
            }
        else:
            return {
                "current_price": round(current_price, 2),
                "bollinger": f"上轨{upper_band:.2f}/中轨{ma20:.2f}/下轨{lower_band:.2f}",
                "ma": f"MA10={ma10:.2f}/MA20={ma20:.2f}",
                "sell_range": {
                    "best_sell_price": best_sell_price,
                    "secondary_sell_price": secondary_sell_price,
                    "stop_loss": stop_loss,
                    "take_profit": take_profit
                }
            }

    async def _perform_technical_analysis(
        self,
        ticker: str,
        stock_name: str,
        history: list,
        depth: int,
        llm=None,
        user_id: int = None,
        preset_id: int = None,
        user_config_id: int = None
    ) -> tuple:
        """
        执行技术指标分析

        Args:
            ticker: 股票代码
            stock_name: 股票名称
            history: 历史行情数据
            depth: 分析深度
            llm: LLM客户端
            user_id: 用户ID（用于记录使用量）
            preset_id: 预设ID（用于记录使用量）
            user_config_id: 用户配置ID（用于记录使用量）

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
        
        signal = timing_result.get("signal", "HOLD")
        composite = timing_result.get("total", 0)
        confidence = round((composite + 1) * 50, 2)
        
        # 从 timing_result 中提取实际计算的技术指标名称（排除衍生字段）
        non_indicator_fields = {"signal", "total"}
        used_indicators = [k for k in timing_result.keys() if k not in non_indicator_fields]

        market_report = self._generate_market_report(
            ticker, stock_name, history, timing_result, depth, used_indicators
        )

        result = {
            "market_report": market_report,
            "signal": signal,
            "confidence": confidence,
            "technical_score": composite,
            "bollinger_status": timing_result.get("bollinger_status", "中性"),
            "price_range": self._calculate_price_range(history, signal),
            "current_price": latest_price,
            "latest_date": latest_date,
            "analysis_depth": depth,
            "depth_name": self._get_depth_chinese_name(depth),
            "indicators": used_indicators or [],
            "timing_scores": timing_result
        }

        total_tokens = 0
        if self.should_use_llm(depth) and llm:
            try:
                llm_analysis, tokens, llm_price_range = await self._generate_llm_market_analysis(
                    ticker, stock_name, timing_result, depth, llm, history, user_id, preset_id, user_config_id
                )
                result["llm_analysis"] = llm_analysis
                total_tokens = tokens
                # 用LLM生成的价格区间覆盖计算的（如果LLM成功返回了价格区间）
                if llm_price_range:
                    result["price_range"] = llm_price_range
                    logger.debug(f"使用LLM生成的价格区间覆盖计算的价格区间")
            except Exception as e:
                logger.warning(f"[{self.name}] LLM分析失败: {e}")

        return result, total_tokens

    async def _generate_llm_market_analysis(
        self,
        ticker: str,
        stock_name: str,
        timing_result: Dict[str, Any],
        depth: int,
        llm,
        history: list = None,
        user_id: int = None,
        preset_id: int = None,
        user_config_id: int = None
    ) -> tuple:
        """
        使用LLM生成市场分析

        Args:
            ticker: 股票代码
            stock_name: 股票名称
            timing_result: 技术指标结果
            depth: 分析深度
            llm: LLM客户端
            history: 历史行情数据（用于解析价格区间）
            user_id: 用户ID（用于记录使用量）
            preset_id: 预设ID（用于记录使用量）
            user_config_id: 用户配置ID（用于记录使用量）

        Returns:
            (LLM生成的分析文本, token消耗, 解析的价格区间字典)
        """
        if not llm:
            return "", 0, {}

        # 获取基于深度的提示词
        prompt_template = get_analyst_prompt("market", depth)

        # 获取信号和当前价格
        signal = timing_result.get('signal', 'HOLD')
        current_price = history[-1].get('close', 0) if history and len(history) > 0 else 0

        prompt = prompt_template.format(
            ticker=ticker,
            stock_name=stock_name,
            signal=signal,
            current_price=f"{current_price:.2f}"
        )

        # 添加技术指标数据（与 TimingScorer.score_all() 返回的字段对齐）
        prompt += f"\n\n技术指标数据：\n"
        prompt += f"- 信号：{timing_result.get('signal', 'HOLD')}\n"
        prompt += f"- 综合评分：{timing_result.get('total', 0):.2f}\n"
        prompt += f"\n详细指标（-100到100）：\n"
        prompt += f"- 均线排列：{timing_result.get('ma_alignment', 0):.2f}\n"
        prompt += f"- 创新高比例：{timing_result.get('new_high_low_ratio', 0):.2f}\n"
        prompt += f"- 股价与10日线关系：{timing_result.get('price_vs_ma10', 0):.2f}\n"
        prompt += f"- 量价配合度：{timing_result.get('volume_price_sync', 0):.2f}\n"
        prompt += f"- 换手率波动：{timing_result.get('turnover_volatility', 0):.2f}\n"
        prompt += f"- MACD强度：{timing_result.get('macd_strength', 0):.2f}\n"
        prompt += f"- 布林带位置：{timing_result.get('bollinger_position', 0):.2f}\n"
        prompt += f"- ATR变化：{timing_result.get('atr_change', 0):.2f}\n"
        prompt += f"- 主力资金流向：{timing_result.get('main_flow', 0):.2f}\n"
        prompt += "\n请基于以上数据提供专业的技术分析。\n"
        logger.debug(f"{ticker} LLM分析提示词: {prompt}")

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
            logger.info(f"{ticker} LLM分析调用成功")

            # 解析 LLM 响应中的价格区间
            price_range = self._parse_price_range_from_response(response, timing_result.get("signal", "HOLD"))

            return response, token_usage.get('total_tokens', 0), price_range
        except Exception as e:
            logger.error(f"[{self.name}] LLM分析调用失败: {e}")
            return "", 0, {}

    def _parse_price_range_from_response(self, response: str, signal: str) -> Dict[str, Any]:
        """
        从LLM响应中解析价格区间信息

        Args:
            response: LLM生成的响应文本
            signal: 交易信号

        Returns:
            解析出的价格区间字典，解析失败返回空字典
        """
        import re

        price_range = {}

        try:
            # 解析当前价格
            current_price_match = re.search(r'当前价格[:：]\s*([\d.]+)', response)
            if current_price_match:
                price_range["current_price"] = float(current_price_match.group(1))

            # 解析买入区间（包含价格和理由）
            # 匹配模式：最佳买入价格: 123.45（依据: 理由内容）
            buy_best_pattern = r'最佳买入价格[:：]\s*([\d.]+)\s*（?依据[:：]\s*([^）\n]+)）?'
            buy_secondary_pattern = r'次优买入价格[:：]\s*([\d.]+)\s*（?依据[:：]\s*([^）\n]+)）?'
            buy_stop_pattern = r'止损位[:：]\s*([\d.]+)\s*（?依据[:：]\s*([^）\n]+)）?'
            buy_profit_pattern = r'止盈位[:：]\s*([\d.]+)\s*（?依据[:：]\s*([^）\n]+)）?'

            buy_best_match = re.search(buy_best_pattern, response)
            buy_secondary_match = re.search(buy_secondary_pattern, response)
            buy_stop_match = re.search(buy_stop_pattern, response)
            buy_profit_match = re.search(buy_profit_pattern, response)

            if buy_best_match or buy_secondary_match or buy_stop_match or buy_profit_match:
                buy_range = {}
                if buy_best_match:
                    buy_range["best_buy_price"] = float(buy_best_match.group(1))
                    buy_range["best_buy_reason"] = buy_best_match.group(2).strip() if buy_best_match.group(2) else ""
                if buy_secondary_match:
                    buy_range["secondary_buy_price"] = float(buy_secondary_match.group(1))
                    buy_range["secondary_buy_reason"] = buy_secondary_match.group(2).strip() if buy_secondary_match.group(2) else ""
                if buy_stop_match:
                    buy_range["stop_loss"] = float(buy_stop_match.group(1))
                    buy_range["stop_loss_reason"] = buy_stop_match.group(2).strip() if buy_stop_match.group(2) else ""
                if buy_profit_match:
                    buy_range["take_profit"] = float(buy_profit_match.group(1))
                    buy_range["take_profit_reason"] = buy_profit_match.group(2).strip() if buy_profit_match.group(2) else ""
                price_range["buy_range"] = buy_range

            # 解析卖出区间（包含价格和理由）
            sell_best_pattern = r'最佳卖出价格[:：]\s*([\d.]+)\s*（?依据[:：]\s*([^）\n]+)）?'
            sell_secondary_pattern = r'次优卖出价格[:：]\s*([\d.]+)\s*（?依据[:：]\s*([^）\n]+)）?'
            sell_stop_pattern = r'止损位[:：]\s*([\d.]+)\s*（?依据[:：]\s*([^）\n]+)）?'
            sell_profit_pattern = r'止盈位[:：]\s*([\d.]+)\s*（?依据[:：]\s*([^）\n]+)）?'

            sell_best_match = re.search(sell_best_pattern, response)
            sell_secondary_match = re.search(sell_secondary_pattern, response)
            sell_stop_match = re.search(sell_stop_pattern, response)
            sell_profit_match = re.search(sell_profit_pattern, response)

            if sell_best_match or sell_secondary_match or sell_stop_match or sell_profit_match:
                sell_range = {}
                if sell_best_match:
                    sell_range["best_sell_price"] = float(sell_best_match.group(1))
                    sell_range["best_sell_reason"] = sell_best_match.group(2).strip() if sell_best_match.group(2) else ""
                if sell_secondary_match:
                    sell_range["secondary_sell_price"] = float(sell_secondary_match.group(1))
                    sell_range["secondary_sell_reason"] = sell_secondary_match.group(2).strip() if sell_secondary_match.group(2) else ""
                if sell_stop_match:
                    sell_range["stop_loss"] = float(sell_stop_match.group(1))
                    sell_range["stop_loss_reason"] = sell_stop_match.group(2).strip() if sell_stop_match.group(2) else ""
                if sell_profit_match:
                    sell_range["take_profit"] = float(sell_profit_match.group(1))
                    sell_range["take_profit_reason"] = sell_profit_match.group(2).strip() if sell_profit_match.group(2) else ""
                price_range["sell_range"] = sell_range

            # 解析布林带和均线信息
            bollinger_match = re.search(r'布林带[：:]\s*(.+?)(?:\n|$)', response)
            ma_match = re.search(r'均线[：:]\s*(.+?)(?:\n|$)', response)
            if bollinger_match:
                price_range["bollinger"] = bollinger_match.group(1).strip()
            if ma_match:
                price_range["ma"] = ma_match.group(1).strip()

            if price_range:
                logger.debug(f"成功从LLM响应中解析价格区间: {price_range}")

        except Exception as e:
            logger.warning(f"解析LLM响应中的价格区间失败: {e}")

        return price_range

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

### 1. 核心技术指标评分

| 指标维度 | 评分 | 说明 |
|---------|------|------|
| 均线排列 | {timing_result.get('ma_alignment', 0):.4f} | 正值为多头排列，负值为空头排列 |
| 创新高比例 | {timing_result.get('new_high_low_ratio', 0):.4f} | 正值创新高占优，负值创新低占优 |
| 股价与10日线关系 | {timing_result.get('price_vs_ma10', 0):.4f} | 正值股价在均线上方，负值在下方 |
| 量能配合度 | {timing_result.get('volume_price_sync', 0):.4f} | 正值量价配合良好，负值配合差 |
| 换手率波动 | {timing_result.get('turnover_volatility', 0):.4f} | 正值换手率稳定，负值波动大 |
| MACD强度 | {timing_result.get('macd_strength', 0):.4f} | 正值多头信号强，负值空头信号强 |
| 布林带位置 | {timing_result.get('bollinger_position', 0):.4f} | 正值靠近下轨，负值靠近上轨 |
| ATR变化 | {timing_result.get('atr_change', 0):.4f} | 正值波动率稳定，负值波动大 |
| 主力资金流向 | {timing_result.get('main_flow', 0):.4f} | 正值资金流入，负值资金流出 |

---

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
            report += """
---

## 五、风险提示

- 技术分析仅供参考，不构成投资建议
- 市场有风险，投资需谨慎
- 建议结合基本面分析做出投资决策
"""
        return report
