"""数据库连接和初始化"""
import psycopg2
from psycopg2 import pool
from contextlib import contextmanager
from typing import Generator, Optional
import os
from dotenv import load_dotenv
import logging

load_dotenv()

logger = logging.getLogger(__name__)


class DatabaseManager:
    """数据库连接管理器（单例模式）"""
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(DatabaseManager, cls).__new__(cls)
            cls._instance._pool = None
        return cls._instance

    def initialize(self):
        """初始化数据库连接池"""
        if self._pool is not None:
            return

        try:
            self._pool = pool.ThreadedConnectionPool(
                minconn=1,
                maxconn=10,
                host=os.getenv("DB_HOST", "localhost"),
                port=int(os.getenv("DB_PORT", "5432")),
                database=os.getenv("DB_NAME", "stocks_analysis"),
                user=os.getenv("DB_USER", "postgres"),
                password=os.getenv("DB_PASSWORD", "")
            )
            logger.info("数据库连接池初始化成功")
        except Exception as e:
            logger.error(f"数据库连接池初始化失败: {e}")
            raise

    def close(self):
        """关闭数据库连接池"""
        if self._pool:
            self._pool.closeall()
            self._pool = None
            logger.info("数据库连接池已关闭")

    @contextmanager
    def get_connection(self) -> Generator:
        """获取数据库连接（上下文管理器）"""
        if self._pool is None:
            self.initialize()

        conn = None
        try:
            conn = self._pool.getconn()
            yield conn
        except Exception as e:
            logger.error(f"数据库操作错误: {e}")
            if conn:
                conn.rollback()
            raise
        finally:
            if conn:
                self._pool.putconn(conn)


# 全局数据库管理器实例
db_manager = DatabaseManager()


def init_db():
    """初始化数据库连接"""
    db_manager.initialize()


def get_db():
    """获取数据库连接（用于FastAPI依赖注入）"""
    return db_manager.get_connection()


def execute_query(query: str, params: tuple = None, fetch: bool = True):
    """
    执行查询

    Args:
        query: SQL查询语句
        params: 查询参数
        fetch: 是否获取结果

    Returns:
        查询结果（如果fetch为True）
    """
    with db_manager.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query, params or ())
            if fetch:
                return cursor.fetchall()
            conn.commit()
            return None


def execute_insert(query: str, params: tuple = None) -> int:
    """
    执行插入操作并返回插入的ID

    Args:
        query: SQL插入语句
        params: 插入参数

    Returns:
        插入的记录ID
    """
    with db_manager.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query + " RETURNING id", params or ())
            result = cursor.fetchone()
            conn.commit()
            return result[0] if result else None


def execute_update(query: str, params: tuple = None) -> int:
    """
    执行更新操作并返回影响的行数

    Args:
        query: SQL更新语句
        params: 更新参数

    Returns:
        影响的行数
    """
    with db_manager.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query, params or ())
            affected = cursor.rowcount
            conn.commit()
            return affected


def execute_delete(query: str, params: tuple = None) -> int:
    """
    执行删除操作并返回影响的行数

    Args:
        query: SQL删除语句
        params: 删除参数

    Returns:
        影响的行数
    """
    with db_manager.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query, params or ())
            affected = cursor.rowcount
            conn.commit()
            return affected
