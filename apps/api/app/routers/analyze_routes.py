"""股票分析相关的 API 路由"""
from datetime import datetime, timezone
from fastapi import APIRouter, Query, Depends, HTTPException, Response
from fastapi.responses import Response
from typing import Optional, List
from pydantic import BaseModel
import json
import os
import asyncio
import uuid

from ..core.stock_service import StockService
from ..core.indicators import TimingScorer
from ..core.task_manager import task_manager, TaskStatus
from ..agents.stock_picker import run_fundamental_check
from ..agents.debate import run_debate
from ..core.config import config
from ..llm.llm_service import LLMService
from ..core.stock_service import StockService
from ..core.logging import logger
from ..analyst.depth_config import (
    AnalysisDepthController,
    normalize_depth,
    get_depth_info,
    AnalystType,
    get_all_depths_info
)
from ..reflection.reflector import Reflector
from ..reflection.memory import SimpleMemory
from ..user_management.models import User
from ..user_management.services import MembershipService
from ..core.auth import get_current_user
from ..core.database import execute_insert
from ..analyst import MarketAnalyst, FundamentalAnalyst, NewsAnalyst

router = APIRouter(prefix="/api", tags=["股票分析"])

reflector_memory = SimpleMemory()
stock_service = None


class AnalyzeRequest(BaseModel):
    ticker: str
    depth: int = 1
    market_analyst: bool = True
    fundamental_analyst: bool = True
    news_analyst: bool = False
    social_analyst: bool = False
    sentiment_analysis: bool = True
    risk_assessment: bool = True


class AnalyzeCreateResponse(BaseModel):
    task_id: str
    record_id: str
    message: str


class AnalyzeStatusResponse(BaseModel):
    task_id: str
    record_id: Optional[str] = None
    status: str
    progress: int
    progress_message: str
    result: Optional[dict] = None
    error: Optional[str] = None


def is_llm_error(error_msg: str) -> bool:
    """检查错误是否是LLM相关的错误"""
    if not error_msg:
        return False
    llm_keywords = [
        "API调用失败", "LLM", "模型", "model", "LLM调用",
        "InternalError", "ServiceUnavailable", "Too many requests",
        "rate limit", "限流", "token", "chat", "openai"
    ]
    return any(keyword.lower() in error_msg.lower() for keyword in llm_keywords)


def save_analysis_result(user_id: int, ticker: str, result: dict, record_id: str = None) -> bool:
    """
    保存分析结果到数据库

    Args:
        user_id: 用户ID
        ticker: 股票代码
        result: 分析结果
        record_id: 分析记录唯一标识UUID

    Returns:
        是否保存成功
    """
    try:
        import json
        from datetime import date, datetime

        analysis_date = date.today()
        created_at = datetime.now()
        analysis_result_json = json.dumps(result, ensure_ascii=False)

        query = """
            INSERT INTO stock_analysis_results
            (user_id, record_id, stock_code, analysis_date, analysis_result, created_at)
            VALUES (%s, %s, %s, %s, %s, %s)
        """

        params = (
            user_id,
            record_id,
            ticker,
            analysis_date,
            analysis_result_json,
            created_at
        )

        execute_insert(query, params)
        logger.info(f"保存分析结果: 用户 {user_id}, 股票 {ticker}, 日期 {analysis_date}, record_id: {record_id}")
        return True
    except Exception as e:
        logger.error(f"保存分析结果失败: {e}")
        return False


async def generate_target_price_and_execution_plan(stock_name: str, ticker: str, price_range: dict, signal: str, fundamental_result: dict, llm, user_id: int = None, preset_id: int = None, user_config_id: int = None) -> tuple:
    """
    生成目标价格分析和执行计划
    
    Args:
        stock_name: 股票名称
        ticker: 股票代码
        price_range: 价格区间数据
        signal: 交易信号
        fundamental_result: 基本面分析结果
        llm: LLM客户端
        user_id: 用户ID（用于记录使用量）
        preset_id: 预设ID（用于记录使用量）
        user_config_id: 用户配置ID（用于记录使用量）
    
    Returns:
        目标价格分析、执行计划、错误信息和token消耗的元组
    """
    target_price_analysis = []
    execution_plan = {}
    error = None
    error_detail = None
    total_tokens = 0
    
    try:
        # 准备目标价格分析提示
        target_price_prompt = f"""
        作为一名专业的股票分析师，请根据以下信息为 {stock_name} ({ticker}) 生成目标价格分析：
        
        股票信息：
        - 名称：{stock_name}
        - 代码：{ticker}
        - 当前价格：{price_range.get('current_price', 'N/A')}
        
        技术分析结果：
        - 信号：{signal}
        - 布林带：{price_range.get('bollinger', 'N/A')}
        - 移动平均线：{price_range.get('ma', 'N/A')}
        - 最佳买入价格：{price_range.get('buy_range', {}).get('best_buy_price', 'N/A')}
        - 次优买入价格：{price_range.get('buy_range', {}).get('secondary_buy_price', 'N/A')}
        - 止损位：{price_range.get('buy_range', {}).get('stop_loss', 'N/A')}
        - 止盈位：{price_range.get('buy_range', {}).get('take_profit', 'N/A')}
        
        基本面分析结果：
        {fundamental_result}
        
        请生成未来1个月、3个月和6个月的目标价格分析，每个分析应包含：
        - target_price_range：目标价格区间，格式为["最低价格", "最高价格"]
        - target_price：建议目标价格
        - logic：分析逻辑
        - time_horizon：时间范围（1个月、3个月或6个月）
        
        请以JSON格式返回，结构为：
        [
            {{"target_price_range": ["价格1", "价格2"], "target_price": "价格", "logic": "分析逻辑", "time_horizon": "1个月"}},
            {{"target_price_range": ["价格1", "价格2"], "target_price": "价格", "logic": "分析逻辑", "time_horizon": "3个月"}},
            {{"target_price_range": ["价格1", "价格2"], "target_price": "价格", "logic": "分析逻辑", "time_horizon": "6个月"}}
        ]
        """
        
        # 异步调用LLM生成目标价格分析
        target_price_response, target_price_tokens = await LLMService.wrap_chat(
            llm_client=llm,
            user_id=user_id,
            prompt=target_price_prompt,
            response_format="json",
            preset_id=preset_id,
            user_config_id=user_config_id
        )
        total_tokens += target_price_tokens.get('total_tokens', 0)
        target_price_analysis = json.loads(target_price_response)
        
        # 准备执行计划提示
        execution_plan_prompt = f"""
        作为一名专业的股票交易策略师，请根据以下信息为 {stock_name} ({ticker}) 生成执行计划：
        
        股票信息：
        - 名称：{stock_name}
        - 代码：{ticker}
        - 当前价格：{price_range.get('current_price', 'N/A')}
        
        技术分析结果：
        - 信号：{signal}
        - 布林带：{price_range.get('bollinger', 'N/A')}
        - 移动平均线：{price_range.get('ma', 'N/A')}
        
        买入区间分析：
        - 最佳买入价格：{price_range.get('buy_range', {}).get('best_buy_price', 'N/A')}（依据：{price_range.get('buy_range', {}).get('best_buy_reason', 'N/A')}）
        - 次优买入价格：{price_range.get('buy_range', {}).get('secondary_buy_price', 'N/A')}（依据：{price_range.get('buy_range', {}).get('secondary_buy_reason', 'N/A')}）
        - 止损位：{price_range.get('buy_range', {}).get('stop_loss', 'N/A')}（依据：{price_range.get('buy_range', {}).get('stop_loss_reason', 'N/A')}）
        - 止盈位：{price_range.get('buy_range', {}).get('take_profit', 'N/A')}（依据：{price_range.get('buy_range', {}).get('take_profit_reason', 'N/A')}）
        
        卖出区间分析：
        - 最佳卖出价格：{price_range.get('sell_range', {}).get('best_sell_price', 'N/A')}（依据：{price_range.get('sell_range', {}).get('best_sell_reason', 'N/A')}）
        - 次优卖出价格：{price_range.get('sell_range', {}).get('secondary_sell_price', 'N/A')}（依据：{price_range.get('sell_range', {}).get('secondary_sell_reason', 'N/A')}）
        - 止损位：{price_range.get('sell_range', {}).get('stop_loss', 'N/A')}（依据：{price_range.get('sell_range', {}).get('stop_loss_reason', 'N/A')}）
        - 止盈位：{price_range.get('sell_range', {}).get('take_profit', 'N/A')}（依据：{price_range.get('sell_range', {}).get('take_profit_reason', 'N/A')}）
        
        目标价格分析：
        {target_price_analysis}
        
        请生成详细的执行计划，包含：
        - focus_price_range：关注价格区间
        - risk_price：风险价格
        - monitor_target_price：监控目标价格
        - risk_exposure：风险敞口建议
        - invalid_trigger：计划失效触发条件
        
        请以JSON格式返回，结构为：
        {{
            "focus_price_range": "关注价格区间",
            "risk_price": "风险价格",
            "monitor_target_price": "监控目标价格",
            "risk_exposure": "风险敞口建议",
            "invalid_trigger": "计划失效触发条件"
        }}
        """
        
        # 异步调用LLM生成执行计划
        execution_plan_response, execution_plan_tokens = await LLMService.wrap_chat(
            llm_client=llm,
            user_id=user_id,
            prompt=execution_plan_prompt,
            response_format="json",
            preset_id=preset_id,
            user_config_id=user_config_id
        )
        total_tokens += execution_plan_tokens.get('total_tokens', 0)
        execution_plan = json.loads(execution_plan_response)
    except Exception as e:
        error_msg = f"生成目标价格分析和执行计划失败: {str(e)}"
        logger.error(f"生成目标价格分析和执行计划失败: {str(e)}")
        error = error_msg
        error_detail = str(e)
    
    return target_price_analysis, execution_plan, error, error_detail, total_tokens


