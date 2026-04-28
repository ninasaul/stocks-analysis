"""股票相关的 API 路由"""
from fastapi import APIRouter, Query, Depends, HTTPException
from pydantic import BaseModel

from ..core.stock_service import StockService
from ..core.logging import logger
from ..user_management.models import User
from ..core.auth import get_current_user

router = APIRouter(prefix="/api/stocks", tags=["股票操作"])


class AddToWatchlistRequest(BaseModel):
    """添加到跟踪池请求"""
    stock_code: str
    stock_name: str
    exchange: str = None
    market: str = None
    ended_date: str = None

stock_service = None


@router.get("/search")
def search_stocks(
    keyword: str = Query(..., min_length=1, description="股票代码或名称关键字"),
    limit: int = Query(6, ge=1, le=100, description="返回结果数量上限"),
    current_user: User = Depends(get_current_user)
) -> dict:
    """股票模糊搜索，数据来源为 data/stock_info.csv"""
    global stock_service
    if stock_service is None:
        stock_service = StockService()

    logger.info(
        f"用户 {current_user.id} ({current_user.username}) 搜索股票: "
        f"keyword={keyword}, limit={limit}"
    )
    stocks = stock_service.search_stocks_from_csv(keyword=keyword, limit=limit)
    return {
        "keyword": keyword,
        "count": len(stocks),
        "stocks": stocks
    }


@router.get("/analyzed")
def get_analyzed_stocks(
    current_user: User = Depends(get_current_user)
) -> dict:
    """获取用户分析过的股票列表，按分析时间从近及远排序"""
    logger.info(
        f"用户 {current_user.id} ({current_user.username}) 获取已分析股票列表"
    )

    try:
        from ..core.database import execute_query
        import json

        # 从数据库获取用户分析过的股票，按分析时间从近及远排序
        query = """
        SELECT DISTINCT ON (sar.stock_code)
            sar.stock_code,
            sar.analysis_result,
            sar.created_at
        FROM stock_analysis_results sar
        WHERE sar.user_id = %s
        ORDER BY sar.stock_code, sar.created_at DESC
        """

        results = execute_query(query, (current_user.id,))

        # 按时间从近及远排序
        results.sort(key=lambda x: x[2], reverse=True)

        stocks = []
        for row in results:
            stock_code = row[0]
            analysis_result_json = row[1]
            created_at = row[2]

            # 解析分析结果获取股票名称
            stock_name = "未知股票"
            try:
                if isinstance(analysis_result_json, str):
                    analysis_result = json.loads(analysis_result_json)
                else:
                    analysis_result = analysis_result_json

                stock_info = analysis_result.get('stock_info', {})
                stock_name = stock_info.get('name', '未知股票')
            except Exception as e:
                logger.warning(f"解析股票名称失败 {stock_code}: {e}")

            stocks.append({
                "code": stock_code,
                "name": stock_name,
                "last_analyzed_at": created_at.isoformat() if created_at else None
            })

        return {
            "count": len(stocks),
            "stocks": stocks
        }

    except Exception as e:
        logger.error(f"获取已分析股票列表失败: {e}")
        return {
            "count": 0,
            "stocks": [],
            "error": str(e)
        }


@router.delete("/analyzed/{ticker}")
def delete_analyzed_stock(
    ticker: str,
    current_user: User = Depends(get_current_user)
) -> dict:
    """删除用户指定股票的分析记录"""
    logger.info(
        f"用户 {current_user.id} ({current_user.username}) 删除股票 {ticker} 的分析记录"
    )

    try:
        from ..core.database import execute_query

        # 删除该用户指定股票的所有分析记录
        query = """
        DELETE FROM stock_analysis_results
        WHERE user_id = %s AND stock_code = %s
        """

        # 执行删除操作
        execute_query(query, (current_user.id, ticker), fetch=False)

        logger.info(f"成功删除股票 {ticker} 的分析记录")

        return {
            "success": True,
            "ticker": ticker,
            "message": f"成功删除 {ticker} 的分析记录"
        }

    except Exception as e:
        logger.error(f"删除分析记录失败: {e}")
        return {
            "success": False,
            "ticker": ticker,
            "error": str(e)
        }


