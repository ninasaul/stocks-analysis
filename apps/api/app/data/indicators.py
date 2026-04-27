"""技术指标计算模块 - 10 维度技术打分体系"""
import numpy as np
from typing import Optional, Dict, List
from ..core.logging import logger


class TimingScorer:
    """10 维度择时打分器"""

    def __init__(self, history: List[Dict], ticker: str = None, market: str = None):
        """
        history: 日线数据列表，每项包含
        {date, open, high, low, close, volume, amount}
        至少需要 120 个交易日
        """
        self.h = history
        self.closes = np.array([d["close"] for d in history])
        self.volumes = np.array([d["volume"] for d in history])
        self.highs = np.array([d["high"] for d in history])
        self.lows = np.array([d["low"] for d in history])
        self.opens = np.array([d["open"] for d in history])
        self.ticker = ticker
        self.market = market

    def score_all(self) -> Dict:
        """计算全部 9 个维度的得分"""
        logger.info(f"开始计算股票 {self.ticker} 的技术指标")
        try:
            scores = {
                # 价格维度
                "ma_alignment": self._ma_alignment(),
                # 创新高比例
                "new_high_low_ratio": self._new_high_low_ratio(),
                # 股价与10日线的关系
                "price_vs_ma10": self._price_vs_ma10(), 
                # 量能维度
                "volume_price_sync": self._volume_price_sync(),
                # 换手率波动
                "turnover_volatility": self._turnover_volatility(),
                # 动量维度
                "macd_strength": self._macd_strength(),
                # 波动维度
                "bollinger_position": self._bollinger_position(),
                # 平均振幅变化
                "atr_change": self._atr_change(),
                # 资金维度
                "main_flow": self._main_flow(),
            }

            # 综合得分 = 各维度加权平均
            weights = {
                "ma_alignment": 0.2,           # 均线排列
                "bollinger_position": 0.2,     # 布林带位置
                "price_vs_ma10": 0.2,          # 股价与10日线的关系
                "new_high_low_ratio": 0.1,     # 创新高比例
                "atr_change": 0.07,            # ATR 变化
                "volume_price_sync": 0.07,      # 量价配合度
                "macd_strength": 0.07,          # MACD 强度
                "turnover_volatility": 0.07,    # 换手率波动
                "main_flow": 0.02,              # 主力资金流向
            }

            composite = sum(
                scores[k] * weights[k] for k in weights
            )

            scores["composite"] = round(composite, 4)
            scores["signal"] = self._composite_to_signal(composite)
            
            # 根据布林带位置计算趋势
            bollinger_pos = scores.get("bollinger_position", 0)
            if bollinger_pos > 0.5:
                scores["bollinger_status"] = "超卖"
            elif bollinger_pos < -0.5:
                scores["bollinger_status"] = "超买"
            else:
                scores["bollinger_status"] = "中性"
            
            # 只有当信号不是 HOLD 时才添加买卖区间建议
            if scores["signal"] != "HOLD":
                scores["price_range"] = self._calculate_price_range(scores["signal"])

            logger.info(f"技术指标计算完成，信号: {scores['signal']}, 综合得分: {scores['composite']}, 布林带状态: {scores['bollinger_status']}")
            return scores
        except Exception as e:
            logger.error(f"计算技术指标失败: {e}")
            return {"error": f"计算技术指标失败: {e}", "composite": 0.0, "signal": "HOLD"}
    
    def _calculate_price_range(self, signal: str) -> Dict:
        """
        计算买卖价格区间
        
        Args:
            signal: 交易信号（BUY 或 SELL）
            
        Returns:
            包含当前价格和相应买卖区间的字典
        """
        logger.debug(f"开始计算价格区间，信号: {signal}")
        
        if len(self.closes) == 0:
            logger.error("收盘价数据为空，无法计算价格区间")
            return {
                "error": "收盘价数据为空，无法计算价格区间"
            }
        
        current_price = self.closes[-1]
        logger.debug(f"当前价格: {current_price}")
        logger.debug(f"收盘价数据长度: {len(self.closes)}")
        
        # 基于布林带计算价格区间
        period = 20
        if len(self.closes) >= period:
            ma = np.mean(self.closes[-period:])
            std = np.std(self.closes[-period:])
            upper = ma + 2 * std
            lower = ma - 2 * std
            middle = ma
            logger.debug(f"布林带计算结果 - 上轨: {upper}, 中轨: {middle}, 下轨: {lower}")
        else:
            # 如果数据不足，返回空数据并打印报错
            logger.error(f"数据不足，无法计算布林带指标，需要至少 {period} 个交易日的数据，当前只有 {len(self.closes)} 个数据点")
            return {
                "current_price": round(current_price, 2),
                "error": f"数据不足，无法计算价格区间，需要至少 {period} 个交易日的数据，当前只有 {len(self.closes)} 个数据点"
            }
        
        # 计算MA均线
        ma5 = self._ma(5)
        ma10 = self._ma(10)
        logger.debug(f"MA均线计算结果 - MA5: {ma5}, MA10: {ma10}")
        
        # 基于 RSI 计算超买超卖区间
        rsi = self._rsi_position()
        logger.debug(f"RSI位置: {rsi}")
        
        # 计算价格区间
        price_range = {
            "current_price": round(current_price, 2),
            "bollinger": {
                "upper": round(upper, 2),
                "middle": round(middle, 2),
                "lower": round(lower, 2)
            },
            "ma": {
                "ma5": round(ma5, 2),
                "ma10": round(ma10, 2)
            }
        }
        
        # 根据信号添加相应的区间
        if signal == "BUY":
            # 计算买点
            if current_price <= lower:
                # 股价跌破下轨
                best_buy_price = round(current_price * 0.98, 2)  # 最佳买点：股价下方2%
                secondary_buy_price = round(lower, 2)  # 次优买点：下轨
                buy_low = round(current_price * 0.97, 2)  # 买入区间：股价下方3%
                buy_high = round(current_price * 1.03, 2)  # 买入区间：股价上方3%
            elif current_price <= middle:
                # 股价在下轨和中轨之间
                best_buy_price = round(current_price * 0.98, 2)  # 最佳买点：股价下方2%
                secondary_buy_price = round(middle, 2)  # 次优买点：中轨
                buy_low = round(lower, 2)  # 买入区间：下轨
                buy_high = round(middle, 2)  # 买入区间：中轨
            else:
                # 股价在中轨和上轨之间
                best_buy_price = round(middle, 2)  # 最佳买点：中轨
                secondary_buy_price = round(current_price * 1.02, 2)  # 次优买点：股价上方2%
                buy_low = round(middle, 2)  # 买入区间：中轨
                buy_high = round(upper, 2)  # 买入区间：上轨
            
            # 生成买入建议
            suggestion = ""
            if current_price <= lower:
                # 股价跌破下轨
                if rsi > 0.7:  # 超卖
                    suggestion = "股价跌破布林带下轨，RSI超卖，最佳买点出现，建议积极买入"
                else:
                    suggestion = "股价跌破布林带下轨，建议在最佳买点附近分批买入"
            elif current_price <= middle:
                # 股价在中轨和下轨之间
                if ma5 > ma10:  # 金叉
                    suggestion = "股价在布林带中轨下方，MA5金叉MA10，次优买点出现，建议分批买入"
                else:
                    suggestion = "股价在布林带中轨下方，建议在次优买点附近分批买入"
            else:
                # 股价在中轨上方
                suggestion = "股价在布林带中轨上方，建议等待回调至次优买点附近买入"
            
            # 根据股价位置计算止损止盈
            if current_price <= lower:
                # 股价跌破下轨
                buy_stop_loss = round(current_price * 0.95, 2)  # 止损：当前股价下方5%
                buy_take_profit = round(current_price * 0.95, 2)  # 止盈：当前股价下方5%
            elif current_price <= middle:
                # 股价在下轨和中轨之间
                buy_stop_loss = round(lower * 0.95, 2)  # 止损：下轨下方5%
                buy_take_profit = round(lower, 2)  # 止盈：下轨
            else:
                # 股价在中轨和上轨之间
                buy_stop_loss = round(middle * 0.95, 2)  # 止损：中轨下方5%
                buy_take_profit = round(middle, 2)  # 止盈：中轨
            
            buy_range = {
                "best_buy_price": best_buy_price,
                "secondary_buy_price": secondary_buy_price,
                "low": buy_low,
                "high": buy_high,
                "suggestion": suggestion,
                "stop_loss": buy_stop_loss,
                "take_profit": buy_take_profit
            }
            price_range["buy_range"] = buy_range
            logger.debug(f"买入区间计算结果 - 最佳买入价: {best_buy_price}, 次优买入价: {secondary_buy_price}, 止损位: {buy_range['stop_loss']}, 止盈位: {buy_range['take_profit']}")
        elif signal == "SELL":
            # 计算卖点
            if current_price <= lower:
                # 股价跌破下轨
                best_sell_price = round(lower, 2)  # 最佳卖点：下轨
                secondary_sell_price = round(current_price * 0.98, 2)  # 次优卖点：股价下方2%
                sell_low = round(current_price * 0.97, 2)  # 卖出区间：股价下方3%
                sell_high = round(current_price * 1.03, 2)  # 卖出区间：股价上方3%
            elif current_price <= middle:
                # 股价在下轨和中轨之间
                best_sell_price = round(middle, 2)  # 最佳卖点：中轨
                secondary_sell_price = round(current_price * 0.98, 2)  # 次优卖点：股价下方2%
                sell_low = round(lower, 2)  # 卖出区间：下轨
                sell_high = round(middle, 2)  # 卖出区间：中轨
            else:
                # 股价在中轨和上轨之间
                best_sell_price = round(upper, 2)  # 最佳卖点：上轨
                secondary_sell_price = round(current_price * 0.98, 2)  # 次优卖点：股价下方2%
                sell_low = round(middle, 2)  # 卖出区间：中轨
                sell_high = round(upper, 2)  # 卖出区间：上轨
            
            # 生成卖出建议
            suggestion = ""
            if current_price >= upper:
                # 股价突破上轨
                if rsi < -0.7:  # 超买
                    suggestion = "股价突破布林带上轨，RSI超买，最佳卖点出现，建议积极卖出"
                else:
                    suggestion = "股价突破布林带上轨，建议在最佳卖点附近分批卖出"
            elif current_price >= middle:
                # 股价在中轨和上轨之间
                if ma5 < ma10:  # 死叉
                    suggestion = "股价在布林带中轨上方，MA5死叉MA10，次优卖点出现，建议分批卖出"
                else:
                    suggestion = "股价在布林带中轨上方，建议在次优卖点附近分批卖出"
            elif current_price >= lower:
                # 股价在下轨和中轨之间
                suggestion = "股价在布林带中轨下方，建议等待反弹至次优卖点附近卖出"
            else:
                # 股价跌破下轨
                suggestion = "股价跌破布林带下轨，建议等待反弹至次优卖点附近卖出"
            
            # 根据股价位置计算止损止盈
            if current_price <= lower:
                # 股价跌破下轨
                sell_stop_loss = round(current_price * 1.05, 2)  # 止损：当前股价上方5%
                sell_take_profit = round(current_price * 1.05, 2)  # 止盈：当前股价上方5%
            elif current_price <= middle:
                # 股价在下轨和中轨之间
                sell_stop_loss = round(lower * 1.05, 2)  # 止损：下轨上方5%
                sell_take_profit = round(lower, 2)  # 止盈：下轨
            else:
                # 股价在中轨和上轨之间
                sell_stop_loss = round(middle * 1.05, 2)  # 止损：中轨上方5%
                sell_take_profit = round(middle, 2)  # 止盈：中轨
            
            sell_range = {
                "best_sell_price": best_sell_price,
                "secondary_sell_price": secondary_sell_price,
                "low": sell_low,
                "high": sell_high,
                "suggestion": suggestion,
                "stop_loss": sell_stop_loss,
                "take_profit": sell_take_profit
            }
            price_range["sell_range"] = sell_range
            logger.debug(f"卖出区间计算结果 - 最佳卖出价: {best_sell_price}, 次优卖出价: {secondary_sell_price}, 止损位: {sell_range['stop_loss']}, 止盈位: {sell_range['take_profit']}")
        
        logger.debug(f"价格区间计算完成: {price_range}")
        return price_range

    # ========== 价格维度 ==========

    def _ma_alignment(self) -> float:
        """
        指标 1：均线排列度

        计算短期均线（MA5/10/20/30/60）的排列情况
        多头排列 → 1，空头排列 → -1
        """
        ma5 = self._ma(5)
        ma10 = self._ma(10)
        ma20 = self._ma(20)
        ma30 = self._ma(30)
        ma60 = self._ma(60)

        pairs = [(ma5, ma10), (ma10, ma20), (ma20, ma30), (ma30, ma60)]
        bull_count = sum(1 for a, b in pairs if a > b)
        bear_count = sum(1 for a, b in pairs if a < b)

        return (bull_count - bear_count) / 4.0

    def _price_vs_ma10(self) -> float:
        """
        指标 2：股价与 10 日线的关系

        股价在 10 日线上 → 看多
        股价在 10 日线下 → 看空
        """
        current_price = self.closes[-1]
        ma10 = self._ma(10)
        
        # 计算股价与 10 日线的偏离百分比
        if ma10 == 0:
            return 0.0
        
        deviation = (current_price - ma10) / ma10
        
        # 归一化到 [-1, 1] 范围
        # 使用 tanh 函数进行平滑归一化
        normalized_deviation = np.tanh(deviation * 10)  # 乘以 10 是为了让变化更明显
        
        return float(normalized_deviation)

    def _new_high_low_ratio(self, window: int = 5) -> float:
        """
        指标 2：N 日创新高天数占比

        近 5 日中收盘价创近 30 日新高的天数占比
        占比高 → 趋势强 → 看多
        """
        if len(self.closes) < 30:
            return 0.0

        recent = self.closes[-window:]
        count = 0
        for i in range(len(recent)):
            idx = len(self.closes) - window + i
            past_30 = self.closes[max(0, idx - 30):idx]
            if len(past_30) > 0 and recent[i] >= max(past_30):
                count += 1

        ratio = count / window
        return (ratio - 0.5) * 2  # 归一化到 [-1, 1]

    # ========== 量能维度 ==========

    def _volume_price_sync(self, window: int = 10) -> float:
        """
        指标 3：量价配合度

        价涨量增 = 健康上涨 → 看多
        价涨量缩 = 背离 → 看空
        用近 N 日价格变化和成交量变化的相关系数衡量
        """
        if len(self.closes) < window + 1:
            return 0.0

        price_changes = np.diff(self.closes[-window - 1:])
        vol_changes = np.diff(self.volumes[-window - 1:])

        if np.std(price_changes) == 0 or np.std(vol_changes) == 0:
            return 0.0

        corr = np.corrcoef(price_changes, vol_changes)[0, 1]
        return float(np.clip(corr, -1, 1))

    def _turnover_volatility(self, window: int = 60) -> float:
        """
        指标 4：换手率波动

        换手率波动急剧放大 → 情绪极端 → 反转信号
        换手率稳定 → 趋势延续
        """
        if len(self.volumes) < window:
            return 0.0

        recent_vol = self.volumes[-20:]
        long_vol = self.volumes[-window:]

        recent_std = np.std(recent_vol) / (np.mean(recent_vol) + 1e-8)
        long_std = np.std(long_vol) / (np.mean(long_vol) + 1e-8)

        ratio = recent_std / (long_std + 1e-8)

        # 波动率急剧放大 → 信号值偏向极端
        if ratio > 2.0:
            return -0.5  # 过度波动，谨慎
        elif ratio < 0.5:
            return 0.3   # 低波动，可能蓄势
        else:
            return 0.0

    # ========== 动量维度 ==========

    def _macd_strength(self) -> float:
        """
        指标 5：MACD 信号强度

        MACD 柱状图（MACD - Signal）的方向和幅度
        金叉且柱状图放大 → 强看多
        死叉且柱状图放大 → 强看空
        """
        if len(self.closes) < 35:
            return 0.0

        ema12 = self._ema(12)
        ema26 = self._ema(26)
        dif = ema12 - ema26
        dea = self._ema_from_array(
            np.array([dif]), 9
        ) if isinstance(dif, (int, float)) else 0

        # 简化：用 DIF 的符号和幅度
        price = self.closes[-1]
        normalized = dif / (price + 1e-8) * 100

        return float(np.clip(normalized / 3.0, -1, 1))

    def _rsi_position(self, period: int = 14) -> float:
        """
        指标 6：RSI 位置

        RSI > 70 → 超买 → 看空信号
        RSI < 30 → 超卖 → 看多信号
        RSI 在 40-60 → 中性
        """
        if len(self.closes) < period + 1:
            return 0.0

        deltas = np.diff(self.closes[-(period + 1):])
        gains = np.where(deltas > 0, deltas, 0)
        losses = np.where(deltas < 0, -deltas, 0)

        avg_gain = np.mean(gains)
        avg_loss = np.mean(losses)

        if avg_loss == 0:
            rsi = 100
        else:
            rs = avg_gain / avg_loss
            rsi = 100 - (100 / (1 + rs))

        # RSI → [-1, 1]：50 为中心，30 和 70 为极值
        return float(np.clip((50 - rsi) / 30, -1, 1))

    # ========== 波动维度 ==========

    def _bollinger_position(self, period: int = 20) -> float:
        """
        指标 7：布林带位置

        价格在上轨附近 → 超买 → -0.5~-1
        价格在下轨附近 → 超卖 → +0.5~+1
        价格在中轨附近 → 中性 → 0
        """
        if len(self.closes) < period:
            return 0.0

        ma = np.mean(self.closes[-period:])
        std = np.std(self.closes[-period:])
        upper = ma + 2 * std
        lower = ma - 2 * std

        if std == 0:
            return 0.0

        price = self.closes[-1]
        position = (price - ma) / (2 * std)

        # 反转逻辑：靠近上轨看空，靠近下轨看多
        return float(np.clip(-position, -1, 1))

    def _atr_change(self, period: int = 14) -> float:
        """
        指标 8：ATR 波动率变化

        ATR 放大 → 波动加剧 → 趋势可能变化
        ATR 缩小 → 波动收敛 → 可能蓄势突破
        """
        if len(self.closes) < period + 20:
            return 0.0

        tr_list = []
        for i in range(-period - 20, 0):
            tr = max(
                self.highs[i] - self.lows[i],
                abs(self.highs[i] - self.closes[i - 1]),
                abs(self.lows[i] - self.closes[i - 1])
            )
            tr_list.append(tr)

        recent_atr = np.mean(tr_list[-period:])
        prev_atr = np.mean(tr_list[:period])

        if prev_atr == 0:
            return 0.0

        change = (recent_atr - prev_atr) / prev_atr

        # ATR 大幅增加 → 波动放大 → 不确定性高
        return float(np.clip(-change * 2, -1, 1))

    def _main_flow(self) -> float:
        """
        指标 9：主力资金流向

        使用 AkShare 获取主力资金最近 5 日净流入/流出金额
        归一化到 [-1, 1] 范围
        """
        if not self.ticker:
            return 0.0

        try:
            import akshare as ak
            # 获取主力资金数据，使用正确的参数名
            df = ak.stock_individual_fund_flow(stock=self.ticker, market=self.market)
            if not df.empty:
                if '主力净流入-净额' in df.columns:
                    # 计算最近 5 天的主力净流入总和
                    # 注意：数据按日期升序排列，最新的在最后
                    net_flow_5days = df['主力净流入-净额'].tail(5).sum()
                    # 归一化到 [-1, 1]，使用 tanh 函数进行平滑归一化
                    # 以 1 亿为阈值，这样得分会更加平滑，不会轻易达到满分值
                    normalized_flow = np.tanh(net_flow_5days / 100000000)
                    return float(normalized_flow)
                else:
                    # 如果找不到合适的列，返回 0
                    logger.warning(f"未找到主力净流入列，列名: {list(df.columns)}")
                    return 0.0
        except Exception as e:
            logger.error(f"获取主力资金数据失败: {e}")
        return 0.0

    # ========== 辅助方法 ==========

    def _ma(self, period: int) -> float:
        if len(self.closes) < period:
            return float(np.mean(self.closes))  # 使用当前所有数据计算
        return float(np.mean(self.closes[-period:]))

    def _ema(self, period: int) -> float:
        if len(self.closes) < period:
            return self.closes[-1]
        multiplier = 2 / (period + 1)
        # 确保从足够早的数据开始计算，避免索引错误
        start_idx = max(0, len(self.closes) - period - 20)
        ema = self.closes[start_idx]  # 从更早开始计算
        for price in self.closes[start_idx + 1:]:
            ema = (price - ema) * multiplier + ema
        return float(ema)

    def _ema_from_array(self, arr: np.ndarray, period: int) -> float:
        if len(arr) < 2:
            return float(arr[-1]) if len(arr) > 0 else 0.0
        multiplier = 2 / (period + 1)
        ema = float(arr[0])
        for val in arr[1:]:
            ema = (float(val) - ema) * multiplier + ema
        return ema

    def _composite_to_signal(self, score: float) -> str:
        """综合得分转为交易信号"""
        if score >= 0.15:
            return "BUY"
        elif score <= -0.15:
            return "SELL"
        else:
            return "HOLD"