async def run_analysis_background(task_id: str, user_id: int, params: dict):
    """后台执行股票分析任务"""
    global stock_service
    
    try:
        task_manager.update_task_status(task_id, TaskStatus.PROCESSING)
        task_manager.update_task_progress(task_id, 5, "正在初始化服务...")
        
        if stock_service is None:
            stock_service = StockService()
        
        ticker = params.get("ticker")
        depth = params.get("depth", 1)
        record_id = params.get("record_id")
        market_analyst_enabled = params.get("market_analyst", True)
        fundamental_analyst_enabled = params.get("fundamental_analyst", True)
        news_analyst_enabled = params.get("news_analyst", False)
        sentiment_analysis = params.get("sentiment_analysis", True)
        risk_assessment = params.get("risk_assessment", True)
        
        stock_name = stock_service.get_stock_name(ticker)
        
        depth_controller = AnalysisDepthController(depth)
        
        task_manager.update_task_progress(task_id, 10, "正在获取股票历史数据...")
        data_days = depth_controller.data_days
        buffer_days = data_days + 30
        history = stock_service.fetch_stock_data(ticker, days=data_days, buffer_days=buffer_days)
        if not history:
            task_manager.fail_task(task_id, "历史数据获取失败")
            return
        
        task_manager.update_task_progress(task_id, 20, "正在检查API调用限制...")
        check_passed, error_msg = MembershipService.check_api_call_limit(user_id)
        if not check_passed:
            task_manager.fail_task(task_id, error_msg)
            return
        
        task_manager.update_task_progress(task_id, 25, "正在获取LLM服务...")
        llm = LLMService.get_user_default_client(user_id)
        user_preference = LLMService.get_user_preference(user_id)
        preset_id = user_preference.preset_id if user_preference else None
        user_config_id = user_preference.user_config_id if user_preference else None
        
        token_usage = {
            "market_analyst": 0,
            "fundamental_analyst": 0,
            "news_analyst": 0,
            "debate": 0,
            "reflection": 0,
            "target_price": 0,
            "total": 0
        }
        
        market_result = {}
        fundamental_result = {}
        news_result = {}
        market_error = None
        fundamental_error = None
        
        async def run_market_analyst():
            nonlocal market_result, market_error
            if not market_analyst_enabled:
                return {}, 0, None
            try:
                ma = MarketAnalyst()
                result, tokens = await ma.analyze(
                    ticker, stock_name, history, depth, llm, 
                    user_id=user_id, preset_id=preset_id, user_config_id=user_config_id
                )
                if "error" in result:
                    error = result["error"]
                    if is_llm_error(error):
                        raise Exception(f"LLM模型服务不可用: {error}")
                    return result, tokens, error
                logger.info(f"市场分析师完成: {ticker}, 信号: {result.get('signal', 'N/A')}, token消耗: {tokens}")
                return result, tokens, None
            except HTTPException:
                raise
            except Exception as e:
                error = f"市场分析失败: {str(e)}"
                logger.error(f"市场分析师错误: {error}")
                if is_llm_error(str(e)):
                    raise Exception(f"LLM模型服务不可用: {str(e)}")
                return {}, 0, error
        
        async def run_fundamental_analyst():
            nonlocal fundamental_result, fundamental_error
            if not fundamental_analyst_enabled:
                return {}, 0, None
            try:
                fa = FundamentalAnalyst()
                result, tokens = await fa.analyze(
                    ticker, stock_name, depth, llm, risk_assessment, 
                    user_id=user_id, preset_id=preset_id, user_config_id=user_config_id
                )
                if "error" in result:
                    error = result["error"]
                    if is_llm_error(error):
                        raise Exception(f"LLM模型服务不可用: {error}")
                    return result, tokens, error
                logger.info(f"基本面分析师完成: {ticker}, token消耗: {tokens}")
                return result, tokens, None
            except HTTPException:
                raise
            except Exception as e:
                error = f"基本面分析失败: {str(e)}"
                logger.error(f"基本面分析师错误: {error}")
                if is_llm_error(str(e)):
                    raise Exception(f"LLM模型服务不可用: {str(e)}")
                return {}, 0, error
        
        async def run_news_analyst():
            nonlocal news_result
            if not news_analyst_enabled:
                return {}, 0, None
            try:
                logger.debug(f"启动新闻分析师: {ticker}")
                na = NewsAnalyst()
                result, tokens = await na.analyze(
                    ticker, stock_name, depth, llm, sentiment_analysis, 
                    user_id=user_id, preset_id=preset_id, user_config_id=user_config_id
                )
                logger.info(f"新闻分析师完成: {ticker}, 情绪: {result.get('sentiment', 'N/A')}, token消耗: {tokens}")
                return result, tokens, None
            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"新闻分析师错误: {str(e)}")
                if is_llm_error(str(e)):
                    raise Exception(f"LLM模型服务不可用: {str(e)}")
                return {}, 0, None
        
        task_manager.update_task_progress(task_id, 30, "正在并行运行分析师...")
        tasks = [run_market_analyst(), run_fundamental_analyst(), run_news_analyst()]
        results = await asyncio.gather(*tasks)
        
        market_result, market_tokens, market_error = results[0]
        fundamental_result, fundamental_tokens, fundamental_error = results[1]
        news_result, news_tokens, news_error = results[2]
        
        token_usage["market_analyst"] = market_tokens
        token_usage["fundamental_analyst"] = fundamental_tokens
        token_usage["news_analyst"] = news_tokens
        
        market_llm_analysis = market_result.get("llm_analysis", "")
        fundamental_llm_analysis = fundamental_result.get("llm_analysis", "")
        news_llm_analysis = news_result.get("llm_analysis", "")
        
        timing_result = market_result.get("timing_scores", {})
        signal = market_result.get("signal") or "HOLD"
        technical_score = market_result.get("technical_score", 0) or 0
        fundamental_score = fundamental_result.get("score", 0) or 0
        
        if technical_score > 1:
            technical_score = technical_score / 100 * 2 - 1
        if fundamental_score > 1:
            fundamental_score = fundamental_score / 100
        
        technical_score = max(-1, min(1, technical_score))
        fundamental_score = max(0, min(1, fundamental_score))
        composite_score = (technical_score + fundamental_score) / 2
        overall_rating = round((composite_score + 1) * 50, 2)
        
        debate_result = {}
        reflection = {}
        debate_error = None
        reflection_error = None
        final_signal = signal
        final_score = composite_score
        
        if depth >= 2 and (market_analyst_enabled or fundamental_analyst_enabled):
            task_manager.update_task_progress(task_id, 50, "正在进行多空辩论...")
            try:
                analyst_insights = {
                    "market_analysis": market_llm_analysis,
                    "fundamental_analysis": fundamental_llm_analysis,
                    "news_analysis": news_llm_analysis
                }
                debate_result, debate_tokens = await run_debate(
                    ticker,
                    timing_result,
                    fundamental_result,
                    llm,
                    analyst_insights=analyst_insights,
                    user_id=user_id,
                    preset_id=preset_id,
                    user_config_id=user_config_id
                )
                token_usage["debate"] = debate_tokens
                if "error" in debate_result:
                    debate_error = debate_result["error"]
                    if is_llm_error(debate_error):
                        raise Exception(f"LLM模型服务不可用: {debate_error}")
                final_signal = debate_result.get("signal", signal)
                final_score = debate_result.get("final_score", composite_score)
                overall_rating = round((final_score + 1) * 50, 2)
                logger.info(f"多空辩论完成: {ticker}, 信号: {final_signal}, 得分: {final_score}, token消耗: {debate_tokens}")
            except HTTPException:
                raise
            except Exception as e:
                debate_error = f"多空辩论失败: {str(e)}"
                logger.error(f"多空辩论错误: {debate_error}")
                if is_llm_error(str(e)):
                    raise Exception(f"LLM模型服务不可用: {str(e)}")
            
            if depth >= 3:
                task_manager.update_task_progress(task_id, 60, "正在进行反思分析...")
                try:
                    reflector = Reflector(llm)
                    reflector_memory.add_situations([
                        (f"分析 {ticker}", reflection)
                    ])
                    reflection, reflection_tokens = await reflector.reflect_on_decision({
                        "ticker": ticker,
                        "name": stock_name,
                        "timing": timing_result,
                        "fundamental": fundamental_result,
                        "news": news_result,
                        "debate": debate_result,
                        "signal": final_signal,
                        "score": final_score,
                        "analyst_insights": analyst_insights
                    }, user_id=user_id, preset_id=preset_id, user_config_id=user_config_id)
                    token_usage["reflection"] = reflection_tokens
                    if "error" in reflection:
                        reflection_error = reflection["error"]
                        if is_llm_error(reflection_error):
                            raise Exception(f"LLM模型服务不可用: {reflection_error}")
                    logger.info(f"反思分析完成: {ticker}, token消耗: {reflection_tokens}")
                except HTTPException:
                    raise
                except Exception as e:
                    reflection_error = f"反思分析失败: {str(e)}"
                    logger.error(f"反思分析错误: {reflection_error}")
                    if is_llm_error(str(e)):
                        raise Exception(f"LLM模型服务不可用: {str(e)}")
        
        task_manager.update_task_progress(task_id, 70, "正在计算价格区间...")
        price_range = market_result.get("price_range", {})
        if "error" in market_result:
            logger.warning(f"技术指标计算失败: {market_result['error']}")
            if len(history) > 0:
                current_price = history[-1].get("close", 0)
                price_range = {
                    "current_price": round(current_price, 2),
                    "error": market_result["error"]
                }
            else:
                price_range = {"error": "数据不足，无法计算价格区间"}
        
        target_price_analysis = []
        execution_plan = {}
        llm_error = None
        llm_error_detail = None
        
        if depth >= 3:
            task_manager.update_task_progress(task_id, 80, "正在生成目标价格和执行计划...")
            try:
                target_price_analysis, execution_plan, llm_error, llm_error_detail, target_tokens = await generate_target_price_and_execution_plan(
                    stock_name, ticker, price_range, final_signal, fundamental_result, llm, user_id,
                    preset_id=preset_id, user_config_id=user_config_id
                )
                token_usage["target_price"] = target_tokens
            except Exception as e:
                llm_error = f"生成目标价格分析和执行计划失败: {str(e)}"
                logger.error(f"LLM生成错误: {llm_error} 详情: {llm_error_detail}")
                raise Exception(f"LLM模型服务不可用: {str(e)}")
        
        task_manager.update_task_progress(task_id, 90, "正在构建响应结果...")
        
        response = {
            "stock_info": {
                "name": stock_name,
                "code": ticker,
                "exchange": "深证" if ticker.startswith("00") or ticker.startswith("30") else "北证" if ticker.startswith("8") or ticker.startswith("920") else "上证",
                "market": "A股"
            },
            "analysis_config": {
                "depth": depth,
                "depth_name": depth_controller.chinese_name,
                "depth_description": depth_controller.description,
                "time_estimate": depth_controller.time_estimate,
                "analysts": {
                    "market_analyst": {
                        "enabled": market_analyst_enabled,
                        "required": depth_controller.is_analyst_required(AnalystType.MARKET)
                    },
                    "fundamental_analyst": {
                        "enabled": fundamental_analyst_enabled,
                        "required": depth_controller.is_analyst_required(AnalystType.FUNDAMENTAL)
                    },
                    "news_analyst": {
                        "enabled": news_analyst_enabled,
                        "required": depth_controller.is_analyst_required(AnalystType.NEWS),
                        "supported": False
                    },
                    "social_analyst": {
                        "enabled": False,
                        "required": False,
                        "supported": False
                    }
                },
                "features": {
                    "sentiment_analysis": sentiment_analysis and depth >= 2,
                    "risk_assessment": risk_assessment and depth >= 2,
                    "peer_comparison": depth >= 3,
                    "historical_analysis": depth >= 3,
                    "scenario_analysis": depth >= 3,
                    "sensitivity_analysis": depth >= 3
                }
            },
            "ratings": {
                "overall": overall_rating,
                "technical": round((technical_score + 1) * 50, 2),
                "fundamental": round((fundamental_score - 1) * (100/9), 2) if fundamental_score > 0 else 0
            },
            "final_signal": final_signal,
            "final_score": round((final_score + 1) * 50, 2),
            "technical_analysis": {
                "signal": market_result.get("signal", "HOLD"),
                "confidence": market_result.get("confidence", 0),
                "bollinger_status": market_result.get("bollinger_status", "中性"),
                "price_range": price_range,
                "indicators": {
                    "ma": timing_result.get("ma"),
                    "macd": timing_result.get("macd"),
                    "rsi": timing_result.get("rsi"),
                    "bollinger": timing_result.get("bollinger"),
                    "volume": timing_result.get("volume")
                } if timing_result else None,
                "market_report": market_result.get("market_report", "")
            },
            "fundamental_analysis": {
                "score": fundamental_result.get("score", 0),
                "thesis": fundamental_result.get("thesis", ""),
                "risks": fundamental_result.get("risks", []),
                "catalyst": fundamental_result.get("catalyst", ""),
                "valuation": fundamental_result.get("valuation", {}),
                "profitability": fundamental_result.get("profitability", {}),
                "growth": fundamental_result.get("growth", {}),
                "health": fundamental_result.get("health", {}),
                "fundamentals_report": fundamental_result.get("fundamentals_report", "")
            },
            "news_analysis": {
                "sentiment": news_result.get("sentiment", "中性"),
                "sentiment_score": news_result.get("sentiment_score", 0),
                "market_impact": news_result.get("market_impact", "无法评估"),
                "key_events": news_result.get("key_events", []),
                "news_report": news_result.get("news_report", "")
            } if news_result else None,
            "strategy_position": {
                "best_buy_price": price_range.get("buy_range", {}).get("best_buy_price") if final_signal == "BUY" and price_range.get("buy_range") else None,
                "best_buy_reason": price_range.get("buy_range", {}).get("best_buy_reason") if final_signal == "BUY" and price_range.get("buy_range") else None,
                "secondary_buy_price": price_range.get("buy_range", {}).get("secondary_buy_price") if final_signal == "BUY" and price_range.get("buy_range") else None,
                "secondary_buy_reason": price_range.get("buy_range", {}).get("secondary_buy_reason") if final_signal == "BUY" and price_range.get("buy_range") else None,
                "best_sell_price": price_range.get("sell_range", {}).get("best_sell_price") if final_signal == "SELL" and price_range.get("sell_range") else None,
                "best_sell_reason": price_range.get("sell_range", {}).get("best_sell_reason") if final_signal == "SELL" and price_range.get("sell_range") else None,
                "secondary_sell_price": price_range.get("sell_range", {}).get("secondary_sell_price") if final_signal == "SELL" and price_range.get("sell_range") else None,
                "secondary_sell_reason": price_range.get("sell_range", {}).get("secondary_sell_reason") if final_signal == "SELL" and price_range.get("sell_range") else None,
                "stop_loss": (price_range.get("buy_range", {}).get("stop_loss") if final_signal == "BUY" else price_range.get("sell_range", {}).get("stop_loss")) if price_range.get("buy_range") or price_range.get("sell_range") else None,
                "stop_loss_reason": (price_range.get("buy_range", {}).get("stop_loss_reason") if final_signal == "BUY" else price_range.get("sell_range", {}).get("stop_loss_reason")) if price_range.get("buy_range") or price_range.get("sell_range") else None,
                "take_profit": (price_range.get("buy_range", {}).get("take_profit") if final_signal == "BUY" else price_range.get("sell_range", {}).get("take_profit")) if price_range.get("buy_range") or price_range.get("sell_range") else None,
                "take_profit_reason": (price_range.get("buy_range", {}).get("take_profit_reason") if final_signal == "BUY" else price_range.get("sell_range", {}).get("take_profit_reason")) if price_range.get("buy_range") or price_range.get("sell_range") else None,
                "signal": final_signal
            },
            "target_price_analysis": target_price_analysis,
            "execution_plan": execution_plan,
            "debate_result": {
                "signal": debate_result.get("signal") if debate_result else None,
                "bull_case": debate_result.get("bull_case") if debate_result else None,
                "bear_case": debate_result.get("bear_case") if debate_result else None,
                "final_score": debate_result.get("final_score") if debate_result else None
            } if debate_result else None,
            "reflection": {
                "lessons_learned": reflection.get("lessons", "") if reflection else "",
                "improvements": reflection.get("improvements", []) if reflection else []
            } if reflection else None,
            "basis_and_risks": {
                "investment_thesis": fundamental_result.get("thesis", ""),
                "key_risks": fundamental_result.get("risks", []),
                "catalyst": fundamental_result.get("catalyst", "")
            }
        }
        
        token_usage["total"] = sum(token_usage.values())
        response["token_usage"] = token_usage
        
        task_manager.update_task_progress(task_id, 95, "正在保存分析结果...")
        save_analysis_result(user_id, ticker, response, record_id)
        MembershipService.record_api_call(user_id, "/api/analyze", "POST", 200)
        
        logger.info(f"后台任务完成: 用户 {user_id} 分析股票 {ticker}, 总token消耗: {token_usage['total']}")
        
        task_manager.complete_task(task_id, response)
        
    except Exception as e:
        error_msg = f"分析任务失败: {str(e)}"
        logger.error(f"后台任务错误: {error_msg}")
        task_manager.fail_task(task_id, error_msg)


