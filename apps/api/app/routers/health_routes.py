"""健康检查相关的 API 路由"""
from fastapi import APIRouter

router = APIRouter(prefix="/health", tags=["健康检查"])


@router.get("")
def health() -> dict[str, str]:
    """健康检查接口"""
    return {"status": "ok"}