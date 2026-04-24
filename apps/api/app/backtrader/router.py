"""
BackTrader 回测 API 路由
"""

import logging
from typing import Optional

from fastapi import APIRouter, Query, Depends

from .engine import run_multi_strategy_backtest, INITIAL_CASH, COMMISSION
from ..core.logging import logger

router = APIRouter(prefix="/api/backtrader", tags=["backtrader"])


@router.get("/multi-strategy")
async def multi_strategy_backtest(
    ticker: str = Query(..., description="股票代码，如 000001"),
    days: int = Query(1825, description="回测天数，默认5年(1825天)"),
    cash: float = Query(INITIAL_CASH, description="起始资金"),
    commission: float = Query(COMMISSION, description="交易佣金"),
) -> dict:
    """
    多策略并发回测

    同时运行4个策略（SMA交叉/布林突破/MACD金叉/RSI超买），
    返回每日资金曲线与多基准（沪深300/中证1000/国证2000）对比数据。
    """
    logger.info(f"多策略回测请求: {ticker}, {days}天, 资金={cash:.0f}")

    result = await run_multi_strategy_backtest(
        stock_code=ticker,
        days=days,
        cash=cash,
        commission=commission,
    )

    if result is None:
        return {"ticker": ticker, "error": "回测失败，数据获取异常"}

    return {"ticker": ticker, **result}