@router.post("/analyze", response_model=AnalyzeCreateResponse)
async def create_analyze_task(
    request: AnalyzeRequest,
    current_user: User = Depends(get_current_user)
) -> AnalyzeCreateResponse:
    """
    创建异步股票分析任务

    创建分析任务后立即返回task_id，前端可以通过轮询 /analyze/{task_id} 接口获取分析结果。
    每个分析任务都有一个唯一的record_id，用于唯一标识分析记录。

    Returns:
        task_id: 任务ID，用于查询分析结果
        record_id: 分析记录ID，用于唯一标识分析记录
    """
    record_id = str(uuid.uuid4())

    task_params = {
        "ticker": request.ticker,
        "depth": request.depth,
        "market_analyst": request.market_analyst,
        "fundamental_analyst": request.fundamental_analyst,
        "news_analyst": request.news_analyst,
        "sentiment_analysis": request.sentiment_analysis,
        "risk_assessment": request.risk_assessment,
        "record_id": record_id
    }

    task_id = task_manager.create_task(current_user.id, task_params)

    asyncio.create_task(run_analysis_background(task_id, current_user.id, task_params))

    logger.info(f"用户 {current_user.id} ({current_user.username}) 创建分析任务: {request.ticker}, task_id: {task_id}, record_id: {record_id}")

    return AnalyzeCreateResponse(
        task_id=task_id,
        record_id=record_id,
        message="分析任务已创建，请通过 /analyze/{task_id} 接口轮询获取结果"
    )





