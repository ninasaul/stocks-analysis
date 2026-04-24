"""股票相关的 API 路由"""
from fastapi import APIRouter, Query, Depends

from ..core.stock_service import StockService
from ..core.logging import logger
from ..user_management.models import User
from ..core.auth import get_current_user

router = APIRouter(prefix="/api/stocks", tags=["股票"])

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