@router.post("/watchlist")
def add_to_watchlist(
    request: AddToWatchlistRequest,
    current_user: User = Depends(get_current_user)
) -> dict:
    """添加股票到交易跟踪池"""
    logger.info(
        f"用户 {current_user.id} ({current_user.username}) 添加股票 {request.stock_code} 到跟踪池"
    )

    try:
        from ..core.database import execute_query

        # 检查股票是否已经在交易跟踪池中
        check_query = """
        SELECT id FROM user_stock_watchlist
        WHERE user_id = %s AND stock_code = %s
        """
        existing = execute_query(check_query, (current_user.id, request.stock_code))

        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"股票 {request.stock_code} 已在跟踪池中"
            )

        # 插入新记录
        insert_query = """
        INSERT INTO user_stock_watchlist (user_id, stock_code, stock_name, exchange, market, ended_date)
        VALUES (%s, %s, %s, %s, %s, %s)
        """

        # 执行插入操作
        execute_query(
            insert_query,
            (current_user.id, request.stock_code, request.stock_name,
             request.exchange, request.market, request.ended_date),
            fetch=False
        )

        # 重新查询获取添加的记录
        get_query = """
        SELECT id, added_date
        FROM user_stock_watchlist
        WHERE user_id = %s AND stock_code = %s
        ORDER BY added_date DESC
        LIMIT 1
        """
        result = execute_query(get_query, (current_user.id, request.stock_code))

        if result:
            record_id = result[0][0]
            added_date = result[0][1]

            return {
                "success": True,
                "message": "股票已添加到跟踪池",
                "data": {
                    "id": record_id,
                    "stock_code": request.stock_code,
                    "stock_name": request.stock_name,
                    "exchange": request.exchange,
                    "market": request.market,
                    "added_date": added_date.isoformat() if added_date else None,
                    "ended_date": request.ended_date
                }
            }
        else:
            raise HTTPException(
                status_code=500,
                detail="添加股票失败"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"添加股票到跟踪池失败: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"添加股票失败: {str(e)}"
        )


@router.get("/watchlist")
def get_watchlist(
    current_user: User = Depends(get_current_user)
) -> dict:
    """获取用户跟踪池列表"""
    logger.info(
        f"用户 {current_user.id} ({current_user.username}) 获取跟踪池列表"
    )

    try:
        from ..core.database import execute_query

        # 获取用户的跟踪池列表
        query = """
        SELECT id, stock_code, stock_name, exchange, market, added_date, ended_date
        FROM user_stock_watchlist
        WHERE user_id = %s
        ORDER BY added_date DESC
        """

        results = execute_query(query, (current_user.id,))

        stocks = []
        for row in results:
            stocks.append({
                "id": row[0],
                "stock_code": row[1],
                "stock_name": row[2],
                "exchange": row[3],
                "market": row[4],
                "added_date": row[5].isoformat() if row[5] else None,
                "ended_date": row[6].isoformat() if row[6] else None
            })

        return {
            "count": len(stocks),
            "stocks": stocks
        }

    except Exception as e:
        logger.error(f"获取跟踪池列表失败: {e}")
        return {
            "count": 0,
            "stocks": [],
            "error": str(e)
        }


@router.delete("/watchlist/{stock_code}")
def delete_from_watchlist(
    stock_code: str,
    current_user: User = Depends(get_current_user)
) -> dict:
    """从跟踪池删除股票"""
    logger.info(
        f"用户 {current_user.id} ({current_user.username}) 从跟踪池删除股票 {stock_code}"
    )

    try:
        from ..core.database import execute_query

        # 删除指定股票
        query = """
        DELETE FROM user_stock_watchlist
        WHERE user_id = %s AND stock_code = %s
        """

        execute_query(query, (current_user.id, stock_code), fetch=False)

        return {
            "success": True,
            "message": "股票已从跟踪池移除"
        }

    except Exception as e:
        logger.error(f"从跟踪池删除股票失败: {e}")
        return {
            "success": False,
            "error": str(e)
        }


@router.get("/watchlist/{stock_code}/exists")
def check_stock_in_watchlist(
    stock_code: str,
    current_user: User = Depends(get_current_user)
) -> dict:
    """检查股票是否在跟踪池中"""
    logger.info(
        f"用户 {current_user.id} ({current_user.username}) 检查股票 {stock_code} 是否在跟踪池中"
    )

    try:
        from ..core.database import execute_query

        # 查询股票是否存在
        query = """
        SELECT id, stock_code, stock_name, exchange, market, added_date, ended_date
        FROM user_stock_watchlist
        WHERE user_id = %s AND stock_code = %s
        """

        result = execute_query(query, (current_user.id, stock_code))

        if result:
            row = result[0]
            return {
                "exists": True,
                "stock": {
                    "id": row[0],
                    "stock_code": row[1],
                    "stock_name": row[2],
                    "exchange": row[3],
                    "market": row[4],
                    "added_date": row[5].isoformat() if row[5] else None,
                    "ended_date": row[6].isoformat() if row[6] else None
                }
            }
        else:
            return {
                "exists": False,
                "stock": None
            }

    except Exception as e:
        logger.error(f"检查跟踪池股票失败: {e}")
        return {
            "exists": False,
            "error": str(e)
        }


class AddToPortfolioRequest(BaseModel):
    """添加到自选股请求"""
    stock_code: str
    stock_name: str
    exchange: str = None
    market: str = None