@router.get("/analyze", deprecated=True)
async def analyze_stock(
    ticker: str = Query(..., description="股票代码"),
    depth: int = Query(1, description="分析深度: 1-快速, 2-深度, 3-全面"),
    market_analyst: bool = Query(True, description="市场分析师"),
    fundamental_analyst: bool = Query(True, description="基本面分析师"),
    news_analyst: bool = Query(False, description="新闻分析师(暂不支持)"),
    social_analyst: bool = Query(False, description="社交媒体分析师(暂不支持)"),
    sentiment_analysis: bool = Query(True, description="情绪分析"),
    risk_assessment: bool = Query(True, description="风险评估"),
    current_user: User = Depends(get_current_user),
    response: Response = None  # 添加 Response 参数用于设置响应头
) -> dict:
    """
    分析股票（已废弃，请使用 POST /analyze 异步接口）

    Args:
        ticker: 股票代码
        depth: 分析深度: 1-快速, 2-深度, 3-全面
        market_analyst: 是否启用市场分析师
        fundamental_analyst: 是否启用基本面分析师
        news_analyst: 是否启用新闻分析师(暂不支持)
        social_analyst: 是否启用社交媒体分析师(暂不支持)
        sentiment_analysis: 是否启用情绪分析
        risk_assessment: 是否启用风险评估

    Returns:
        分析结果
    """
    # 添加废弃警告响应头
    if response:
        response.headers["Deprecation"] = "true"
        response.headers["Sunset"] = "2026-12-31"
        response.headers["Warning"] = '299 API "GET /analyze" is deprecated, use "POST /analyze" instead'
    
    global stock_service
    if stock_service is None:
        stock_service = StockService()

    stock_name = stock_service.get_stock_name(ticker)

    depth_controller = AnalysisDepthController(depth)
    depth_info = depth_controller.get_summary()

    logger.warning(f"GET /analyze 接口已过时(deprecated)，请使用 POST /analyze 异步接口以获得更好的性能和避免超时问题")
    logger.info(f"用户 {current_user.id} ({current_user.username}) 分析股票: {ticker} {stock_name}")
    logger.info(f"分析深度: {depth_controller.chinese_name} (等级{depth})")
    logger.info(f"分析师配置: 市场={market_analyst}, 基本面={fundamental_analyst}, 新闻=暂不支持, 社交=暂不支持")
    logger.info(f"高级选项: 情绪分析={sentiment_analysis}, 风险评估={risk_assessment}")

    market_analyst_enabled = market_analyst and depth_controller.should_enable_market_analyst(market_analyst)
    fundamental_analyst_enabled = fundamental_analyst and depth_controller.should_enable_fundamental_analyst(fundamental_analyst)
    news_analyst_enabled = sentiment_analysis and depth_controller.is_feature_enabled("news_analysis")

    if not market_analyst_enabled and not fundamental_analyst_enabled and not news_analyst_enabled:
        market_analyst_enabled = True
        logger.warning(f"没有启用任何分析师，强制启用市场分析师")

    check_passed, error_msg = MembershipService.check_api_call_limit(current_user.id)
    if not check_passed:
        logger.warning(f"用户 {current_user.id} {error_msg}")
        raise HTTPException(status_code=429, detail=error_msg)

    try:
        llm = LLMService.get_user_default_client(current_user.id)
        # 获取用户偏好以记录使用量
        user_preference = LLMService.get_user_preference(current_user.id)
        preset_id = user_preference.preset_id if user_preference else None
        user_config_id = user_preference.user_config_id if user_preference else None
    except ValueError:
        logger.warning(f"用户 {current_user.id} 未设置LLM偏好，LLM服务不可用")
        raise HTTPException(status_code=503, detail="LLM服务不可用")

    data_days = depth_controller.data_days
    buffer_days = data_days + 30
    history = stock_service.fetch_stock_data(ticker, days=data_days, buffer_days=buffer_days)
    if not history:
        logger.error(f"数据获取失败: {ticker}")
        raise HTTPException(status_code=400, detail="历史数据获取失败")

    market_result = {}
    fundamental_result = {}
    news_result = {}
    market_error = None
    fundamental_error = None
    
    # 初始化token消耗记录
    token_usage = {
        "market_analyst": 0,
        "fundamental_analyst": 0,
        "news_analyst": 0,
        "debate": 0,
        "reflection": 0,
        "target_price": 0,
        "total": 0
    }

    # 定义并行执行的分析师任务
    async def run_market_analyst():
        if not market_analyst_enabled:
            return {}, 0, None
        try:
            ma = MarketAnalyst()
            result, tokens = await ma.analyze(
                ticker, stock_name, history, depth, llm, 
                user_id=current_user.id, preset_id=preset_id, user_config_id=user_config_id
            )
            if "error" in result:
                error = result["error"]
                if is_llm_error(error):
                    raise HTTPException(status_code=503, detail=f"LLM模型服务不可用: {error}")
                return result, tokens, error
            logger.info(f"市场分析师完成: {ticker}, 信号: {result.get('signal', 'N/A')}, token消耗: {tokens}")
            return result, tokens, None
        except HTTPException:
            raise
        except Exception as e:
            error = f"市场分析失败: {str(e)}"
            logger.error(f"市场分析师错误: {error}")
            if is_llm_error(str(e)):
                raise HTTPException(status_code=503, detail=f"LLM模型服务不可用: {str(e)}")
            return {}, 0, error

    async def run_fundamental_analyst():
        if not fundamental_analyst_enabled:
            return {}, 0, None
        try:
            fa = FundamentalAnalyst()
            result, tokens = await fa.analyze(
                ticker, stock_name, depth, llm, risk_assessment, 
                user_id=current_user.id, preset_id=preset_id, user_config_id=user_config_id
            )
            if "error" in result:
                error = result["error"]
                if is_llm_error(error):
                    raise HTTPException(status_code=503, detail=f"LLM模型服务不可用: {error}")
                return result, tokens, error
            logger.info(f"基本面分析师完成: {ticker}, token消耗: {tokens}")
            return result, tokens, None
        except HTTPException:
            raise
        except Exception as e:
            error = f"基本面分析失败: {str(e)}"
            logger.error(f"基本面分析师错误: {error}")
            if is_llm_error(str(e)):
                raise HTTPException(status_code=503, detail=f"LLM模型服务不可用: {str(e)}")
            return {}, 0, error

    async def run_news_analyst():
        if not news_analyst_enabled:
            return {}, 0, None
        try:
            logger.debug(f"启动新闻分析师: {ticker}")
            na = NewsAnalyst()
            result, tokens = await na.analyze(
                ticker, stock_name, depth, llm, sentiment_analysis, 
                user_id=current_user.id, preset_id=preset_id, user_config_id=user_config_id
            )
            logger.info(f"新闻分析师完成: {ticker}, 情绪: {result.get('sentiment', 'N/A')}, token消耗: {tokens}")
            return result, tokens, None
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"新闻分析师错误: {str(e)}")
            if is_llm_error(str(e)):
                raise HTTPException(status_code=503, detail=f"LLM模型服务不可用: {str(e)}")
            return {}, 0, None

    # 并行执行分析师任务
    tasks = [run_market_analyst(), run_fundamental_analyst(), run_news_analyst()]
    results = await asyncio.gather(*tasks)
    
    market_result, market_tokens, market_error = results[0]
    fundamental_result, fundamental_tokens, fundamental_error = results[1]
    news_result, news_tokens, news_error = results[2]
    
    token_usage["market_analyst"] = market_tokens
    token_usage["fundamental_analyst"] = fundamental_tokens
    token_usage["news_analyst"] = news_tokens

    # 提取分析师的LLM分析结果
    market_llm_analysis = market_result.get("llm_analysis", "")
    fundamental_llm_analysis = fundamental_result.get("llm_analysis", "")
    news_llm_analysis = news_result.get("llm_analysis", "")

    timing_result = market_result.get("timing_scores", {})
    signal = market_result.get("signal") or "HOLD"
    technical_score = market_result.get("technical_score", 0) or 0
    fundamental_score = fundamental_result.get("score", 0) or 0

    # 将技术评分从 [0, 100] 归一化到 [-1, 1]
    if technical_score > 1:
        technical_score = technical_score / 100 * 2 - 1
    
    # 将基本面评分从 [0, 100] 归一化到 [0, 1]
    if fundamental_score > 1:
        fundamental_score = fundamental_score / 100

    technical_score = max(-1, min(1, technical_score))
    fundamental_score = max(0, min(1, fundamental_score))
    composite_score = (technical_score + fundamental_score) / 2
    overall_rating = round((composite_score + 1) * 50, 2)

    debate_result = {}
    reflection = {}
    debate_error = None
    reflection_error = None
    final_signal = signal
    final_score = composite_score

    if depth >= 2 and (market_analyst_enabled or fundamental_analyst_enabled):
        try:
            # 准备分析师的LLM分析结果作为辩论依据
            analyst_insights = {
                "market_analysis": market_llm_analysis,
                "fundamental_analysis": fundamental_llm_analysis,
                "news_analysis": news_llm_analysis
            }
            debate_result, debate_tokens = await run_debate(
                ticker,
                timing_result,
                fundamental_result,
                llm,
                analyst_insights=analyst_insights,
                user_id=current_user.id,
                preset_id=preset_id,
                user_config_id=user_config_id
            )
            token_usage["debate"] = debate_tokens
            if "error" in debate_result:
                debate_error = debate_result["error"]
                if is_llm_error(debate_error):
                    raise HTTPException(status_code=503, detail=f"LLM模型服务不可用: {debate_error}")
            final_signal = debate_result.get("signal", signal)
            final_score = debate_result.get("final_score", composite_score)
            overall_rating = round((final_score + 1) * 50, 2)
            logger.info(f"多空辩论完成: {ticker}, 信号: {final_signal}, 得分: {final_score}, token消耗: {debate_tokens}")
        except HTTPException:
            raise
        except Exception as e:
            debate_error = f"多空辩论失败: {str(e)}"
            logger.error(f"多空辩论错误: {debate_error}")
            if is_llm_error(str(e)):
                raise HTTPException(status_code=503, detail=f"LLM模型服务不可用: {str(e)}")

        if depth >= 3:
            try:
                logger.debug(f"启动反思分析: {ticker}")
                reflector = Reflector(llm)
                # 准备分析师的LLM分析结果作为反思依据
                analyst_insights = {
                    "market_analysis": market_llm_analysis,
                    "fundamental_analysis": fundamental_llm_analysis,
                    "news_analysis": news_llm_analysis
                }
                reflection, reflection_tokens = await reflector.reflect_on_decision({
                    "ticker": ticker,
                    "name": stock_name,
                    "timing": timing_result,
                    "fundamental": fundamental_result,
                    "news": news_result,
                    "debate": debate_result,
                    "signal": final_signal,
                    "score": final_score,
                    "analyst_insights": analyst_insights
                }, user_id=current_user.id, preset_id=preset_id, user_config_id=user_config_id)
                token_usage["reflection"] = reflection_tokens
                if "error" in reflection:
                    reflection_error = reflection["error"]
                    if is_llm_error(reflection_error):
                        raise HTTPException(status_code=503, detail=f"LLM模型服务不可用: {reflection_error}")
                logger.info(f"反思分析完成: {ticker}, token消耗: {reflection_tokens}")

                reflector_memory.add_situations([
                    (f"分析 {ticker}", reflection)
                ])
                logger.debug(f"反思结果已存储到内存")
            except HTTPException:
                raise
            except Exception as e:
                reflection_error = f"反思分析失败: {str(e)}"
                logger.error(f"反思分析错误: {reflection_error}")
                if is_llm_error(str(e)):
                    raise HTTPException(status_code=503, detail=f"LLM模型服务不可用: {str(e)}")

    price_range = market_result.get("price_range", {})
    if "error" in market_result:
        logger.warning(f"技术指标计算失败: {market_result['error']}")
        if len(history) > 0:
            current_price = history[-1].get("close", 0)
            price_range = {
                "current_price": round(current_price, 2),
                "error": market_result["error"]
            }
        else:
            price_range = {"error": "数据不足，无法计算价格区间"}

    target_price_analysis = []
    execution_plan = {}
    llm_error = None
    llm_error_detail = None

    if depth >= 3:
        try:
            target_price_analysis, execution_plan, llm_error, llm_error_detail, target_tokens = await generate_target_price_and_execution_plan(
                stock_name, ticker, price_range, final_signal, fundamental_result, llm, current_user.id,
                preset_id=preset_id, user_config_id=user_config_id
            )
            token_usage["target_price"] = target_tokens
        except Exception as e:
            llm_error = f"生成目标价格分析和执行计划失败: {str(e)}"
            logger.error(f"LLM生成错误: {llm_error} 详情: {llm_error_detail}")
            raise HTTPException(status_code=503, detail=f"LLM模型服务不可用: {str(e)}")

    response = {
        "stock_info": {
            "name": stock_name,
            "code": ticker,
            "exchange": "深证" if ticker.startswith("00") or ticker.startswith("30") else "北证" if ticker.startswith("8") or ticker.startswith("920") else "上证",
            "market": "A股"
        },
        "analysis_config": {
            "depth": depth,
            "depth_name": depth_controller.chinese_name,
            "depth_description": depth_controller.description,
            "time_estimate": depth_controller.time_estimate,
            "analysts": {
                "market_analyst": {
                    "enabled": market_analyst_enabled,
                    "required": depth_controller.is_analyst_required(AnalystType.MARKET)
                },
                "fundamental_analyst": {
                    "enabled": fundamental_analyst_enabled,
                    "required": depth_controller.is_analyst_required(AnalystType.FUNDAMENTAL)
                },
                "news_analyst": {
                    "enabled": news_analyst_enabled,
                    "required": depth_controller.is_analyst_required(AnalystType.NEWS),
                    "supported": False
                },
                "social_analyst": {
                    "enabled": False,
                    "required": False,
                    "supported": False
                }
            },
            "features": {
                "sentiment_analysis": sentiment_analysis and depth >= 2,
                "risk_assessment": risk_assessment and depth >= 2,
                "peer_comparison": depth >= 3,
                "historical_analysis": depth >= 3,
                "scenario_analysis": depth >= 3,
                "sensitivity_analysis": depth >= 3
            }
        },
        "ratings": {
            "overall": overall_rating,
            "technical": round((technical_score + 1) * 50, 2),
            "fundamental": round((fundamental_score - 1) * (100/9), 2) if fundamental_score > 0 else 0
        },
        "final_signal": final_signal,
        "final_score": round((final_score + 1) * 50, 2),
        "technical_analysis": {
            "signal": market_result.get("signal", "HOLD"),
            "confidence": market_result.get("confidence", 0),
            "bollinger_status": market_result.get("bollinger_status", "中性"),
            "price_range": price_range,
            "indicators": {
                "ma": timing_result.get("ma"),
                "macd": timing_result.get("macd"),
                "rsi": timing_result.get("rsi"),
                "bollinger": timing_result.get("bollinger"),
                "volume": timing_result.get("volume")
            } if timing_result else None,
            "market_report": market_result.get("market_report", "")
        },
        "fundamental_analysis": {
            "score": fundamental_result.get("score", 0),
            "thesis": fundamental_result.get("thesis", ""),
            "risks": fundamental_result.get("risks", []),
            "catalyst": fundamental_result.get("catalyst", ""),
            "valuation": fundamental_result.get("valuation", {}),
            "profitability": fundamental_result.get("profitability", {}),
            "growth": fundamental_result.get("growth", {}),
            "health": fundamental_result.get("health", {}),
            "fundamentals_report": fundamental_result.get("fundamentals_report", "")
        },
        "news_analysis": {
            "sentiment": news_result.get("sentiment", "中性"),
            "sentiment_score": news_result.get("sentiment_score", 0),
            "market_impact": news_result.get("market_impact", "无法评估"),
            "key_events": news_result.get("key_events", []),
            "news_report": news_result.get("news_report", "")
        } if news_result else None,
        "strategy_position": {
            "best_buy_price": price_range.get("buy_range", {}).get("best_buy_price") if final_signal == "BUY" and price_range.get("buy_range") else None,
            "best_buy_reason": price_range.get("buy_range", {}).get("best_buy_reason") if final_signal == "BUY" and price_range.get("buy_range") else None,
            "secondary_buy_price": price_range.get("buy_range", {}).get("secondary_buy_price") if final_signal == "BUY" and price_range.get("buy_range") else None,
            "secondary_buy_reason": price_range.get("buy_range", {}).get("secondary_buy_reason") if final_signal == "BUY" and price_range.get("buy_range") else None,
            "best_sell_price": price_range.get("sell_range", {}).get("best_sell_price") if final_signal == "SELL" and price_range.get("sell_range") else None,
            "best_sell_reason": price_range.get("sell_range", {}).get("best_sell_reason") if final_signal == "SELL" and price_range.get("sell_range") else None,
            "secondary_sell_price": price_range.get("sell_range", {}).get("secondary_sell_price") if final_signal == "SELL" and price_range.get("sell_range") else None,
            "secondary_sell_reason": price_range.get("sell_range", {}).get("secondary_sell_reason") if final_signal == "SELL" and price_range.get("sell_range") else None,
            "stop_loss": (price_range.get("buy_range", {}).get("stop_loss") if final_signal == "BUY" else price_range.get("sell_range", {}).get("stop_loss")) if price_range.get("buy_range") or price_range.get("sell_range") else None,
            "stop_loss_reason": (price_range.get("buy_range", {}).get("stop_loss_reason") if final_signal == "BUY" else price_range.get("sell_range", {}).get("stop_loss_reason")) if price_range.get("buy_range") or price_range.get("sell_range") else None,
            "take_profit": (price_range.get("buy_range", {}).get("take_profit") if final_signal == "BUY" else price_range.get("sell_range", {}).get("take_profit")) if price_range.get("buy_range") or price_range.get("sell_range") else None,
            "take_profit_reason": (price_range.get("buy_range", {}).get("take_profit_reason") if final_signal == "BUY" else price_range.get("sell_range", {}).get("take_profit_reason")) if price_range.get("buy_range") or price_range.get("sell_range") else None,
            "signal": final_signal
        },
        "target_price_analysis": target_price_analysis,
        "execution_plan": execution_plan,
        "debate_result": {
            "signal": debate_result.get("signal") if debate_result else None,
            "bull_case": debate_result.get("bull_case") if debate_result else None,
            "bear_case": debate_result.get("bear_case") if debate_result else None,
            "final_score": debate_result.get("final_score") if debate_result else None
        } if debate_result else None,
        "reflection": {
            "lessons_learned": reflection.get("lessons", "") if reflection else "",
            "improvements": reflection.get("improvements", []) if reflection else []
        } if reflection else None,
        "basis_and_risks": {
            "investment_thesis": fundamental_result.get("thesis", ""),
            "key_risks": fundamental_result.get("risks", []),
            "catalyst": fundamental_result.get("catalyst", "")
        }
    }

    # 计算总token消耗
    token_usage["total"] = sum(token_usage.values())
    
    # 添加token消耗到响应中
    response["token_usage"] = token_usage

    save_analysis_result(current_user.id, ticker, response)

    MembershipService.record_api_call(current_user.id, "/api/analyze", "GET", 200)

    logger.info(f"用户 {current_user.id} ({current_user.username}) 分析完成: {ticker}, 总token消耗: {token_usage['total']}")
    logger.debug(f"用户 {current_user.id} ({current_user.username}) 分析结果: {response}")
    return response


