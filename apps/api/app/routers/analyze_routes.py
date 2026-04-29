"""股票分析相关的 API 路由"""
from datetime import datetime, timezone
from fastapi import APIRouter, Query, Depends, HTTPException
from fastapi.responses import Response
from typing import Optional, List
import json
import os

from ..data.fetcher import fetch_stock_data, fetch_fundamental
from ..data.indicators import TimingScorer
from ..agents.stock_picker import run_fundamental_check
from ..agents.timer import TimerAgent
from ..agents.debate import run_debate
from ..core.config import config
from ..services.llm_service import LLMService
from ..core.stock_service import StockService
from ..core.logging import logger
from ..analyst.depth_config import (
    AnalysisDepthController,
    normalize_depth,
    get_depth_info,
    AnalystType,
    get_all_depths_info
)
from ..reflection.reflect_generator import generate_full_reflection
from ..user_management.models import User
from ..user_management.services import MembershipService
from ..core.auth import get_current_user
from ..core.database import execute_insert
from ..analyst import MarketAnalyst, FundamentalAnalyst, NewsAnalyst


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


def save_analysis_result(user_id: int, ticker: str, result: dict) -> bool:
    """
    保存分析结果到数据库

    Args:
        user_id: 用户ID
        ticker: 股票代码
        result: 分析结果

    Returns:
        是否保存成功
    """
    try:
        import json
        from datetime import date, datetime
        
        # 获取当前日期
        analysis_date = date.today()
        
        # 获取当前时间（不带时区信息，因为数据库连接已设置时区）
        created_at = datetime.now()
        
        # 将字典转换为JSON字符串
        analysis_result_json = json.dumps(result, ensure_ascii=False)
        
        # 使用简单的 INSERT 语句，每次都创建新记录
        query = """
            INSERT INTO stock_analysis_results 
            (user_id, stock_code, analysis_date, analysis_result, created_at)
            VALUES (%s, %s, %s, %s, %s)
        """
        
        params = (
            user_id,
            ticker,
            analysis_date,
            analysis_result_json,
            created_at
        )
        
        execute_insert(query, params)
        logger.info(f"保存分析结果: 用户 {user_id}, 股票 {ticker}, 日期 {analysis_date}")
        return True
    except Exception as e:
        logger.error(f"保存分析结果失败: {e}")
        return False

router = APIRouter(prefix="/api", tags=["股票分析"])

timer_agent = TimerAgent()
stock_service = None