@router.post("/portfolio")
def add_to_portfolio(
    request: AddToPortfolioRequest,
    current_user: User = Depends(get_current_user)
) -> dict:
    """添加股票到自选股"""
    logger.info(
        f"用户 {current_user.id} ({current_user.username}) 添加股票 {request.stock_code} 到自选股"
    )

    try:
        from ..core.database import execute_query

        # 检查股票是否已经在自选股中
        check_query = """
        SELECT id FROM user_stock_portfolio
        WHERE user_id = %s AND stock_code = %s
        """
        existing = execute_query(check_query, (current_user.id, request.stock_code))

        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"股票 {request.stock_code} 已在自选股中"
            )

        # 插入新记录
        insert_query = """
        INSERT INTO user_stock_portfolio (user_id, stock_code, stock_name, exchange, market)
        VALUES (%s, %s, %s, %s, %s)
        """

        # 执行插入操作
        execute_query(
            insert_query,
            (current_user.id, request.stock_code, request.stock_name,
             request.exchange, request.market),
            fetch=False
        )

        # 重新查询获取添加的记录
        get_query = """
        SELECT id, added_date
        FROM user_stock_portfolio
        WHERE user_id = %s AND stock_code = %s
        ORDER BY added_date DESC
        LIMIT 1
        """
        result = execute_query(get_query, (current_user.id, request.stock_code))

        if result:
            record_id = result[0][0]
            added_date = result[0][1]

            return {
                "success": True,
                "message": "股票已添加到自选股",
                "data": {
                    "id": record_id,
                    "stock_code": request.stock_code,
                    "stock_name": request.stock_name,
                    "exchange": request.exchange,
                    "market": request.market,
                    "added_date": added_date.isoformat() if added_date else None
                }
            }
        else:
            raise HTTPException(
                status_code=500,
                detail="添加股票失败"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"添加股票到自选股失败: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"添加股票失败: {str(e)}"
        )


@router.get("/portfolio")
def get_portfolio(
    current_user: User = Depends(get_current_user)
) -> dict:
    """获取用户自选股列表"""
    logger.info(
        f"用户 {current_user.id} ({current_user.username}) 获取自选股列表"
    )

    try:
        from ..core.database import execute_query

        # 获取用户的自选股列表
        query = """
        SELECT id, stock_code, stock_name, exchange, market, added_date
        FROM user_stock_portfolio
        WHERE user_id = %s
        ORDER BY added_date DESC
        """

        results = execute_query(query, (current_user.id,))

        stocks = []
        for row in results:
            stocks.append({
                "id": row[0],
                "stock_code": row[1],
                "stock_name": row[2],
                "exchange": row[3],
                "market": row[4],
                "added_date": row[5].isoformat() if row[5] else None
            })

        return {
            "count": len(stocks),
            "stocks": stocks
        }

    except Exception as e:
        logger.error(f"获取自选股列表失败: {e}")
        return {
            "count": 0,
            "stocks": [],
            "error": str(e)
        }


@router.delete("/portfolio/{stock_code}")
def delete_from_portfolio(
    stock_code: str,
    current_user: User = Depends(get_current_user)
) -> dict:
    """从自选股删除股票"""
    logger.info(
        f"用户 {current_user.id} ({current_user.username}) 从自选股删除股票 {stock_code}"
    )

    try:
        from ..core.database import execute_query

        # 删除指定股票
        query = """
        DELETE FROM user_stock_portfolio
        WHERE user_id = %s AND stock_code = %s
        """

        execute_query(query, (current_user.id, stock_code), fetch=False)

        return {
            "success": True,
            "message": "股票已从自选股移除"
        }

    except Exception as e:
        logger.error(f"从自选股删除股票失败: {e}")
        return {
            "success": False,
            "error": str(e)
        }


@router.get("/portfolio/{stock_code}/exists")
def check_stock_in_portfolio(
    stock_code: str,
    current_user: User = Depends(get_current_user)
) -> dict:
    """检查股票是否在自选股中"""
    logger.info(
        f"用户 {current_user.id} ({current_user.username}) 检查股票 {stock_code} 是否在自选股中"
    )

    try:
        from ..core.database import execute_query

        # 查询股票是否存在
        query = """
        SELECT id, stock_code, stock_name, exchange, market, added_date
        FROM user_stock_portfolio
        WHERE user_id = %s AND stock_code = %s
        """

        result = execute_query(query, (current_user.id, stock_code))

        if result:
            row = result[0]
            return {
                "exists": True,
                "stock": {
                    "id": row[0],
                    "stock_code": row[1],
                    "stock_name": row[2],
                    "exchange": row[3],
                    "market": row[4],
                    "added_date": row[5].isoformat() if row[5] else None
                }
            }
        else:
            return {
                "exists": False,
                "stock": None
            }

    except Exception as e:
        logger.error(f"检查自选股股票失败: {e}")
        return {
            "exists": False,
            "error": str(e)
        }