def generate_markdown_report(analysis_result: dict, report_language: str = "中文") -> str:
    """
    生成 Markdown 格式的报告

    Args:
        analysis_result: 分析结果字典
        report_language: 报告语言

    Returns:
        Markdown 格式的报告字符串
    """
    stock_info = analysis_result.get('stock_info', {})
    stock_name = stock_info.get('name', '未知股票')
    stock_code = stock_info.get('code', '未知代码')
    exchange = stock_info.get('exchange', '未知交易所')
    market = stock_info.get('market', '未知市场')

    analysis_config = analysis_result.get('analysis_config', {})
    depth_name = analysis_config.get('depth_name', '未知深度')
    depth_description = analysis_config.get('depth_description', '')
    time_estimate = analysis_config.get('time_estimate', '')
    final_signal = analysis_result.get('final_signal', 'HOLD')
    final_score = analysis_result.get('final_score', 0)
    ratings = analysis_result.get('ratings', {})
    created_at = analysis_result.get('created_at', '未知时间')

    markdown = f"""# 📊 {stock_name} ({stock_code}) 分析报告
```
┌─────────────────────────────────────────────────────────┐
│  🎯 股票代码: {stock_code:8} | 📈 交易所: {exchange:6} | 🏛️ 市场: {market}  │
└─────────────────────────────────────────────────────────┘
```

## 📋 分析概览

| 指标 | 数值 |
|:---:|:---:|
| **分析深度** | {depth_name} |
| **最终信号** | {'🟢 BUY' if final_signal == 'BUY' else '🔴 SELL' if final_signal == 'SELL' else '🟡 HOLD'} |
| **综合评分** | {ratings.get('overall', 'N/A')} / 100 |
| **技术评分** | {ratings.get('technical', 'N/A')} / 100 |
| **基本面评分** | {ratings.get('fundamental', 'N/A')} / 100 |

**⏰ 分析时间**: {created_at}
"""
    if depth_description:
        markdown += f"\n> 📝 {depth_description}\n"

    analysts = analysis_config.get('analysts', {})
    if analysts:
        markdown += "\n### 🔧 分析师配置\n\n"
        for analyst_name, analyst_info in analysts.items():
            if isinstance(analyst_info, dict):
                enabled = analyst_info.get('enabled', False)
                required = analyst_info.get('required', False)
                status = "✅" if enabled else "❌"
                markdown += f"- {status} **{analyst_name}**: 启用={enabled}, 必需={required}\n"

    features = analysis_config.get('features', {})
    if features:
        markdown += "\n### ✨ 功能特性\n\n"
        for feature_name, feature_enabled in features.items():
            if feature_enabled:
                markdown += f"- 🔹 {feature_name}\n"

    markdown += "\n---\n\n## 📈 技术分析\n\n"

    technical_analysis = analysis_result.get('technical_analysis', {})
    if technical_analysis:
        markdown += "### 📉 市场分析\n\n"
        signal = technical_analysis.get('signal', 'N/A')
        signal_emoji = '🟢' if signal == 'BUY' else '🔴' if signal == 'SELL' else '🟡'
        markdown += f"| 项目 | 数值 |\n|:---|:---:|\n"
        markdown += f"| 信号 | {signal_emoji} **{signal}** |\n"
        markdown += f"| 置信度 | {technical_analysis.get('confidence', 0)}% |\n"
        markdown += f"| 布林带状态 | {technical_analysis.get('bollinger_status', 'N/A')} |\n\n"

        indicators = technical_analysis.get('indicators', {})
        if indicators:
            markdown += "#### 📊 技术指标\n\n"
            ma = indicators.get('ma', {})
            if ma:
                markdown += f"- **MA (移动平均线)**: {ma}\n"
            macd = indicators.get('macd', {})
            if macd:
                markdown += f"- **MACD**: {macd}\n"
            rsi = indicators.get('rsi', {})
            if rsi:
                markdown += f"- **RSI**: {rsi}\n"
            bollinger = indicators.get('bollinger', {})
            if bollinger:
                markdown += f"- **布林带**: {bollinger}\n"
            volume = indicators.get('volume', {})
            if volume:
                markdown += f"- **成交量**: {volume}\n"
            markdown += "\n"

        price_range = technical_analysis.get('price_range', {})
        if price_range:
            markdown += "#### 💰 价格区间\n\n"
            buy_range = price_range.get('buy_range', {})
            if buy_range:
                markdown += f"| 买入区间 | {buy_range} |\n"
            sell_range = price_range.get('sell_range', {})
            if sell_range:
                markdown += f"| 卖出区间 | {sell_range} |\n"
            markdown += "\n"

        if technical_analysis.get('market_report'):
            markdown += "#### 📝 技术分析报告\n\n"
            markdown += f"{technical_analysis['market_report']}\n\n"

    markdown += "---\n\n## 💼 基本面分析\n\n"

    fundamental_analysis = analysis_result.get('fundamental_analysis', {})
    if fundamental_analysis:
        markdown += f"**📊 基本面得分**: {fundamental_analysis.get('score', 'N/A')} / 100\n\n"

        valuation = fundamental_analysis.get('valuation', {})
        if valuation:
            markdown += "### 💎 估值指标\n\n"
            for key, value in valuation.items():
                markdown += f"- **{key}**: {value}\n"
            markdown += "\n"

        profitability = fundamental_analysis.get('profitability', {})
        if profitability:
            markdown += "### 📈 盈利能力\n\n"
            for key, value in profitability.items():
                markdown += f"- **{key}**: {value}\n"
            markdown += "\n"

        growth = fundamental_analysis.get('growth', {})
        if growth:
            markdown += "### 📊 成长性\n\n"
            for key, value in growth.items():
                markdown += f"- **{key}**: {value}\n"
            markdown += "\n"

        health = fundamental_analysis.get('health', {})
        if health:
            markdown += "### 🏥 财务健康\n\n"
            for key, value in health.items():
                markdown += f"- **{key}**: {value}\n"
            markdown += "\n"

        if fundamental_analysis.get('thesis'):
            markdown += f"**📌 投资理由**: {fundamental_analysis['thesis']}\n\n"
        if fundamental_analysis.get('risks'):
            risks = fundamental_analysis.get('risks', [])
            if isinstance(risks, list) and risks:
                markdown += "### ⚠️ 主要风险\n\n"
                for risk in risks:
                    markdown += f"- 🔸 {risk}\n"
                markdown += "\n"
            elif isinstance(risks, str) and risks:
                markdown += f"### ⚠️ 主要风险\n\n{risks}\n\n"
        if fundamental_analysis.get('catalyst'):
            markdown += f"### 🚀 催化剂\n\n{fundamental_analysis['catalyst']}\n\n"
        if fundamental_analysis.get('fundamentals_report'):
            markdown += "### 📄 基本面分析报告\n\n"
            markdown += f"{fundamental_analysis['fundamentals_report']}\n\n"

    markdown += "---\n\n## 📰 新闻与情绪分析\n\n"

    news_analysis = analysis_result.get('news_analysis', {})
    if news_analysis:
        sentiment = news_analysis.get('sentiment', 'N/A')
        sentiment_emoji = '🟢' if sentiment == '乐观' else '🔴' if sentiment == '悲观' else '🟡'
        markdown += f"### 📰 新闻分析\n\n"
        markdown += f"| 指标 | 数值 |\n|:---|:---:|\n"
        markdown += f"| 情绪 | {sentiment_emoji} {sentiment} |\n"
        markdown += f"| 情绪得分 | {news_analysis.get('sentiment_score', 'N/A')} |\n"
        markdown += f"| 市场影响 | {news_analysis.get('market_impact', 'N/A')} |\n\n"

        key_events = news_analysis.get('key_events', [])
        if key_events:
            markdown += "**📌 关键事件**:\n\n"
            for event in key_events:
                markdown += f"- {event}\n"
            markdown += "\n"

        if news_analysis.get('news_report'):
            markdown += "### 📝 新闻报告\n\n"
            markdown += f"{news_analysis['news_report']}\n\n"

    markdown += "---\n\n## ⚖️ 多空辩论\n\n"

    debate_result = analysis_result.get('debate_result', {})
    if debate_result:
        if debate_result.get('bull_case'):
            markdown += "### 🟢 看多理由\n\n"
            markdown += f"{debate_result['bull_case']}\n\n"
        if debate_result.get('bear_case'):
            markdown += "### 🔴 看空理由\n\n"
            markdown += f"{debate_result['bear_case']}\n\n"

        debate_signal = debate_result.get('signal', 'N/A')
        debate_signal_emoji = '🟢' if debate_signal == 'BUY' else '🔴' if debate_signal == 'SELL' else '🟡'
        markdown += f"| 辩论信号 | {debate_signal_emoji} **{debate_signal}** |\n"
        markdown += f"| 辩论得分 | {debate_result.get('final_score', 'N/A')} |\n\n"

    markdown += "---\n\n## 🎯 投资策略\n\n"

    strategy_position = analysis_result.get('strategy_position', {})
    if strategy_position:
        markdown += "### 📍 策略位置\n\n"
        if strategy_position.get('best_buy_price'):
            markdown += f"- 💚 **最佳买入价**: {strategy_position['best_buy_price']}\n"
        if strategy_position.get('secondary_buy_price'):
            markdown += f"- 💛 **次优买入价**: {strategy_position['secondary_buy_price']}\n"
        if strategy_position.get('best_sell_price'):
            markdown += f"- 💜 **最佳卖出价**: {strategy_position['best_sell_price']}\n"
        if strategy_position.get('secondary_sell_price'):
            markdown += f"- 💙 **次优卖出价**: {strategy_position['secondary_sell_price']}\n"
        if strategy_position.get('stop_loss'):
            markdown += f"- 🛑 **止损位**: {strategy_position['stop_loss']}\n"
        if strategy_position.get('take_profit'):
            markdown += f"- 🎯 **止盈位**: {strategy_position['take_profit']}\n"
        markdown += "\n"

    target_price_analysis = analysis_result.get('target_price_analysis', {})
    if target_price_analysis:
        markdown += "### 🎯 目标价格分析\n\n"
        markdown += f"| 项目 | 数值 |\n|:---|:---:|\n"
        markdown += f"| 目标价格 | {target_price_analysis.get('target_price', 'N/A')} |\n"
        markdown += f"| 上涨空间 | 📈 {target_price_analysis.get('upside_space', 'N/A')} |\n"
        markdown += f"| 下跌风险 | 📉 {target_price_analysis.get('downside_risk', 'N/A')} |\n\n"
        if target_price_analysis.get('analysis'):
            markdown += f"**📝 分析**: {target_price_analysis['analysis']}\n\n"

    execution_plan = analysis_result.get('execution_plan', {})
    if execution_plan:
        markdown += "### 📋 执行计划\n\n"
        if execution_plan.get('entry_strategy'):
            markdown += f"- 🚪 **入场策略**: {execution_plan['entry_strategy']}\n"
        if execution_plan.get('risk_management'):
            markdown += f"- 🛡️ **风险管理**: {execution_plan['risk_management']}\n"
        if execution_plan.get('exit_strategy'):
            markdown += f"- 🚪 **出场策略**: {execution_plan['exit_strategy']}\n"
        if execution_plan.get('position_sizing'):
            markdown += f"- 📊 **仓位管理**: {execution_plan['position_sizing']}\n"
        markdown += "\n"

    reflection = analysis_result.get('reflection', {})
    if reflection:
        markdown += "---\n\n## 💡 反思与改进\n\n"
        if reflection.get('lessons_learned'):
            markdown += f"**📚 经验教训**: {reflection['lessons_learned']}\n\n"
        improvements = reflection.get('improvements', [])
        if improvements:
            if isinstance(improvements, list) and improvements:
                markdown += "**🔧 改进建议**:\n\n"
                for improvement in improvements:
                    markdown += f"- {improvement}\n"
            elif isinstance(improvements, str) and improvements:
                markdown += f"**🔧 改进建议**: {improvements}\n"
        markdown += "\n"

    basis_and_risks = analysis_result.get('basis_and_risks', {})
    if basis_and_risks:
        markdown += "---\n\n## ⚠️ 投资依据与风险\n\n"
        if basis_and_risks.get('investment_thesis'):
            markdown += f"**📌 投资论点**: {basis_and_risks['investment_thesis']}\n\n"
        key_risks = basis_and_risks.get('key_risks', [])
        if key_risks:
            if isinstance(key_risks, list) and key_risks:
                markdown += "**⚠️ 关键风险**:\n\n"
                for risk in key_risks:
                    markdown += f"- 🔸 {risk}\n"
                markdown += "\n"
            elif isinstance(key_risks, str) and key_risks:
                markdown += f"**⚠️ 关键风险**: {key_risks}\n\n"
        if basis_and_risks.get('catalyst'):
            markdown += f"**🚀 催化剂**: {basis_and_risks['catalyst']}\n\n"

    markdown += "---\n\n## 🎯 总结\n\n"
    final_signal_emoji = '🟢' if final_signal == 'BUY' else '🔴' if final_signal == 'SELL' else '🟡'
    markdown += f"""```
┌────────────────────────────────────────────────────────────┐
│                                                            │
│   {final_signal_emoji} 投资建议: {final_signal:4}                              │
│                                                            │
│   📊 最终得分: {final_score} / 100                                  │
│                                                            │
│   💭 建议理由: 基于{depth_name}分析，            │
│      最终得分为{final_score}                          │
│                                                            │
└────────────────────────────────────────────────────────────┘
```
"""

    return markdown


