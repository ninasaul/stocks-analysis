"""技术指标计算模块 - 10 维度技术打分体系"""
import numpy as np
from typing import Optional, Dict, List
from .logging import logger


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
            total_score = sum(scores.values()) / len(scores)
            scores["total"] = round(total_score, 2)
            
            # 根据综合得分生成交易信号
            if total_score > 30:
                scores["signal"] = "BUY"
            elif total_score < -30:
                scores["signal"] = "SELL"
            else:
                scores["signal"] = "HOLD"

            logger.info(f"股票 {self.ticker} 技术指标择时打分计算完成，得分详情: {scores}")
            return scores
        except Exception as e:
            logger.error(f"股票 {self.ticker} 计算技术指标择时打分失败: {e}")
            return {}

    def _ma_alignment(self) -> float:
        """均线排列得分 (-100 到 100)"""
        if len(self.closes) < 120:
            return 0
        
        ma5 = np.convolve(self.closes, np.ones(5)/5, mode='valid')[-1]
        ma10 = np.convolve(self.closes, np.ones(10)/10, mode='valid')[-1]
        ma20 = np.convolve(self.closes, np.ones(20)/20, mode='valid')[-1]
        ma60 = np.convolve(self.closes, np.ones(60)/60, mode='valid')[-1]
        
        # 多头排列: ma5 > ma10 > ma20 > ma60
        if ma5 > ma10 > ma20 > ma60:
            return 100
        # 空头排列: ma5 < ma10 < ma20 < ma60
        elif ma5 < ma10 < ma20 < ma60:
            return -100
        else:
            # 计算排列混乱程度
            order = [ma5, ma10, ma20, ma60]
            sorted_order = sorted(order)
            # 计算与理想多头排列的相似度
            similarity = sum(1 for i in range(4) if order[i] == sorted_order[::-1][i]) / 4
            return round((similarity - 0.5) * 200, 2)

    def _new_high_low_ratio(self) -> float:
        """创新高比例得分 (-100 到 100)"""
        if len(self.closes) < 60:
            return 0
        
        recent_high = max(self.closes[-20:])
        recent_low = min(self.closes[-20:])
        historical_high = max(self.closes[-60:])
        historical_low = min(self.closes[-60:])
        
        # 距离新高的比例 vs 距离新低的比例
        if historical_high == historical_low:
            return 0
        
        high_ratio = (recent_high - historical_low) / (historical_high - historical_low)
        low_ratio = (historical_high - recent_low) / (historical_high - historical_low)
        
        return round((high_ratio - low_ratio) * 100, 2)

    def _price_vs_ma10(self) -> float:
        """股价与10日线关系得分 (-100 到 100)"""
        if len(self.closes) < 10:
            return 0
        
        ma10 = np.convolve(self.closes, np.ones(10)/10, mode='valid')[-1]
        current_price = self.closes[-1]
        
        if ma10 == 0:
            return 0
        
        ratio = current_price / ma10
        # 在10日线之上得正分，之下得负分
        return round((ratio - 1) * 200, 2)

    def _volume_price_sync(self) -> float:
        """量价同步得分 (-100 到 100)"""
        if len(self.closes) < 20:
            return 0
        
        # 计算最近20天的价格变化和成交量变化的相关性
        price_changes = np.diff(self.closes[-20:])
        volume_changes = np.diff(self.volumes[-20:])
        
        if len(price_changes) == 0 or len(volume_changes) == 0:
            return 0
        
        # 标准化
        price_std = np.std(price_changes)
        volume_std = np.std(volume_changes)
        
        if price_std == 0 or volume_std == 0:
            return 0
        
        price_norm = (price_changes - np.mean(price_changes)) / price_std
        volume_norm = (volume_changes - np.mean(volume_changes)) / volume_std
        
        # 计算相关系数
        correlation = np.corrcoef(price_norm, volume_norm)[0, 1]
        
        return round(correlation * 100, 2)

    def _turnover_volatility(self) -> float:
        """换手率波动得分 (-100 到 100)"""
        if len(self.volumes) < 20:
            return 0
        
        recent_volumes = self.volumes[-20:]
        avg_volume = np.mean(recent_volumes)
        std_volume = np.std(recent_volumes)
        
        if avg_volume == 0:
            return 0
        
        # 波动率 = 标准差 / 均值
        volatility = std_volume / avg_volume
        
        # 适度波动是好事，过高或过低都不好
        # 理想波动率范围: 0.2 - 0.5
        ideal_min, ideal_max = 0.2, 0.5
        
        if volatility >= ideal_min and volatility <= ideal_max:
            score = 100
        elif volatility < ideal_min:
            score = round((volatility / ideal_min) * 100, 2)
        else:
            # 超过理想最大值，得分递减
            score = round((1 - (volatility - ideal_max) / (1 - ideal_max)) * 100, 2)
            score = max(-100, score)
        
        return score

    def _macd_strength(self) -> float:
        """MACD强度得分 (-100 到 100)"""
        if len(self.closes) < 34:
            return 0
        
        # 计算 MACD
        ema12 = self._ema(12)
        ema26 = self._ema(26)
        macd_line = ema12 - ema26
        signal_line = self._ema_signal(macd_line, 9)
        
        if len(macd_line) == 0 or len(signal_line) == 0:
            return 0
        
        current_macd = macd_line[-1]
        current_signal = signal_line[-1]
        
        # MACD 柱状图
        histogram = current_macd - current_signal
        
        # 计算得分：MACD线位置和柱状图方向
        score = 0
        
        # MACD线在零轴上方得正分，下方得负分
        zero_score = current_macd / max(abs(current_macd), 0.001) * 50
        
        # 柱状图变化趋势
        if len(macd_line) >= 2:
            prev_histogram = macd_line[-2] - signal_line[-2]
            histogram_change = histogram - prev_histogram
            
            # 柱状图增加得正分，减少得负分
            histogram_score = histogram_change / max(abs(histogram_change), 0.001) * 50
        else:
            histogram_score = 0
        
        score = zero_score + histogram_score
        return round(max(-100, min(100, score)), 2)

    def _ema(self, period: int) -> np.ndarray:
        """计算EMA"""
        if len(self.closes) < period:
            return np.array([])
        
        alpha = 2 / (period + 1)
        ema = np.zeros_like(self.closes)
        ema[period - 1] = np.mean(self.closes[:period])
        
        for i in range(period, len(self.closes)):
            ema[i] = alpha * self.closes[i] + (1 - alpha) * ema[i - 1]
        
        return ema

    def _ema_signal(self, macd_line: np.ndarray, period: int) -> np.ndarray:
        """计算MACD信号线"""
        if len(macd_line) < period:
            return np.array([])
        
        alpha = 2 / (period + 1)
        signal = np.zeros_like(macd_line)
        signal[period - 1] = np.mean(macd_line[:period])
        
        for i in range(period, len(macd_line)):
            signal[i] = alpha * macd_line[i] + (1 - alpha) * signal[i - 1]
        
        return signal

    def _bollinger_position(self) -> float:
        """布林带位置得分 (-100 到 100)"""
        if len(self.closes) < 20:
            return 0
        
        ma20 = np.convolve(self.closes, np.ones(20)/20, mode='valid')
        std20 = np.array([np.std(self.closes[i:i+20]) for i in range(len(self.closes)-19)])
        
        if len(ma20) == 0 or len(std20) == 0:
            return 0
        
        current_price = self.closes[-1]
        current_ma = ma20[-1]
        current_std = std20[-1]
        
        if current_std == 0:
            return 0
        
        # 计算价格在布林带中的位置
        upper_band = current_ma + 2 * current_std
        lower_band = current_ma - 2 * current_std
        
        if upper_band == lower_band:
            return 0
        
        position = (current_price - lower_band) / (upper_band - lower_band)
        # 归一化到 -100 到 100
        return round((position - 0.5) * 200, 2)

    def _atr_change(self) -> float:
        """ATR变化得分 (-100 到 100)"""
        if len(self.highs) < 20:
            return 0
        
        # 计算真实波动范围
        tr = np.maximum(
            self.highs[1:] - self.lows[1:],
            np.abs(self.highs[1:] - self.closes[:-1]),
            np.abs(self.lows[1:] - self.closes[:-1])
        )
        
        if len(tr) < 14:
            return 0
        
        # 计算ATR (14日平均真实波动)
        atr = np.zeros(len(tr))
        atr[13] = np.mean(tr[:14])
        for i in range(14, len(tr)):
            atr[i] = (atr[i-1] * 13 + tr[i]) / 14
        
        if len(atr) < 2:
            return 0
        
        # 最近ATR与前期ATR的比值
        recent_atr = atr[-1]
        avg_atr = np.mean(atr[-20:])
        
        if avg_atr == 0:
            return 0
        
        ratio = recent_atr / avg_atr
        
        # 适度波动是好事，过高或过低都不好
        ideal_min, ideal_max = 0.8, 1.5
        
        if ratio >= ideal_min and ratio <= ideal_max:
            score = 100
        elif ratio < ideal_min:
            score = round((ratio / ideal_min) * 100, 2)
        else:
            score = round((1 - (ratio - ideal_max) / ratio) * 100, 2)
            score = max(-100, score)
        
        return score

    def _main_flow(self) -> float:
        """主力资金流向得分 (-100 到 100)"""
        if len(self.closes) < 20:
            return 0
        
        # 简化的资金流向计算
        # 根据收盘价位置和成交量判断
        recent_closes = self.closes[-20:]
        recent_volumes = self.volumes[-20:]
        
        # 计算每天的资金流向指标
        flow_scores = []
        for i in range(1, len(recent_closes)):
            price_change = recent_closes[i] - recent_closes[i-1]
            volume = recent_volumes[i]
            
            # 上涨且放量为正，下跌且放量为负
            if volume > np.mean(recent_volumes):
                if price_change > 0:
                    flow_scores.append(1)
                else:
                    flow_scores.append(-1)
            else:
                flow_scores.append(0)
        
        if len(flow_scores) == 0:
            return 0
        
        # 计算平均资金流向
        avg_flow = sum(flow_scores) / len(flow_scores)
        return round(avg_flow * 100, 2)
