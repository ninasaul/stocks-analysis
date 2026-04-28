"""交易相关的 API 路由"""
from fastapi import APIRouter, Query, Depends

from ..data.fetcher import fetch_stock_data
from ..core.logging import logger
from ..reflection.reflector import Reflector
from ..reflection.memory import SimpleMemory
from ..trading.manager import TradingManager
from ..trading.strategy import TradingStrategy
from ..user_management.models import User
from ..core.auth import get_current_user
from ..services.llm_service import LLMService

router = APIRouter(prefix="/api", tags=["交易"])

trading_manager = TradingManager()
trading_strategy = TradingStrategy(trading_manager)
reflector_memory = SimpleMemory()


@router.get("/trade")
async def execute_trade(
    ticker: str = Query(..., description="股票代码"),
    quantity: int = Query(100, description="交易数量"),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    执行交易

    Args:
        ticker: 股票代码
        quantity: 交易数量

    Returns:
        交易结果
    """
    logger.info(f"用户 {current_user.id} ({current_user.username}) 执行交易: {ticker} 数量: {quantity}")
    
    # 1. 获取最新收盘价
    history = fetch_stock_data(ticker, days=1)
    if not history:
        return {"ticker": ticker, "error": "数据获取失败"}
    
    # 假设最新数据是最后一条
    latest_data = history[-1]
    price = latest_data["close"]
    
    # 2. 获取股票分析信号（简化版本，直接使用HOLD信号）
    signal = "HOLD"  # 默认信号，实际应用中应该调用分析接口
    
    # 3. 执行交易
    trade_result = trading_strategy.execute_trade(ticker, signal, price, quantity)
    
    # 4. 如果交易成功且不是 HOLD，进行反思
    if trade_result["success"] and signal != "HOLD":
        try:
            llm = LLMService.get_user_default_client(current_user.id)
        except ValueError:
            raise HTTPException(status_code=503, detail="LLM服务不可用")
        reflector = Reflector(llm)
        
        trade_data = {
            "ticker": ticker,
            "action": "buy" if signal == "BUY" else "sell",
            "signal": signal,
            "price": price,
            "quantity": quantity,
            "profit": trade_result.get("profit", 0),
            "timestamp": latest_data["date"]
        }
        
        reflection = await reflector.reflect_on_trade(trade_data)
        trade_result["reflection"] = reflection
        
        # 存储到内存
        reflector_memory.add_situations([
            (f"交易 {ticker}", reflection)
        ])
    
    return {
        "ticker": ticker,
        "signal": signal,
        "price": price,
        "trade_result": trade_result
    }


@router.get("/portfolio")
def get_portfolio(current_user: User = Depends(get_current_user)) -> dict:
    """
    获取投资组合

    Returns:
        投资组合信息
    """
    logger.info(f"用户 {current_user.id} ({current_user.username}) 获取投资组合")
    return trading_manager.get_portfolio()


@router.get("/transactions")
def get_transactions(current_user: User = Depends(get_current_user)) -> dict:
    """
    获取交易记录

    Returns:
        交易记录
    """
    logger.info(f"用户 {current_user.id} ({current_user.username}) 获取交易记录")
    return {
        "transactions": trading_manager.get_transactions()
    }


@router.get("/trade/reflect")
async def reflect_on_trade(
    ticker: str = Query(..., description="股票代码"),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    对交易结果进行反思

    Args:
        ticker: 股票代码

    Returns:
        反思结果
    """
    logger.info(f"用户 {current_user.id} ({current_user.username}) 对交易进行反思: {ticker}")
    # 获取最新交易记录
    transactions = trading_manager.get_transactions()
    ticker_transactions = [tx for tx in transactions if tx["ticker"] == ticker]
    
    if not ticker_transactions:
        return {"ticker": ticker, "error": "没有找到交易记录"}
    
    # 获取最新的交易记录
    latest_transaction = ticker_transactions[-1]
    
    # 执行反思
    try:
        llm = LLMService.get_user_default_client(current_user.id)
    except ValueError:
        raise HTTPException(status_code=503, detail="LLM服务不可用")
    reflector = Reflector(llm)
    
    trade_data = {
        "ticker": ticker,
        "action": latest_transaction["action"],
        "signal": "BUY" if latest_transaction["action"] == "buy" else "SELL",
        "price": latest_transaction["price"],
        "quantity": latest_transaction["quantity"],
        "profit": latest_transaction.get("profit", 0),
        "timestamp": latest_transaction["timestamp"]
    }
    
    reflection = await reflector.reflect_on_trade(trade_data)
    
    # 存储到内存
    reflector_memory.add_situations([
        (f"交易反思 {ticker}", reflection)
    ])
    
    return {
        "ticker": ticker,
        "transaction": latest_transaction,
        "reflection": reflection
    }