@router.get("/analyze/report")
async def get_report(
    ticker: str = Query(..., description="股票代码"),
    format: str = Query("markdown", description="报告格式: markdown 或 pdf"),
    report_language: str = Query("中文", description="报告语言"),
    current_user: User = Depends(get_current_user)
):
    """
    获取格式化报告

    Args:
        ticker: 股票代码
        format: 报告格式: markdown 或 pdf
        report_language: 报告语言

    Returns:
        直接返回文件（Markdown或PDF）
    """
    global stock_service
    if stock_service is None:
        stock_service = StockService()
    
    stock_name = stock_service.get_stock_name(ticker)
    # 确保stock_name是字符串类型
    stock_name_str = str(stock_name) if stock_name else "未知股票"
    logger.info(f"用户 {current_user.id} ({current_user.username}) 获取报告: {ticker} {stock_name_str}, 格式: {format}")

    try:
        from ..core.database import execute_query
        import json

        # 从数据库获取最新的分析结果
        query = """
        SELECT analysis_result, created_at
        FROM stock_analysis_results
        WHERE user_id = %s AND stock_code = %s
        ORDER BY created_at DESC
        LIMIT 1
        """

        result = execute_query(query, (current_user.id, ticker))

        if not result:
            logger.error(f"未找到分析结果: {ticker}")
            raise HTTPException(
                status_code=404,
                detail=f"No analysis result found for stock {ticker}, please call /analyze API first"
            )

        # 解析分析结果
        analysis_result = result[0][0]
        created_at = result[0][1]
        if isinstance(analysis_result, str):
            try:
                # 尝试用 UTF-8 解码
                analysis_result = json.loads(analysis_result)
            except UnicodeDecodeError as e:
                logger.error(f"分析结果解码失败: {e}")
                # 尝试用其他编码解码
                try:
                    analysis_result = json.loads(analysis_result.encode('latin-1').decode('utf-8', errors='ignore'))
                except Exception as e2:
                    logger.error(f"分析结果解码失败（备用方法）: {e2}")
                    # 如果都失败了，返回错误
                    raise HTTPException(
                        status_code=500,
                        detail="Analysis result decoding failed"
                    )

        # 添加分析时间到结果中（处理时区转换）
        if created_at:
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=timezone.utc)
            local_time = created_at.astimezone()
            analysis_result['created_at'] = local_time.strftime('%Y-%m-%d %H:%M:%S')
        
        # 生成报告
        if format == "markdown":
            report_content = generate_markdown_report(analysis_result, report_language)
            # 确保stock_name是字符串类型
            stock_name_str = str(stock_name) if stock_name else "未知股票"
            # 对文件名进行URL编码，避免中文编码问题
            import urllib.parse
            encoded_stock_name = urllib.parse.quote(stock_name_str)
            encoded_language = urllib.parse.quote(report_language)
            file_name = f"{encoded_stock_name}_{ticker}_report_{encoded_language}.md"
            return Response(
                content=report_content.encode('utf-8'),  # 明确指定编码
                media_type="text/markdown; charset=utf-8",  # 添加字符集
                headers={
                    "Content-Disposition": f"attachment; filename*=UTF-8''{file_name}",
                    "Content-Transfer-Encoding": "binary"
                }
            )
        elif format == "pdf":
            # 使用 reportlab 生成 PDF
            try:
                from reportlab.lib.pagesizes import A4
                from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
                from reportlab.lib.units import cm
                from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
                from reportlab.lib import colors
                from reportlab.lib.enums import TA_LEFT, TA_CENTER
                from reportlab.pdfbase import pdfmetrics
                from reportlab.pdfbase.ttfonts import TTFont
                from io import BytesIO
                
                # 注册中文字体
                try:
                    # 尝试使用系统默认中文字体
                    pdfmetrics.registerFont(TTFont('SimHei', 'simhei.ttf'))
                except:
                    # 如果系统没有simhei.ttf，使用reportlab内置字体
                    pass
                
                logger.info(f"使用 reportlab 开始生成PDF报告")
                markdown_content = generate_markdown_report(analysis_result, report_language)
                
                # 确保stock_name是字符串类型
                stock_name_str = str(stock_name) if stock_name else "未知股票"
                # 对文件名进行URL编码，避免中文编码问题
                import urllib.parse
                encoded_stock_name = urllib.parse.quote(stock_name_str)
                encoded_language = urllib.parse.quote(report_language)
                file_name = f"{encoded_stock_name}_{ticker}_report_{encoded_language}.pdf"
                
                # 创建PDF文档
                buffer = BytesIO()
                doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=2*cm, leftMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm)
                
                # 准备内容
                story = []
                
                # 添加标题
                styles = getSampleStyleSheet()
                
                # 创建支持中文的样式
                title_style = ParagraphStyle(
                    'CustomTitle',
                    parent=styles['Heading1'],
                    fontSize=18,
                    textColor=colors.HexColor('#333333'),
                    spaceAfter=20,
                    fontName='SimHei'  # 使用中文字体
                )
                
                body_style = ParagraphStyle(
                    'CustomBody',
                    parent=styles['BodyText'],
                    fontName='SimHei'  # 使用中文字体
                )
                
                # 解析Markdown内容
                lines = markdown_content.split('\n')
                for line in lines:
                    line = line.strip()
                    if not line:
                        story.append(Spacer(1, 12))
                    elif line.startswith('# '):
                        # 一级标题
                        story.append(Paragraph(line[2:], title_style))
                    elif line.startswith('## '):
                        # 二级标题
                        story.append(Paragraph(line[3:], title_style))
                    elif line.startswith('### '):
                        # 三级标题
                        story.append(Paragraph(line[4:], body_style))
                    elif line.startswith('- '):
                        # 列表项
                        story.append(Paragraph(f'• {line[2:]}', body_style))
                    elif line.startswith('**') and line.endswith('**'):
                        # 粗体文本
                        story.append(Paragraph(line, body_style))
                    else:
                        # 普通文本
                        story.append(Paragraph(line, body_style))
                
                # 构建PDF
                doc.build(story)
                pdf_file = buffer.getvalue()
                buffer.close()
                
                logger.info(f"PDF生成成功，大小: {len(pdf_file)} 字节")
                
                return Response(
                    content=pdf_file,
                    media_type="application/pdf",
                    headers={
                        "Content-Disposition": f"attachment; filename*=UTF-8''{file_name}",
                        "Content-Transfer-Encoding": "binary"
                    }
                )
            except ImportError as e:
                logger.error(f"PDF生成库未安装: {e}")
                raise HTTPException(
                    status_code=500,
                    detail=f"PDF generation libraries not installed: {str(e)}"
                )
            except Exception as e:
                logger.error(f"PDF生成失败: {e}")
                error_detail = str(e)
                if len(error_detail) > 200:
                    error_detail = error_detail[:200] + "..."
                raise HTTPException(
                    status_code=500,
                    detail=f"PDF generation failed: {error_detail}"
                )
        else:
            raise HTTPException(
                status_code=400,
                detail="Unsupported format, please use markdown or pdf"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"生成报告失败: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"生成报告失败: {str(e)}"
        )


