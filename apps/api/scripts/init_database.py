"""
数据库初始化脚本
用于创建所有需要的数据库表
"""
import psycopg2
from psycopg2 import sql
import sys
from typing import List, Dict
import os
from dotenv import load_dotenv

load_dotenv()


class DatabaseInitializer:
    """数据库初始化器"""

    def __init__(self, host: str = None, port: int = None, database: str = None,
                 user: str = None, password: str = None):
        """
        初始化数据库连接

        Args:
            host: 数据库主机
            port: 数据库端口
            database: 数据库名称
            user: 数据库用户
            password: 数据库密码
        """
        self.host = host or os.getenv("DB_HOST", "localhost")
        self.port = port or int(os.getenv("DB_PORT", "5432"))
        self.database = database or os.getenv("DB_NAME", "stocks_analysis")
        self.user = user or os.getenv("DB_USER", "postgres")
        self.password = password or os.getenv("DB_PASSWORD", "")
        self.connection = None

    def connect(self, db_name: str = None):
        """连接到数据库"""
        try:
            target_db = db_name or self.database
            self.connection = psycopg2.connect(
                host=self.host,
                port=self.port,
                database=target_db,
                user=self.user,
                password=self.password
            )
            self.connection.autocommit = True
            print(f"成功连接到数据库: {target_db}")
            return True
        except Exception as e:
            print(f"连接数据库失败: {e}")
            return False

    def disconnect(self):
        """断开数据库连接"""
        if self.connection:
            self.connection.close()
            print("数据库连接已关闭")

    def create_database(self):
        """创建数据库"""
        # 先连接到默认的 postgres 数据库
        if not self.connect("postgres"):
            return False
        
        try:
            # 检查数据库是否存在
            cursor = self.connection.cursor()
            cursor.execute("SELECT 1 FROM pg_database WHERE datname = %s", (self.database,))
            exists = cursor.fetchone()
            
            if not exists:
                # 创建数据库
                cursor.execute(sql.SQL("CREATE DATABASE {}").format(
                    sql.Identifier(self.database)
                ))
                print(f"成功创建数据库: {self.database}")
            else:
                print(f"数据库 {self.database} 已存在")
            
            cursor.close()
            self.disconnect()
            return True
        except Exception as e:
            print(f"创建数据库失败: {e}")
            self.disconnect()
            return False

    def execute_sql(self, sql: str, description: str = ""):
        """
        执行SQL语句

        Args:
            sql: SQL语句
            description: 操作描述
        """
        try:
            cursor = self.connection.cursor()
            cursor.execute(sql)
            print(f"✓ {description or 'SQL执行成功'}")
            cursor.close()
        except Exception as e:
            print(f"✗ {description or 'SQL执行失败'}: {e}")
            raise

    def create_users_table(self):
        """创建用户表"""
        sql = """
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            phone VARCHAR(20) UNIQUE,
            status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            display_name VARCHAR(100),
            avatar_url VARCHAR(255)
        );

        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
        CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
        CREATE INDEX IF NOT EXISTS idx_users_display_name ON users(display_name);
        """
        self.execute_sql(sql, "创建用户表")

    def create_memberships_table(self):
        """创建会员表"""
        sql = """
        CREATE TABLE IF NOT EXISTS memberships (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            type VARCHAR(30) NOT NULL CHECK (type IN ('normal', 'premium_monthly', 'premium_quarterly', 'premium_yearly')),
            start_date TIMESTAMP NOT NULL,
            end_date TIMESTAMP,
            api_call_limit INTEGER NOT NULL,
            api_call_used INTEGER DEFAULT 0,
            status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_memberships_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON memberships(user_id);
        CREATE INDEX IF NOT EXISTS idx_memberships_type ON memberships(type);
        CREATE INDEX IF NOT EXISTS idx_memberships_status ON memberships(status);
        CREATE INDEX IF NOT EXISTS idx_memberships_end_date ON memberships(end_date);
        """
        self.execute_sql(sql, "创建会员表")

    def create_api_call_logs_table(self):
        """创建API调用日志表"""
        sql = """
        CREATE TABLE IF NOT EXISTS api_call_logs (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            endpoint VARCHAR(100) NOT NULL,
            method VARCHAR(10) NOT NULL,
            call_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            response_status INTEGER,
            CONSTRAINT fk_api_call_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_api_call_logs_user_id ON api_call_logs(user_id);
        CREATE INDEX IF NOT EXISTS idx_api_call_logs_call_time ON api_call_logs(call_time);
        CREATE INDEX IF NOT EXISTS idx_api_call_logs_endpoint ON api_call_logs(endpoint);
        """
        self.execute_sql(sql, "创建API调用日志表")

    def create_refresh_tokens_table(self):
        """创建刷新令牌表"""
        sql = """
        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            token TEXT NOT NULL UNIQUE,
            expires_at TIMESTAMP NOT NULL,
            status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
        CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
        CREATE INDEX IF NOT EXISTS idx_refresh_tokens_status ON refresh_tokens(status);
        CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
        """
        self.execute_sql(sql, "创建刷新令牌表")

    def create_token_blacklist_table(self):
        """创建令牌黑名单表"""
        sql = """
        CREATE TABLE IF NOT EXISTS token_blacklist (
            id SERIAL PRIMARY KEY,
            token TEXT NOT NULL UNIQUE,
            token_type VARCHAR(20) NOT NULL CHECK (token_type IN ('access', 'refresh')),
            user_id INTEGER NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_token_blacklist_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_token_blacklist_token ON token_blacklist(token);
        CREATE INDEX IF NOT EXISTS idx_token_blacklist_user_id ON token_blacklist(user_id);
        CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires_at ON token_blacklist(expires_at);
        """
        self.execute_sql(sql, "创建令牌黑名单表")

    def create_wechat_users_table(self):
        """创建微信用户关联表"""
        sql = """
        CREATE TABLE IF NOT EXISTS wechat_users (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            openid VARCHAR(100) UNIQUE NOT NULL,
            unionid VARCHAR(100),
            nickname VARCHAR(100),
            avatar_url VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_wechat_users_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_wechat_users_user_id ON wechat_users(user_id);
        CREATE INDEX IF NOT EXISTS idx_wechat_users_openid ON wechat_users(openid);
        CREATE INDEX IF NOT EXISTS idx_wechat_users_unionid ON wechat_users(unionid);
        """
        self.execute_sql(sql, "创建微信用户关联表")

    def create_stock_analysis_results_table(self):
        """创建股票分析结果表"""
        sql = """
        CREATE TABLE IF NOT EXISTS stock_analysis_results (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            stock_code VARCHAR(20) NOT NULL,
            analysis_date DATE NOT NULL,
            analysis_result JSONB NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_stock_analysis_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_stock_analysis_user_date ON stock_analysis_results(user_id, analysis_date);
        CREATE INDEX IF NOT EXISTS idx_stock_analysis_stock_date ON stock_analysis_results(stock_code, analysis_date);
        """
        self.execute_sql(sql, "创建股票分析结果表")

    def create_user_stock_watchlist_table(self):
        """创建用户股票跟踪池表"""
        sql = """
        CREATE TABLE IF NOT EXISTS user_stock_watchlist (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            stock_code VARCHAR(20) NOT NULL,
            stock_name VARCHAR(100) NOT NULL,
            exchange VARCHAR(20),
            market VARCHAR(20),
            added_date DATE NOT NULL DEFAULT CURRENT_DATE,
            ended_date DATE NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_watchlist_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT uq_watchlist_user_stock UNIQUE (user_id, stock_code)
        );

        CREATE INDEX IF NOT EXISTS idx_watchlist_user_id ON user_stock_watchlist(user_id);
        CREATE INDEX IF NOT EXISTS idx_watchlist_stock_code ON user_stock_watchlist(stock_code);
        """
        self.execute_sql(sql, "创建用户股票跟踪池表")

    def create_all_tables(self):
        """创建所有表"""
        print("\n开始创建数据库表...")
        print("=" * 50)

        self.create_users_table()
        self.create_memberships_table()
        self.create_api_call_logs_table()
        self.create_refresh_tokens_table()
        self.create_token_blacklist_table()
        self.create_wechat_users_table()
        self.create_stock_analysis_results_table()
        self.create_user_stock_watchlist_table()
        self.apply_schema_patches()

        print("=" * 50)
        print("所有表创建完成！\n")

    def apply_schema_patches(self):
        """
        对已存在的库做幂等补丁，保证旧环境也具备最新字段与索引。
        """
        sql = """
        ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(100);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(255);
        CREATE INDEX IF NOT EXISTS idx_users_display_name ON users(display_name);

        -- 删除stock_analysis_results表中的唯一约束（如果存在）
        ALTER TABLE stock_analysis_results DROP CONSTRAINT IF EXISTS stock_analysis_results_user_id_stock_code_analysis_date_key;
        
        -- 修改created_at字段为带时区的TIMESTAMP WITH TIME ZONE
        ALTER TABLE stock_analysis_results ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE USING created_at AT TIME ZONE 'Asia/Shanghai';
        """
        self.execute_sql(sql, "应用数据库结构补丁（仅加列/索引，不做历史数据回填）")

    def drop_all_tables(self):
        """删除所有表（慎用！）"""
        print("\n警告：即将删除所有表！")
        confirm = input("确认删除所有表？(yes/no): ")
        if confirm.lower() != 'yes':
            print("操作已取消")
            return

        sql = """
        DROP TABLE IF EXISTS user_stock_watchlist CASCADE;
        DROP TABLE IF EXISTS stock_analysis_results CASCADE;
        DROP TABLE IF EXISTS wechat_users CASCADE;
        DROP TABLE IF EXISTS token_blacklist CASCADE;
        DROP TABLE IF EXISTS refresh_tokens CASCADE;
        DROP TABLE IF EXISTS api_call_logs CASCADE;
        DROP TABLE IF EXISTS memberships CASCADE;
        DROP TABLE IF EXISTS users CASCADE;
        """
        self.execute_sql(sql, "删除所有表")

    def show_tables(self):
        """显示所有表"""
        sql = """
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name;
        """
        try:
            cursor = self.connection.cursor()
            cursor.execute(sql)
            tables = cursor.fetchall()
            print("\n数据库中的表：")
            print("-" * 30)
            for table in tables:
                print(f"  - {table[0]}")
            print("-" * 30)
            cursor.close()
        except Exception as e:
            print(f"查询表失败: {e}")

    def get_table_info(self, table_name: str):
        """获取表结构信息"""
        sql = """
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = %s
        ORDER BY ordinal_position;
        """
        try:
            cursor = self.connection.cursor()
            cursor.execute(sql, (table_name,))
            columns = cursor.fetchall()
            print(f"\n表 {table_name} 的结构：")
            print("-" * 70)
            print(f"{'列名':<20} {'数据类型':<20} {'可空':<10} {'默认值':<20}")
            print("-" * 70)
            for col in columns:
                nullable = "是" if col[2] == 'YES' else "否"
                default = str(col[3]) if col[3] else ""
                print(f"{col[0]:<20} {col[1]:<20} {nullable:<10} {default:<20}")
            print("-" * 70)
            cursor.close()
        except Exception as e:
            print(f"查询表结构失败: {e}")


