# 聚焦选股与择时的简化多智能体系统

> 基于 TradingAgents-CN 的 Bull/Bear 辩论机制
> 砍掉一切非核心模块，只保留"该不该买"和"什么时候买/卖"

---

## 一、设计哲学：做减法

TradingAgents-CN 有 7 个角色、5 个阶段、MongoDB+Redis+Vue+FastAPI。
**我们只保留 3 个角色、2 个阶段、纯 Python + 单文件可运行。**

```
砍掉的：
  ✗ Web 前端（Vue 3 + Element Plus）
  ✗ 数据库（MongoDB + Redis）
  ✗ 用户管理 / 权限系统
  ✗ 新闻分析师（择时主要看量价，新闻是干扰项）
  ✗ 舆情分析师（同上）
  ✗ 基金经理审批（个人用不需要层级审批）
  ✗ 配置管理中心

保留并强化的：
  ✓ 技术面分析师（择时核心：量价趋势波动）
  ✓ 基本面分析师（选股核心：估值安全边际）
  ✓ Bull/Bear 辩论（多空对抗出信号）
  ✓ 择时信号引擎（10 维度技术打分）
  ✓ 交易纪律检查
  ✓ 命令行 + 推送（企微/TG）
  ✓ GitHub Actions 定时运行
```

### 核心公式

```
选股 = 基本面分析师筛选（安全边际 + 成长性 + 质量）
择时 = 技术面分析师打分（10 维度）→ Bull/Bear 辩论 → 信号
```

---

## 二、项目结构（极简）

```
timing-agent/
├── CLAUDE.md                  # Claude Code 项目配置
├── main.py                    # 主入口（< 100 行）
├── config.py                  # 配置（环境变量）
│
├── data/                      # 数据层
│   ├── fetcher.py             # AkShare 数据获取
│   └── indicators.py          # 技术指标计算（10 维度）
│
├── agents/                    # 智能体（只有 3 个）
│   ├── stock_picker.py        # 选股智能体（基本面）
│   ├── timer.py               # 择时智能体（技术面 10 维度打分）
│   └── debate.py              # Bull/Bear 辩论（简化版）
│
├── signal/                    # 信号输出
│   ├── scorer.py              # 综合打分（-1 到 +1）
│   └── output.py              # 格式化输出 + 推送
│
├── tests/
│   └── test_all.py
│
├── .github/workflows/
│   └── daily.yml              # GitHub Actions
├── .env.example
└── requirements.txt           # 依赖 < 10 个
```

**依赖极简：**
```
akshare
litellm
python-dotenv
requests
pytest
```

---

## 三、择时引擎：10 维度技术打分体系

这是整个系统的核心。参考华泰证券研究所的择时框架，将"市场状态"细分为 5 大类 10 个具体的观测维度，每个维度输出 [-1, +1] 的标准化得分。

### 3.1 十大择时指标