@router.get("/analyze/history")
def get_history(current_user: User = Depends(get_current_user)) -> dict:
    """
    获取历史分析记录

    Returns:
        历史记录，包含user_id和analysis_result
    """
    try:
        from ..core.database import execute_query
        
        logger.info(f"用户 {current_user.id} ({current_user.username}) 获取历史分析记录")
        
        # 查询用户的分析记录，按created_at从近及远排序
        query = """
        SELECT analysis_result, created_at, record_id, stock_code
        FROM stock_analysis_results
        WHERE user_id = %s
        ORDER BY created_at DESC
        """

        results = execute_query(query, (current_user.id,))

        # 构建analysis_result列表
        analysis_results = []
        for row in results:
            analysis_result = row[0]  # analysis_result字段
            created_at = row[1]  # created_at字段
            record_id = row[2]  # record_id字段
            stock_code = row[3]  # stock_code字段

            # 在分析结果中添加created_at字段，方便前端显示
            if isinstance(analysis_result, dict):
                if created_at:
                    # 直接使用数据库返回的时间，不做任何时区处理
                    # 数据库连接已设置为 Asia/Shanghai 时区，时间就是正确的
                    analysis_result['created_at'] = created_at.strftime('%Y-%m-%d %H:%M:%S')
                else:
                    analysis_result['created_at'] = None
                analysis_result['record_id'] = record_id
                analysis_result['stock_code'] = stock_code

            analysis_results.append(analysis_result)
        
        return {
            "user_id": current_user.id,
            "analysis_result": analysis_results
        }
    except Exception as e:
        logger.error(f"获取历史分析记录失败: {e}")
        return {
            "user_id": current_user.id,
            "analysis_result": [],
            "error": f"获取历史记录失败: {str(e)}"
        }


