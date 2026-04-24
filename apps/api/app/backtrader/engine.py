"""
BackTrader 回测引擎模块
基于 AKShare + BackTrader 的股票回测框架
支持：多策略并发回测、每日资金曲线、多基准收益曲线（沪深300/中证1000/国证2000）
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np
import pandas as pd
import backtrader as bt
import akshare as ak

from .strategy import Strategy1, Strategy2, Strategy3, Strategy4

logger = logging.getLogger(__name__)

# ============== 配置参数 ==============
INITIAL_CASH = 1_000_000
COMMISSION = 0.0003
STAMP_TAX = 0.001

BENCHMARK_CODES = {
    "沪深300": "sh000300",
    "中证1000": "sh000852",
    "国证2000": "sz399303",
}

# 策略元信息映射
STRATEGY_META = {
    "策略1": (Strategy1, "SMA交叉", "20日SMA均线交叉，价格上穿做多下穿平仓"),
    "策略2": (Strategy2, "布林突破", "突破布林上轨开仓，回到上轨内平仓"),
    "策略3": (Strategy3, "MACD金叉", "MACD金叉开仓，死叉平仓"),
    "策略4": (Strategy4, "RSI超买", "RSI突破超买线开仓，回落平仓"),
}


def get_last_trading_day() -> str:
    """获取上一个交易日（跳过周末）"""
    today = datetime.now()
    days_back = 1 if today.weekday() >= 1 else 3
    return (today - timedelta(days=days_back)).strftime("%Y%m%d")


# ============== 同步数据获取 ==============
def _sync_get_stock_data(
    symbol: str = "000001",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> pd.DataFrame:
    """获取股票数据（后复权）"""
    if not end_date:
        end_date = get_last_trading_day()
    if not start_date:
        start_date = (datetime.now() - timedelta(days=365 * 5)).strftime("%Y%m%d")

    logger.info(f"获取股票数据: {symbol}, {start_date} - {end_date}")

    try:
        symbol_with_prefix = f"sh{symbol}" if symbol.startswith("6") else f"sz{symbol}"
        df = ak.stock_zh_a_hist_tx(
            symbol=symbol_with_prefix,
            start_date=start_date,
            end_date=end_date,
            adjust="hfq",
        )
    except Exception as e:
        raise RuntimeError(f"获取股票数据失败 [{symbol}]: {e}") from e

    if df is None or len(df) == 0:
        raise RuntimeError(f"股票数据为空: {symbol}")

    result = df[["date", "open", "close", "high", "low", "amount"]].copy()
    result.columns = ["date", "open", "close", "high", "low", "volume"]
    result["date"] = pd.to_datetime(result["date"])
    result.set_index("date", inplace=True)
    result.sort_index(inplace=True)
    logger.info(f"股票数据获取完成: {len(result)} 条")
    return result


def _sync_get_index_data(
    symbol: str = "000300",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> pd.DataFrame:
    """获取指数数据"""
    if not end_date:
        end_date = get_last_trading_day()
    if not start_date:
        start_date = (datetime.now() - timedelta(days=365 * 5)).strftime("%Y%m%d")

    logger.info(f"获取指数数据: {symbol}, {start_date} - {end_date}")

    try:
        df = ak.stock_zh_index_daily_tx(symbol=symbol)
    except Exception as e:
        raise RuntimeError(f"获取指数数据失败 [{symbol}]: {e}") from e

    if df is None or len(df) == 0:
        raise RuntimeError(f"指数数据为空: {symbol}")

    result = df[["date", "close"]].copy()
    result["date"] = pd.to_datetime(result["date"])
    result.set_index("date", inplace=True)
    result = result[["close"]]
    result.sort_index(inplace=True)
    result = result.loc[start_date:end_date]
    logger.info(f"指数数据获取完成: {len(result)} 条")
    return result


# ============== 异步数据获取 ==============
async def _async_get_stock_data(
    symbol: str, start_date: Optional[str], end_date: Optional[str],
) -> pd.DataFrame:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _sync_get_stock_data, symbol, start_date, end_date)


async def _async_get_index_data(
    symbol: str, start_date: Optional[str], end_date: Optional[str],
) -> pd.DataFrame:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _sync_get_index_data, symbol, start_date, end_date)


async def fetch_all_data(
    stock_code: str, start_date: Optional[str], end_date: Optional[str],
) -> tuple[pd.DataFrame, dict[str, pd.DataFrame]]:
    """并行获取所有数据（1个股票 + 多个基准）"""
    tasks = [("stock", _async_get_stock_data(stock_code, start_date, end_date))]
    for name, code in BENCHMARK_CODES.items():
        tasks.append((name, _async_get_index_data(code, start_date, end_date)))

    results = await asyncio.gather(*[t for _, t in tasks], return_exceptions=True)

    stock_df = None
    benchmark_dfs = {}
    for (name, _), result in zip(tasks, results):
        if isinstance(result, Exception):
            if name == "stock":
                raise RuntimeError(f"获取股票数据失败: {result}")
            logger.warning(f"获取{name}数据失败: {result}")
        elif name == "stock":
            stock_df = result
        else:
            benchmark_dfs[name] = result

    return stock_df, benchmark_dfs


# ============== 回测引擎 ==============
class BackTestResult:
    """回测结果容器"""
    def __init__(self):
        self.portfolio_values: list[float] = []
        self.benchmark_values: dict[str, list[float]] = {}
        self.dates: list = []
        self.initial_cash = INITIAL_CASH
        self.final_value = 0.0
        self.total_return = 0.0

    def add_day(self, date, portfolio_value, benchmark_values: dict):
        self.dates.append(date)
        self.portfolio_values.append(portfolio_value)
        for name, value in benchmark_values.items():
            if name not in self.benchmark_values:
                self.benchmark_values[name] = []
            self.benchmark_values[name].append(value)


class BackTestEngine:
    """回测引擎"""
    def __init__(self):
        self.cerebro = bt.Cerebro()
        self.result = BackTestResult()

    def add_data(self, stock_df: pd.DataFrame, benchmark_dfs: dict):
        data_feed = bt.feeds.PandasData(dataname=stock_df)
        self.cerebro.adddata(data_feed, name="stock")
        self.benchmark_dfs = benchmark_dfs

    def run(self, strategy_class=Strategy1, cash: float = INITIAL_CASH, commission: float = COMMISSION):
        self.result.initial_cash = cash
        self.cerebro.addstrategy(
            strategy_class,
            result_container=self.result,
            benchmark_dfs=self.benchmark_dfs,
        )
        self.cerebro.broker.setcash(cash)
        self.cerebro.broker.setcommission(commission=commission)
        self.cerebro.run()
        self.final_value = self.cerebro.broker.getvalue()
        self.result.final_value = self.final_value
        return self.final_value

    def get_result(self) -> BackTestResult:
        return self.result


def _run_single_strategy(
    stock_df: pd.DataFrame,
    benchmark_dfs: dict,
    strategy_class,
    cash: float = INITIAL_CASH,
    commission: float = COMMISSION,
) -> BackTestResult:
    """在线程中运行单个策略回测"""
    engine = BackTestEngine()
    engine.add_data(stock_df, benchmark_dfs)
    engine.run(strategy_class=strategy_class, cash=cash, commission=commission)
    return engine.get_result()


# ============== 指标计算 ==============
def calculate_multi_strategy_metrics(results: dict[str, BackTestResult]) -> dict:
    """计算多策略回测指标"""
    max_len = max(len(r.dates) for r in results.values())
    first_result = list(results.values())[0]
    dates = first_result.dates

    strategy_returns = {}
    strategy_final = {}
    for name, result in results.items():
        portfolio = np.array(result.portfolio_values)
        if len(portfolio) < max_len:
            portfolio = np.pad(portfolio, (0, max_len - len(portfolio)), mode="edge")
        strategy_returns[name] = (portfolio - portfolio[0]) / portfolio[0] * 100
        strategy_final[name] = float((portfolio[-1] - portfolio[0]) / portfolio[0] * 100)

    benchmark_returns = {}
    benchmark_final = {}
    for bench_name, values in first_result.benchmark_values.items():
        bench = np.array(values)
        if len(bench) < max_len:
            bench = np.pad(bench, (0, max_len - len(bench)), mode="edge")
        if len(bench) > 0 and bench[0] != 0:
            benchmark_returns[bench_name] = (bench - bench[0]) / bench[0] * 100
            benchmark_final[bench_name] = float((bench[-1] - bench[0]) / bench[0] * 100)
        else:
            benchmark_returns[bench_name] = np.zeros(max_len)
            benchmark_final[bench_name] = 0.0

    if len(dates) < max_len:
        last_date = dates[-1] if dates else None
        dates = dates + [last_date] * (max_len - len(dates))

    return {
        "dates": dates,
        "strategy_returns": strategy_returns,
        "benchmark_returns": benchmark_returns,
        "strategy_final": strategy_final,
        "benchmark_final": benchmark_final,
    }


# ============== 主入口 ==============
async def run_multi_strategy_backtest(
    stock_code: str = "000001",
    days: int = 365 * 5,
    cash: float = INITIAL_CASH,
    commission: float = COMMISSION,
    end_date: Optional[str] = None,
) -> Optional[dict]:
    """
    并发运行所有策略回测，返回 JSON 结果。

    Args:
        stock_code: 股票代码
        days: 回测天数（从 end_date 往前推）
        cash: 起始资金
        commission: 交易佣金
        end_date: 结束日期 "YYYYMMDD"

    Returns:
        dict 或 None（失败时）
    """
    if not end_date:
        end_date = get_last_trading_day()
    start_date = (datetime.now() - timedelta(days=days)).strftime("%Y%m%d")

    logger.info(f"多策略回测: {stock_code}, {start_date} - {end_date}, 资金={cash:.0f}")

    # 并发获取数据
    try:
        stock_df, benchmark_dfs = await fetch_all_data(stock_code, start_date, end_date)
    except RuntimeError as e:
        logger.error(f"数据获取失败: {e}")
        return None

    if not benchmark_dfs:
        logger.error("没有可用的基准数据")
        return None

    # 取时间交集
    common_dates = stock_df.index
    for df in benchmark_dfs.values():
        common_dates = common_dates.intersection(df.index)
    stock_df = stock_df.loc[common_dates]
    for name in benchmark_dfs:
        benchmark_dfs[name] = benchmark_dfs[name].loc[common_dates]

    if len(stock_df) == 0:
        logger.error("没有可用数据（时间交集为空）")
        return None

    # 线程池并发运行策略
    results: dict[str, BackTestResult] = {}
    with ThreadPoolExecutor(max_workers=4) as executor:
        future_to_name = {
            executor.submit(
                _run_single_strategy, stock_df, benchmark_dfs, cls, cash, commission
            ): name
            for name, (cls, _, _) in STRATEGY_META.items()
        }
        for future in as_completed(future_to_name):
            name = future_to_name[future]
            try:
                results[name] = future.result()
                logger.info(f"策略 {name} 完成")
            except Exception as e:
                logger.error(f"策略 {name} 失败: {e}")

    if not results:
        logger.error("所有策略均失败")
        return None

    metrics = calculate_multi_strategy_metrics(results)

    # 组装 JSON
    json_result = {
        "date": [str(d) for d in metrics["dates"]],
        "strategies": [
            {
                "name": name,
                "short_name": STRATEGY_META[name][1],
                "description": STRATEGY_META[name][2],
                "returns": metrics["strategy_returns"][name].tolist(),
                "final_return": metrics["strategy_final"][name],
            }
            for name in STRATEGY_META
            if name in results
        ],
    }
    for name, values in metrics["benchmark_returns"].items():
        json_result[name] = values.tolist()

    logger.info(f"回测完成: {stock_code}, 共 {len(json_result['strategies'])} 个策略")
    return json_result