```python
# data/indicators.py
"""
择时核心：10 维度技术打分体系

每个指标输出 [-1, +1] 的标准化分数：
  +1 = 极度看多信号
   0 = 中性
  -1 = 极度看空信号

5 大类 10 个维度：
├── 价格维度（趋势跟踪）
│   ├── 1. 均线多头排列度
│   └── 2. 价格创新高/新低比率
├── 量能维度（资金意愿）
│   ├── 3. 量价配合度
│   └── 4. 换手率波动
├── 动量维度（力度判断）
│   ├── 5. MACD 信号强度
│   └── 6. RSI 位置
├── 波动维度（风险衡量）
│   ├── 7. 布林带位置
│   └── 8. ATR 波动率变化
└── 资金维度（主力意图）
    ├── 9. 北向资金流向（A 股）
    └── 10. 主力资金净流入
"""
import numpy as np
from typing import Optional


class TimingScorer:
    """10 维度择时打分器"""

    def __init__(self, history: list[dict]):
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

    def score_all(self) -> dict:
        """计算全部 10 个维度的得分"""
        scores = {
            # 价格维度
            "ma_alignment": self._ma_alignment(),
            "new_high_low_ratio": self._new_high_low_ratio(),
            # 量能维度
            "volume_price_sync": self._volume_price_sync(),
            "turnover_volatility": self._turnover_volatility(),
            # 动量维度
            "macd_strength": self._macd_strength(),
            "rsi_position": self._rsi_position(),
            # 波动维度
            "bollinger_position": self._bollinger_position(),
            "atr_change": self._atr_change(),
            # 资金维度（需要额外数据，缺失时返回 0）
            "north_flow": 0.0,   # 由外部注入
            "main_flow": 0.0,    # 由外部注入
        }

        # 综合得分 = 各维度加权平均
        weights = {
            "ma_alignment": 0.15,
            "new_high_low_ratio": 0.10,
            "volume_price_sync": 0.12,
            "turnover_volatility": 0.08,
            "macd_strength": 0.12,
            "rsi_position": 0.10,
            "bollinger_position": 0.10,
            "atr_change": 0.08,
            "north_flow": 0.08,
            "main_flow": 0.07,
        }

        composite = sum(
            scores[k] * weights[k] for k in weights
        )

        scores["composite"] = round(composite, 4)
        scores["signal"] = self._composite_to_signal(composite)

        return scores

    # ========== 价格维度 ==========

    def _ma_alignment(self) -> float:
        """
        指标 1：均线多头排列度

        MA5 > MA10 > MA20 > MA60 为完美多头排列 → +1
        完美空头排列 → -1
        部分排列 → 按比例折算
        """
        ma5 = self._ma(5)
        ma10 = self._ma(10)
        ma20 = self._ma(20)
        ma60 = self._ma(60)

        if any(v is None for v in [ma5, ma10, ma20, ma60]):
            return 0.0

        pairs = [(ma5, ma10), (ma10, ma20), (ma20, ma60)]
        bull_count = sum(1 for a, b in pairs if a > b)
        bear_count = sum(1 for a, b in pairs if a < b)

        return (bull_count - bear_count) / 3.0

    def _new_high_low_ratio(self, window: int = 20) -> float:
        """
        指标 2：N 日创新高天数占比

        近 20 日中收盘价创近 60 日新高的天数占比
        占比高 → 趋势强 → 看多
        """
        if len(self.closes) < 60:
            return 0.0

        recent = self.closes[-window:]
        count = 0
        for i in range(len(recent)):
            idx = len(self.closes) - window + i
            past_60 = self.closes[max(0, idx - 60):idx]
            if len(past_60) > 0 and recent[i] >= max(past_60):
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

    # ========== 辅助方法 ==========

    def _ma(self, period: int) -> Optional[float]:
        if len(self.closes) < period:
            return None
        return float(np.mean(self.closes[-period:]))

    def _ema(self, period: int) -> float:
        if len(self.closes) < period:
            return self.closes[-1]
        multiplier = 2 / (period + 1)
        ema = self.closes[-(period + 20)]  # 从更早开始计算
        for price in self.closes[-(period + 19):]:
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

    @staticmethod
    def _composite_to_signal(score: float) -> str:
        """综合得分转为交易信号"""
        if score >= 0.33:
            return "BUY"
        elif score <= -0.33:
            return "SELL"
        else:
            return "HOLD"
```

### 3.2 选股智能体（基本面筛选）

```python
# agents/stock_picker.py
"""
选股智能体：基本面安全边际筛选

不是"选哪只好"，而是"这只能不能买"的门槛检查。
通过 LLM 对基本面数据进行结构化评估。
"""


PICKER_PROMPT = """你是一位严格的基本面分析师。你的任务不是推荐股票，
而是评估 {ticker} 是否通过基本面安全边际检查。

## 财务数据
{fundamental_data}

## 评估标准（必须逐项检查）

1. **估值安全**：PE 是否低于行业均值的 1.5 倍？PB 是否合理？
2. **盈利质量**：ROE 是否 > 10%？毛利率是否稳定或提升？
3. **成长性**：营收和净利润是否连续 2 年正增长？
4. **财务健康**：资产负债率是否 < 70%？经营现金流是否为正？
5. **排雷检查**：是否存在商誉减值风险？是否有 ST 风险？

## 输出格式（JSON）
{{
  "pass": true/false,
  "score": 1-10,
  "checks": {{
    "valuation": {{"pass": true/false, "detail": "..."}},
    "profitability": {{"pass": true/false, "detail": "..."}},
    "growth": {{"pass": true/false, "detail": "..."}},
    "health": {{"pass": true/false, "detail": "..."}},
    "risk_screen": {{"pass": true/false, "detail": "..."}}
  }},
  "conclusion": "一句话总结"
}}

通过条件：5 项中至少 4 项 pass。
严格评估，宁可错过不可错选。"""
```