@router.get("/analyze/history/{record_id}")
def get_history_by_record_id(
    record_id: str,
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    根据 record_id 获取单条历史分析记录

    Args:
        record_id: 分析记录的唯一标识UUID

    Returns:
        单条分析记录
    """
    try:
        from ..core.database import execute_query

        logger.info(f"用户 {current_user.id} ({current_user.username}) 获取单条历史分析记录, record_id: {record_id}")

        query = """
        SELECT analysis_result, created_at, stock_code
        FROM stock_analysis_results
        WHERE record_id = %s AND user_id = %s
        """

        results = execute_query(query, (record_id, current_user.id))

        if not results:
            raise HTTPException(status_code=404, detail="记录不存在或无权访问")

        analysis_result = results[0][0]
        created_at = results[0][1]
        stock_code = results[0][2]

        if isinstance(analysis_result, dict):
            if created_at:
                analysis_result['created_at'] = created_at.strftime('%Y-%m-%d %H:%M:%S')
            else:
                analysis_result['created_at'] = None
            analysis_result['record_id'] = record_id
            analysis_result['stock_code'] = stock_code

        return {
            "record_id": record_id,
            "analysis_result": analysis_result
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取单条历史分析记录失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取历史记录失败: {str(e)}")


@router.get("/analyze/{task_id}", response_model=AnalyzeStatusResponse)
async def get_analyze_task_status(
    task_id: str,
    current_user: User = Depends(get_current_user)
) -> AnalyzeStatusResponse:
    """
    获取异步股票分析任务状态和结果
    
    Args:
        task_id: 任务ID
        
    Returns:
        任务状态、进度和结果（如果已完成）
    """
    task = task_manager.get_task_for_user(task_id, current_user.id)
    
    if task is None:
        raise HTTPException(status_code=404, detail="任务不存在或无权访问")
    
    return AnalyzeStatusResponse(
        task_id=task["task_id"],
        record_id=task.get("params", {}).get("record_id"),
        status=task["status"],
        progress=task["progress"],
        progress_message=task["progress_message"],
        result=task.get("result"),
        error=task.get("error")
    )