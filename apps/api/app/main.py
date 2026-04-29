from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .user_management import init_db
from .core.database import db_manager
from .core.scheduler import scheduler_manager
from .core.stock_service import StockService
from .core.logging import logger
from .core.config import config
from .llm.llm_service import LLMService

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

# 初始化数据库
@app.on_event("startup")
async def startup_event():
    """应用启动时的初始化"""
    init_db()
    scheduler_manager.start()
    global stock_service
    stock_service = StockService()
    logger.info("数据库连接已初始化")

    count = LLMService.init_llm_presets_from_config()
    if count > 0:
        logger.info(f"从环境变量初始化了 {count} 个LLM预设")

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
app.include_router(analyze_router)
app.include_router(dialogue_router)
app.include_router(stock_router)
app.include_router(trade_router)
app.include_router(health_router)
app.include_router(llm_router)
app.include_router(llm_admin_router)

# 全局实例
stock_service = None