### 3.3 简化版辩论引擎

```python
# agents/debate.py
"""
简化版 Bull/Bear 辩论

只保留核心：Bull → Bear → 信号输出
没有 Judge（用规则替代），没有多轮（只 1 轮）
"""

BULL_PROMPT = """你是看多研究员。基于以下数据为 {ticker} 构建看多论点。

## 技术打分（10 维度）
{timing_scores}

## 基本面检查
{fundamental_check}

规则：
- 必须用具体数据支撑每个论点
- 至少 3 个论点
- 给出看多评分（1-10）
- JSON 格式输出

{{
  "arguments": ["论点1", "论点2", "论点3"],
  "score": 7,
  "best_entry_condition": "最佳入场条件描述"
}}"""


BEAR_PROMPT = """你是看空研究员。基于以下数据对 {ticker} 提出风险警告。

## 技术打分（10 维度）
{timing_scores}

## 基本面检查
{fundamental_check}

## 看多方论点
{bull_args}

规则：
- 必须针对看多方的论点逐条反驳
- 指出被忽略的风险因素
- 给出看空评分（1-10）
- JSON 格式输出

{{
  "rebuttals": ["反驳1", "反驳2", "反驳3"],
  "risks": ["风险1", "风险2"],
  "score": 5,
  "worst_case": "最差情况描述"
}}"""


async def run_debate(ticker: str, timing_scores: dict,
                     fundamental: dict, llm) -> dict:
    """
    执行一轮 Bull/Bear 辩论，输出最终信号

    不用 Judge LLM——用规则直接算：
    - Bull 评分 - Bear 评分 > 3  → BUY
    - Bull 评分 - Bear 评分 < -3 → SELL
    - 其他 → HOLD

    再与技术打分做加权融合：
    最终信号 = 0.4 × 辩论信号 + 0.6 × 技术打分信号
    """
    # Bull 发言
    bull_response = await llm.chat(
        BULL_PROMPT.format(
            ticker=ticker,
            timing_scores=format_scores(timing_scores),
            fundamental_check=str(fundamental)
        ),
        response_format="json"
    )
    bull = safe_parse_json(bull_response)

    # Bear 发言
    bear_response = await llm.chat(
        BEAR_PROMPT.format(
            ticker=ticker,
            timing_scores=format_scores(timing_scores),
            fundamental_check=str(fundamental),
            bull_args=str(bull.get("arguments", []))
        ),
        response_format="json"
    )
    bear = safe_parse_json(bear_response)

    # 规则打分（替代 Judge LLM，省 1 次 API 调用）
    bull_score = bull.get("score", 5)
    bear_score = bear.get("score", 5)
    debate_diff = bull_score - bear_score

    if debate_diff > 3:
        debate_signal = 1.0
    elif debate_diff < -3:
        debate_signal = -1.0
    else:
        debate_signal = debate_diff / 5.0

    # 融合：60% 技术打分 + 40% 辩论结果
    tech_score = timing_scores.get("composite", 0)
    final_score = 0.6 * tech_score + 0.4 * debate_signal

    return {
        "bull": bull,
        "bear": bear,
        "debate_signal": round(debate_signal, 2),
        "tech_score": round(tech_score, 4),
        "final_score": round(final_score, 4),
        "signal": score_to_signal(final_score),
    }


def score_to_signal(score: float) -> str:
    if score >= 0.33:
        return "BUY"
    elif score <= -0.33:
        return "SELL"
    else:
        return "HOLD"


def format_scores(scores: dict) -> str:
    lines = []
    for k, v in scores.items():
        if k in ("composite", "signal"):
            continue
        bar = "+" * max(0, int(v * 5)) + "-" * max(0, int(-v * 5))
        lines.append(f"  {k}: {v:+.2f} [{bar}]")
    lines.append(f"\n  综合得分: {scores.get('composite', 0):+.4f}")
    lines.append(f"  技术信号: {scores.get('signal', 'N/A')}")
    return "\n".join(lines)


def safe_parse_json(text: str) -> dict:
    import json
    try:
        clean = text.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[1].rsplit("```", 1)[0]
        return json.loads(clean)
    except (json.JSONDecodeError, IndexError):
        return {"error": "parse_failed", "raw": text[:300]}
