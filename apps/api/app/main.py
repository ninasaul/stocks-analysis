from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.database import db_manager
from .core.scheduler import scheduler_manager
from .core.logging import logger
from .core.config import config

# 导入路由模块
from .routers.auth_routes import router as auth_router
from .routers.wechat_routes import router as wechat_router
from .routers.user_routes import router as user_management_router
from .routers.analyze_routes import router as analyze_router
from .routers.dialogue_routes import router as dialogue_router
from .routers.stock_routes import router as stock_router
from .routers.health_routes import router as health_router
from .routers.trade_routes import router as trade_router
from .routers.llm_routes import router as llm_router
from .routers.llm_admin_routes import router as llm_admin_router

app = FastAPI(title=config.APP_NAME, version=config.APP_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    """应用启动时的初始化（延迟初始化，不阻塞启动）"""
    logger.info("应用启动完成（数据库/Redis将在首次使用时延迟初始化）")

@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭时的清理"""
    if db_manager._pool is not None:
        db_manager.close()
    if scheduler_manager._scheduler_started:
        scheduler_manager.shutdown()
    logger.info("应用关闭完成")

# 注册路由
app.include_router(auth_router)
app.include_router(wechat_router)
app.include_router(user_management_router)
app.include_router(analyze_router)
app.include_router(dialogue_router)
app.include_router(stock_router)
app.include_router(trade_router)
app.include_router(health_router)
app.include_router(llm_router)
app.include_router(llm_admin_router)