async def generate_target_price_and_execution_plan(stock_name: str, ticker: str, price_range: dict, signal: str, fundamental_result: dict, llm) -> tuple:
    """
    生成目标价格分析和执行计划
    
    Args:
        stock_name: 股票名称
        ticker: 股票代码
        price_range: 价格区间数据
        signal: 交易信号
        fundamental_result: 基本面分析结果
        llm: LLM客户端
    
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
        target_price_response, target_price_tokens = await llm.chat(target_price_prompt, response_format="json")
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
        - 最佳买入价格：{price_range.get('buy_range', {}).get('best_buy_price', 'N/A')}
        - 次优买入价格：{price_range.get('buy_range', {}).get('secondary_buy_price', 'N/A')}
        - 止损位：{price_range.get('buy_range', {}).get('stop_loss', 'N/A')}
        - 止盈位：{price_range.get('buy_range', {}).get('take_profit', 'N/A')}
        
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
        execution_plan_response, execution_plan_tokens = await llm.chat(execution_plan_prompt, response_format="json")
        total_tokens += execution_plan_tokens.get('total_tokens', 0)
        execution_plan = json.loads(execution_plan_response)
    except Exception as e:
        error_msg = f"生成目标价格分析和执行计划失败: {str(e)}"
        logger.error(f"生成目标价格分析和执行计划失败: {str(e)}")
        error = error_msg
        error_detail = str(e)
    
    return target_price_analysis, execution_plan, error, error_detail, total_tokens


@router.get("/analyze")
async def analyze_stock(
    ticker: str = Query(..., description="股票代码"),
    depth: int = Query(1, description="分析深度: 1-快速, 2-深度, 3-全面"),
    market_analyst: bool = Query(True, description="市场分析师"),
    fundamental_analyst: bool = Query(True, description="基本面分析师"),
    news_analyst: bool = Query(False, description="新闻分析师(暂不支持)"),
    social_analyst: bool = Query(False, description="社交媒体分析师(暂不支持)"),
    sentiment_analysis: bool = Query(True, description="情绪分析"),
    risk_assessment: bool = Query(True, description="风险评估"),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    分析股票

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
    global stock_service
    if stock_service is None:
        stock_service = StockService()

    stock_name = stock_service.get_stock_name(ticker)

    depth_controller = AnalysisDepthController(depth)
    depth_info = depth_controller.get_summary()

    logger.info(f"用户 {current_user.id} ({current_user.username}) 分析股票: {ticker} {stock_name}")
    logger.info(f"分析深度: {depth_controller.chinese_name} (等级{depth})")
    logger.info(f"分析师配置: 市场={market_analyst}, 基本面={fundamental_analyst}, 新闻=暂不支持, 社交=暂不支持")
    logger.info(f"高级选项: 情绪分析={sentiment_analysis}, 风险评估={risk_assessment}")

    market_analyst_enabled = market_analyst and depth_controller.should_enable_market_analyst(market_analyst)
    fundamental_analyst_enabled = fundamental_analyst and depth_controller.should_enable_fundamental_analyst(fundamental_analyst)
    news_analyst_enabled = False

    if not market_analyst_enabled and not fundamental_analyst_enabled and not news_analyst_enabled:
        market_analyst_enabled = True
        logger.warning(f"没有启用任何分析师，强制启用市场分析师")

    check_passed, error_msg = MembershipService.check_api_call_limit(current_user.id)
    if not check_passed:
        logger.warning(f"用户 {current_user.id} {error_msg}")
        raise HTTPException(status_code=429, detail=error_msg)

    try:
        llm = LLMService.get_user_default_client(current_user.id)
    except ValueError:
        logger.warning(f"用户 {current_user.id} 未设置LLM偏好，LLM服务不可用")
        raise HTTPException(status_code=503, detail="LLM服务不可用")
    logger.debug(f"LLM 客户端初始化完成")

    logger.debug(f"获取股票 {ticker} 的历史数据")
    data_days = depth_controller.data_days
    buffer_days = data_days + 30
    history = fetch_stock_data(ticker, days=data_days, buffer_days=buffer_days)
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

    if market_analyst_enabled:
        try:
            logger.debug(f"启动市场分析师: {ticker}")
            ma = MarketAnalyst()
            market_result, market_tokens = await ma.analyze(ticker, stock_name, history, depth, llm)
            token_usage["market_analyst"] = market_tokens
            if "error" in market_result:
                market_error = market_result["error"]
                if is_llm_error(market_error):
                    raise HTTPException(status_code=503, detail=f"LLM模型服务不可用: {market_error}")
            logger.info(f"市场分析师完成: {ticker}, 信号: {market_result.get('signal', 'N/A')}, token消耗: {market_tokens}")
        except HTTPException:
            raise
        except Exception as e:
            market_error = f"市场分析失败: {str(e)}"
            logger.error(f"市场分析师错误: {market_error}")
            if is_llm_error(str(e)):
                raise HTTPException(status_code=503, detail=f"LLM模型服务不可用: {str(e)}")

    if fundamental_analyst_enabled:
        try:
            logger.debug(f"启动基本面分析师: {ticker}")
            fa = FundamentalAnalyst()
            fundamental_result, fundamental_tokens = await fa.analyze(ticker, stock_name, depth, llm)
            token_usage["fundamental_analyst"] = fundamental_tokens
            if "error" in fundamental_result:
                fundamental_error = fundamental_result["error"]
                if is_llm_error(fundamental_error):
                    raise HTTPException(status_code=503, detail=f"LLM模型服务不可用: {fundamental_error}")
            logger.info(f"基本面分析师完成: {ticker}, token消耗: {fundamental_tokens}")
        except HTTPException:
            raise
        except Exception as e:
            fundamental_error = f"基本面分析失败: {str(e)}"
            logger.error(f"基本面分析师错误: {fundamental_error}")
            if is_llm_error(str(e)):
                raise HTTPException(status_code=503, detail=f"LLM模型服务不可用: {str(e)}")

    if news_analyst_enabled:
        try:
            logger.debug(f"启动新闻分析师: {ticker}")
            na = NewsAnalyst()
            news_result = await na.analyze(ticker, stock_name, depth, llm)
            logger.info(f"新闻分析师完成: {ticker}, 情绪: {news_result.get('sentiment', 'N/A')}")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"新闻分析师错误: {str(e)}")
            if is_llm_error(str(e)):
                raise HTTPException(status_code=503, detail=f"LLM模型服务不可用: {str(e)}")

    # 提取分析师的LLM分析结果
    market_llm_analysis = market_result.get("llm_analysis", "")
    fundamental_llm_analysis = fundamental_result.get("llm_analysis", "")
    news_llm_analysis = news_result.get("llm_analysis", "")

    timing_result = market_result.get("indicators", {})
    signal = market_result.get("signal") or "HOLD"
    technical_score = market_result.get("technical_score", 0) or 0
    fundamental_score = fundamental_result.get("score", 0) or 0

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
            logger.debug(f"启动多空辩论: {ticker}")
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
                analyst_insights=analyst_insights
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

    # 生成反思内容（亏损记录汇总）
    full_reflection = {}
    if depth >= 3:
        try:
            from datetime import date
            today_date = date.today().strftime("%Y-%m-%d")
            full_reflection = await generate_full_reflection(
                current_user.id, ticker, today_date, final_signal
            )
        except Exception as e:
            logger.error(f"生成反思汇总失败: {str(e)}")

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
                stock_name, ticker, price_range, final_signal, fundamental_result, llm
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
            "secondary_buy_price": price_range.get("buy_range", {}).get("secondary_buy_price") if final_signal == "BUY" and price_range.get("buy_range") else None,
            "best_sell_price": price_range.get("sell_range", {}).get("best_sell_price") if final_signal == "SELL" and price_range.get("sell_range") else None,
            "secondary_sell_price": price_range.get("sell_range", {}).get("secondary_sell_price") if final_signal == "SELL" and price_range.get("sell_range") else None,
            "stop_loss": (price_range.get("buy_range", {}).get("stop_loss") if final_signal == "BUY" else price_range.get("sell_range", {}).get("stop_loss")) if price_range.get("buy_range") or price_range.get("sell_range") else None,
            "take_profit": (price_range.get("buy_range", {}).get("take_profit") if final_signal == "BUY" else price_range.get("sell_range", {}).get("take_profit")) if price_range.get("buy_range") or price_range.get("sell_range") else None,
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
            "record_match": {
                "status": full_reflection.get("record_match", {}).get("status", ""),
                "currrent_direction": full_reflection.get("record_match", {}).get("currrent_direction", ""),
                "loss_record": full_reflection.get("record_match", {}).get("loss_record", ""),
                "record": full_reflection.get("record_match", {}).get("record", [])
            },
            "lessons": full_reflection.get("lessons", ""),
            "suggestion": full_reflection.get("suggestion", "")
        } if full_reflection else None,
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


@router.get("/report")
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


@router.get("/history")
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
        SELECT analysis_result, created_at 
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
            
            # 在分析结果中添加created_at字段，方便前端显示
            if isinstance(analysis_result, dict):
                if created_at:
                    # 直接使用数据库返回的时间，不做任何时区处理
                    # 数据库连接已设置为 Asia/Shanghai 时区，时间就是正确的
                    analysis_result['created_at'] = created_at.strftime('%Y-%m-%d %H:%M:%S')
                else:
                    analysis_result['created_at'] = None
            
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