```

### 3.4 主入口

```python
# main.py
"""
主入口 — 整个系统 < 100 行

用法：
  python main.py 600519              # 分析贵州茅台
  python main.py 600519 000858 AAPL  # 批量分析
  python main.py --pick 600519       # 仅选股检查
  python main.py --time 600519       # 仅择时打分
"""
import asyncio
import sys
import os
from dotenv import load_dotenv

load_dotenv()

from data.fetcher import fetch_stock_data, fetch_fundamental
from data.indicators import TimingScorer
from agents.debate import run_debate
from agents.stock_picker import run_fundamental_check
from signal.output import format_report, push_notification
from config import get_llm_client


async def analyze_one(ticker: str, mode: str = "full") -> dict:
    """分析单只股票"""
    llm = get_llm_client()

    # 1. 获取数据
    history = fetch_stock_data(ticker, days=250)
    if not history:
        return {"ticker": ticker, "error": "数据获取失败"}

    result = {"ticker": ticker}

    # 2. 择时打分（10 维度）
    if mode in ("full", "time"):
        scorer = TimingScorer(history)
        result["timing"] = scorer.score_all()

    # 3. 选股检查（基本面）
    if mode in ("full", "pick"):
        fundamental = fetch_fundamental(ticker)
        result["fundamental"] = await run_fundamental_check(
            ticker, fundamental, llm
        )

    # 4. Bull/Bear 辩论（仅 full 模式）
    if mode == "full":
        result["debate"] = await run_debate(
            ticker,
            result.get("timing", {}),
            result.get("fundamental", {}),
            llm
        )
        result["signal"] = result["debate"]["signal"]
        result["score"] = result["debate"]["final_score"]

    return result


async def main():
    args = sys.argv[1:]

    mode = "full"
    if "--pick" in args:
        mode = "pick"
        args.remove("--pick")
    elif "--time" in args:
        mode = "time"
        args.remove("--time")

    tickers = args or os.getenv("STOCK_LIST", "600519").split(",")
    tickers = [t.strip() for t in tickers if t.strip()]

    results = []
    for ticker in tickers:
        print(f"分析 {ticker}...")
        result = await analyze_one(ticker, mode)
        results.append(result)
        report = format_report(result)
        print(report)
        print("---")

    # 推送
    if os.getenv("WECHAT_WEBHOOK_URL") or os.getenv("TELEGRAM_BOT_TOKEN"):
        for r in results:
            push_notification(format_report(r))


if __name__ == "__main__":
    asyncio.run(main())