def main():
    """主函数"""
    print("=" * 50)
    print("数据库初始化脚本")
    print("=" * 50)

    # 从环境变量读取配置
    host = os.getenv("DB_HOST", "localhost")
    port = os.getenv("DB_PORT", "5432")
    database = os.getenv("DB_NAME", "stocks_analysis")
    user = os.getenv("DB_USER", "postgres")
    password = os.getenv("DB_PASSWORD", "")

    print(f"\n数据库配置：")
    print(f"  主机: {host}")
    print(f"  端口: {port}")
    print(f"  数据库: {database}")
    print(f"  用户: {user}")
    print(f"  密码: {'*' * len(password) if password else '(未设置)'}")

    # 创建初始化器
    initializer = DatabaseInitializer(host, port, database, user, password)

    # 创建数据库
    if not initializer.create_database():
        print("创建数据库失败，无法继续")
        sys.exit(1)

    # 连接到目标数据库
    if not initializer.connect():
        sys.exit(1)

    try:
        # 显示菜单
        while True:
            print("\n请选择操作：")
            print("  1. 创建所有表")
            print("  2. 删除所有表（慎用！）")
            print("  3. 显示所有表")
            print("  4. 查看表结构")
            print("  5. 退出")

            choice = input("\n请输入选项 (1-5): ").strip()

            if choice == '1':
                initializer.create_all_tables()
            elif choice == '2':
                initializer.drop_all_tables()
            elif choice == '3':
                initializer.show_tables()
            elif choice == '4':
                table_name = input("请输入表名: ").strip()
                if table_name:
                    initializer.get_table_info(table_name)
            elif choice == '5':
                print("退出程序")
                break
            else:
                print("无效选项，请重新输入")

    finally:
        initializer.disconnect()


if __name__ == "__main__":
    main()
