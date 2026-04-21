from fastapi import FastAPI, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
import asyncio
from typing import Optional
import json
import aiohttp

from .data.fetcher import fetch_stock_data, fetch_fundamental
from .data.indicators import TimingScorer
from .agents.stock_picker import run_fundamental_check
from .agents.timer import TimerAgent
from .agents.debate import run_debate
from .signals.output import format_report, push_notification
from .core.config import get_llm_client, config
from .core.stock_service import StockService
from .core.logging import logger
from .reflection.reflector import Reflector
from .reflection.memory import SimpleMemory
from .trading.manager import TradingManager
from .trading.strategy import TradingStrategy
from .dialogue.manager import dialogue_manager
from .user_management import init_db
from .user_management.routes import router as user_management_router
from .user_management.models import User
from .user_management.services import MembershipService
from .core.database import db_manager, execute_query, execute_insert, execute_update
from .core.scheduler import scheduler_manager
from .core.auth_routes import router as auth_router
from .core.wechat_routes import router as wechat_router
from .core.auth import get_current_user
# 添加SSE端点用于流式响应
from fastapi.responses import StreamingResponse

app = FastAPI(title=config.APP_NAME, version=config.APP_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 初始化数据库
@app.on_event("startup")
async def startup_event():
    """应用启动时的初始化"""
    init_db()
    scheduler_manager.start()
    logger.info("数据库连接已初始化")

@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭时的清理"""
    db_manager.close()
    scheduler_manager.shutdown()
    logger.info("数据库连接已关闭")

# 注册路由
app.include_router(auth_router)
app.include_router(wechat_router)
app.include_router(user_management_router)

# 全局实例
timer_agent = TimerAgent()
reflector_memory = SimpleMemory()
trading_manager = TradingManager()
trading_strategy = TradingStrategy(trading_manager)
stock_service = StockService()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/analyze")
async def analyze_stock(
    ticker: str = Query(..., description="股票代码"),
    mode: str = Query("full", description="分析模式: full, time, pick"),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    分析股票

    Args:
        ticker: 股票代码
        mode: 分析模式，full（完整分析）、time（仅择时）、pick（仅选股）

    Returns:
        分析结果
    """
    logger.info(f"用户 {current_user.id} ({current_user.username}) 分析股票: {ticker}")
    stock_name = stock_service.get_stock_name(ticker)
    logger.info(f"开始分析股票: {ticker} {stock_name}, 模式: {mode}")

    # 检查用户剩余调用次数
    passed, error_msg = MembershipService.check_api_call_limit(current_user.id)
    if not passed:
        logger.warning(f"用户 {current_user.id} {error_msg}")
        return {"error": error_msg}

    llm = get_llm_client()
    logger.debug(f"LLM 客户端初始化完成")

    # 1. 获取数据
    logger.debug(f"获取股票 {ticker} 的历史数据")
    history = fetch_stock_data(ticker, days=config.MAX_INDICATOR_DAYS, buffer_days=60)
    if not history:
        logger.error(f"数据获取失败: {ticker}")
        return {"ticker": ticker, "error": "数据获取失败"}

    result = {"ticker": ticker}
    result["name"] = stock_name
    
    # 添加最新数据日期
    if history:
        # 找到最新的日期
        latest_date = max(item["date"] for item in history)
        result["latest_data_date"] = latest_date
    else:
        result["latest_data_date"] = None

    # 2. 择时打分（10 维度）
    if mode in ("full", "time"):
        logger.debug(f"开始择时打分: {ticker}")
        result["timing"] = timer_agent.score(history, ticker)
        logger.info(f"择时打分完成，信号: {result['timing'].get('signal')}")
    
    # 3. 选股检查（基本面）
    if mode in ("full", "pick"):
        logger.debug(f"获取基本面数据: {ticker}")
        fundamental = fetch_fundamental(ticker)
        logger.debug(f"开始基本面检查: {ticker}")
        result["fundamental"] = await run_fundamental_check(
            ticker, fundamental, llm
        )
        logger.info(f"基本面检查完成")

    # 4. Bull/Bear 辩论（仅 full 模式）
    if mode == "full":
        logger.debug(f"开始多空辩论: {ticker}")
        result["debate"] = await run_debate(
            ticker,
            result.get("timing", {}),
            result.get("fundamental", {}),
            llm
        )
        result["signal"] = result["debate"]["signal"]
        result["score"] = result["debate"]["final_score"]
        logger.info(f"多空辩论完成，最终信号: {result['signal']}, 得分: {result['score']}")
        
        # 5. 反思分析
        logger.debug(f"开始反思分析: {ticker}")
        reflector = Reflector(llm)
        reflection = await reflector.reflect_on_decision(result)
        result["reflection"] = reflection
        logger.info(f"反思分析完成")
        
        # 存储到内存
        reflector_memory.add_situations([
            (f"分析 {ticker}", reflection)
        ])
        logger.debug(f"反思结果已存储到内存")
    
    logger.info(f"分析完成: {ticker}")
    
    # 记录API调用
    MembershipService.record_api_call(current_user.id, "/api/analyze", "GET", 200)

    return result


@app.get("/api/report")
async def get_report(
    ticker: str = Query(..., description="股票代码"),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    获取格式化报告

    Args:
        ticker: 股票代码

    Returns:
        包含报告的字典
    """
    stock_name = stock_service.get_stock_name(ticker)
    logger.info(f"开始分析股票: {ticker} {stock_name}, 模式: full")

    llm = get_llm_client()
    logger.debug(f"LLM 客户端初始化完成")

    history = fetch_stock_data(ticker, days=config.MAX_INDICATOR_DAYS, buffer_days=60)
    if not history:
        logger.error(f"数据获取失败: {ticker}")
        return {"ticker": ticker, "error": "数据获取失败"}

    result = {"ticker": ticker}
    result["name"] = stock_name

    if history:
        latest_date = max(item["date"] for item in history)
        result["latest_data_date"] = latest_date
    else:
        result["latest_data_date"] = None

    logger.debug(f"开始择时打分: {ticker}")
    result["timing"] = timer_agent.score(history, ticker)
    logger.info(f"择时打分完成，信号: {result['timing'].get('signal')}")

    logger.debug(f"获取基本面数据: {ticker}")
    fundamental = fetch_fundamental(ticker)
    logger.debug(f"开始基本面检查: {ticker}")
    result["fundamental"] = await run_fundamental_check(
        ticker, fundamental, llm
    )
    logger.info(f"基本面检查完成")

    logger.debug(f"开始多空辩论: {ticker}")
    result["debate"] = await run_debate(
        ticker,
        result.get("timing", {}),
        result.get("fundamental", {}),
        llm
    )
    result["signal"] = result["debate"]["signal"]
    result["score"] = result["debate"]["final_score"]
    logger.info(f"多空辩论完成，最终信号: {result['signal']}, 得分: {result['score']}")

    logger.debug(f"开始反思分析: {ticker}")
    reflector = Reflector(llm)
    reflection = await reflector.reflect_on_decision(result)
    result["reflection"] = reflection
    logger.info(f"反思分析完成")

    reflector_memory.add_situations([
        (f"分析 {ticker}", reflection)
    ])
    logger.debug(f"反思结果已存储到内存")

    logger.info(f"分析完成: {ticker}")

    report = format_report(result)
    push_notification(report)

    return {
        "ticker": ticker,
        "report": report,
        "signal": result.get("signal", "HOLD")
    }


@app.get("/api/history")
def get_history(current_user: User = Depends(get_current_user)) -> dict:
    """
    获取历史分析记录

    Returns:
        历史记录
    """
    logger.info(f"用户 {current_user.id} ({current_user.username}) 获取历史分析记录")
    return {
        "count": len(reflector_memory),
        "message": "历史记录功能开发中"
    }


@app.get("/api/trade")
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
    # 1. 分析股票，获取信号和价格区间
    analysis_result = await analyze_stock(ticker, mode="full")
    signal = analysis_result.get("signal", "HOLD")
    price_range = analysis_result.get("timing", {}).get("price_range", {})
    
    # 2. 获取最新收盘价
    history = fetch_stock_data(ticker, days=1)
    if not history:
        return {"ticker": ticker, "error": "数据获取失败"}
    
    # 假设最新数据是最后一条
    latest_data = history[-1]
    price = latest_data["close"]
    
    # 3. 执行交易
    trade_result = trading_strategy.execute_trade(ticker, signal, price, quantity)
    
    # 4. 如果交易成功且不是 HOLD，进行反思
    if trade_result["success"] and signal != "HOLD":
        llm = get_llm_client()
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
        "price_range": price_range,
        "trade_result": trade_result
    }


@app.get("/api/portfolio")
def get_portfolio(current_user: User = Depends(get_current_user)) -> dict:
    """
    获取投资组合

    Returns:
        投资组合信息
    """
    logger.info(f"用户 {current_user.id} ({current_user.username}) 获取投资组合")
    return trading_manager.get_portfolio()


@app.get("/api/transactions")
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


@app.get("/api/trade/reflect")
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
    llm = get_llm_client()
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


@app.post("/api/dialogue/sync")
async def dialogue_sync(
    message: str = Query(..., description="用户消息"),
    session_id: Optional[str] = Query(None, description="会话ID"),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    选股对话接口 - 同步响应版本

    Args:
        message: 用户消息
        session_id: 会话ID（可选，用于区分不同会话）

    Returns:
        对话响应
    """
    logger.info(f"用户 {current_user.id} ({current_user.username}) 发送同步对话请求: {message[:50]}..., session_id: {session_id}")
    
    # 获取 LLM 响应（对话历史已在 DialogueManager 中存储）
    response = await dialogue_manager.get_response(message, None, session_id)
    
    # 获取对话历史
    history = dialogue_manager.get_history(session_id)
    
    # 获取当前选股条件
    criteria = dialogue_manager.get_criteria()
    
    return {
        "response": response,
        "session_id": session_id or dialogue_manager.current_session_id,
        "history": history,
        "criteria": criteria
    }


@app.delete("/api/dialogue/history")
async def clear_dialogue_history(
    session_id: Optional[str] = Query(None, description="会话ID"),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    清除对话历史

    Args:
        session_id: 会话ID（可选）

    Returns:
        操作结果
    """
    logger.info(f"用户 {current_user.id} ({current_user.username}) 清除对话历史, session_id: {session_id}")
    success = dialogue_manager.clear_history(session_id)
    return {
        "success": success,
        "message": "对话历史已清除" if success else "会话不存在"
    }


@app.get("/api/dialogue/history")
async def get_dialogue_history(
    session_id: Optional[str] = Query(None, description="会话ID"),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    获取对话历史

    Args:
        session_id: 会话ID（可选）

    Returns:
        对话历史
    """
    logger.info(f"用户 {current_user.id} ({current_user.username}) 获取对话历史, session_id: {session_id}")
    history = dialogue_manager.get_history(session_id)
    return {
        "history": history,
        "session_id": session_id or dialogue_manager.current_session_id
    }

@app.post("/api/dialogue/stream")
async def dialogue_stream(
    message: str = Query(..., description="用户消息"),
    session_id: Optional[str] = Query(None, description="会话ID"),
    current_user: User = Depends(get_current_user)
) -> StreamingResponse:
    """
    选股对话接口 - 流式响应版本

    Args:
        message: 用户消息
        session_id: 会话ID（可选，用于区分不同会话）

    Returns:
        流式响应
    """
    logger.info(f"用户 {current_user.id} ({current_user.username}) 发送流式对话请求: {message[:50]}..., session_id: {session_id}")
    
    async def stream_generator():
        async for chunk in dialogue_manager.get_streaming_response(message, None, session_id):
            # 以SSE格式发送数据
            yield f"data: {json.dumps({'chunk': chunk})}\n\n"
    
    return StreamingResponse(
        stream_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
        }
    )