```

---

## 四、输出格式

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 600519 贵州茅台 择时信号

📊 10 维度技术打分
  均线排列:    +0.67 [+++]     趋势偏多
  创新高比率:  +0.30 [+]       温和偏多
  量价配合:    +0.45 [++]      量价齐升
  换手率波动:  +0.00 []        正常
  MACD 强度:   +0.52 [++]      金叉放大
  RSI 位置:    -0.20 [-]       中性偏高
  布林带位置:  -0.35 [-]       接近上轨
  ATR 变化:    +0.10 []        波动平稳
  北向资金:    +0.40 [++]      持续流入
  主力资金:    +0.25 [+]       小幅净流入

  综合得分: +0.2840
  技术信号: HOLD（接近 BUY 阈值 0.33）

⚔️ 多空辩论
  🐂 看多（7/10）：均线多头排列完好，MACD 金叉持续放大，
     北向资金连续 5 日净流入，基本面 ROE 超 30%
  🐻 看空（4/10）：RSI 接近 60 非超卖区域，布林带上轨
     压力，短期乖离率偏高，需等待回踩确认

  辩论差: +3 → 偏多
  最终得分: 0.6×0.28 + 0.4×0.60 = +0.41
  ✅ 信号: BUY

📋 操作建议
  ⚠️ 不追高：等待回踩 MA10 附近再介入
  🎯 参考区间：回踩至 [MA10, MA20] 区间可考虑
  🛑 风控：跌破 MA60 减仓

⚠️ 以上仅为技术分析工具输出，不构成投资建议
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 五、与完整版 TradingAgents-CN 的对比

| 维度 | TradingAgents-CN 完整版 | 本方案（择时精简版） |
|------|----------------------|-------------------|
| 智能体数量 | 7 个 | 3 个 |
| 分析阶段 | 5 阶段 | 2 阶段（打分 + 辩论） |
| LLM 调用次数/股 | 10-15 次 | 2-3 次 |
| Token 成本/股 | ~50k tokens | ~15k tokens |
| 依赖项 | 20+ | 5 个 |
| 基础设施 | MongoDB + Redis + Docker | 纯 Python，无数据库 |
| 部署复杂度 | 高（多容器编排） | 极低（单文件运行） |
| 启动时间 | 5-15 分钟 | 30 秒 |
| 分析耗时/股 | 2-5 分钟 | 30-60 秒 |
| 择时精度 | 中（未专门优化） | 高（10 维度专业打分） |
| 选股深度 | 高（多维度） | 中（安全边际门槛检查） |
| 新闻/舆情 | 有 | 无（择时不需要） |
| Web 界面 | 有（Vue 3） | 无（命令行 + 推送） |

---

## 六、开发路线

### 用 Claude Code 开发（3-5 天）

**Day 1：数据层 + 技术指标**
```
> 实现 data/fetcher.py 和 data/indicators.py
  fetcher 用 AkShare 获取 A 股日线数据
  indicators 实现 TimingScorer 的 10 个维度
  写 pytest 测试验证每个指标的计算正确性
```

**Day 2：辩论引擎**
```
> 实现 agents/debate.py
  Bull/Bear 各一个 Prompt
  规则打分替代 Judge LLM
  60/40 加权融合技术打分和辩论结果
  mock LLM 写测试
```

**Day 3：选股 + 主入口 + 输出**
```
> 实现 agents/stock_picker.py + main.py + signal/output.py
  选股是 5 项基本面门槛检查
  输出格式化为 Markdown
  推送到企微/TG
```

**Day 4：GitHub Actions + 端到端测试**
```
> 实现 .github/workflows/daily.yml
  用 600519 做完整端到端测试
  确认推送格式正确
```

**Day 5：调优**
```
> 用 10 只不同特征的股票测试：
  - 趋势股（如科技龙头）
  - 震荡股（如银行股）
  - 超跌股（近期大幅回调）
  检查 10 维度打分是否合理
  调整权重和阈值
```

---

## CLAUDE.md

```markdown
# Timing Agent — 择时精简版

## 概述
聚焦选股+择时的简化多智能体系统。
10 维度技术打分 + Bull/Bear 辩论 = 交易信号。

## 技术栈
Python 3.11, AkShare, LiteLLM, pytest

## 常用命令
python main.py 600519           # 完整分析
python main.py --time 600519    # 仅择时
python main.py --pick 600519    # 仅选股
pytest tests/ -v                # 测试

## 核心规则
- 每个技术指标输出 [-1, +1] 标准化分数
- 综合得分 >= 0.33 → BUY，<= -0.33 → SELL
- Bull/Bear 只做 1 轮，用规则替代 Judge（省 token）
- 最终信号 = 0.6 × 技术打分 + 0.4 × 辩论结果
- 所有 JSON 解析必须有 safe_parse 保护
- 所有输出附带"不构成投资建议"声明
```

---

> ⚠️ 以上内容仅为技术分析工具设计，不构成任何投资建议。
> 股市有风险，投资需谨慎。
