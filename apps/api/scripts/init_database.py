"""
数据库初始化脚本
用于创建所有需要的数据库表
支持API Key加密存储和密钥轮换
"""
import psycopg2
from psycopg2 import sql
import sys
from typing import List, Dict
import os
from dotenv import load_dotenv

load_dotenv()

# 加密相关常量
ENCRYPTION_KEY_ENV = "DB_ENCRYPTION_KEY"


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
            print(f"[OK] {description or 'SQL执行成功'}")
            cursor.close()
        except Exception as e:
            print(f"[ERROR] {description or 'SQL执行失败'}: {e}")
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
        # Base table first so IF NOT EXISTS does not skip record_id/backfill steps on legacy schemas.
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

        ALTER TABLE stock_analysis_results ADD COLUMN IF NOT EXISTS record_id VARCHAR(36);

        CREATE INDEX IF NOT EXISTS idx_stock_analysis_user_date ON stock_analysis_results(user_id, analysis_date);
        CREATE INDEX IF NOT EXISTS idx_stock_analysis_stock_date ON stock_analysis_results(stock_code, analysis_date);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_analysis_record_id ON stock_analysis_results(record_id);
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

    def create_user_stock_portfolio_table(self):
        """创建用户自选股表"""
        sql = """
        CREATE TABLE IF NOT EXISTS user_stock_portfolio (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            stock_code VARCHAR(20) NOT NULL,
            stock_name VARCHAR(100) NOT NULL,
            exchange VARCHAR(20),
            market VARCHAR(20),
            added_date DATE NOT NULL DEFAULT CURRENT_DATE,
            CONSTRAINT fk_portfolio_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT uq_portfolio_user_stock UNIQUE (user_id, stock_code)
        );

        CREATE INDEX IF NOT EXISTS idx_portfolio_user_id ON user_stock_portfolio(user_id);
        CREATE INDEX IF NOT EXISTS idx_portfolio_stock_code ON user_stock_portfolio(stock_code);
        """
        self.execute_sql(sql, "创建用户自选股表")

    def create_dialogue_sessions_table(self):
        """创建对话会话表"""
        sql = """
        CREATE TABLE IF NOT EXISTS dialogue_sessions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            session_id VARCHAR(100) NOT NULL,
            topic VARCHAR(200) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_dialogue_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT uq_user_session UNIQUE (user_id, session_id)
        );

        CREATE INDEX IF NOT EXISTS idx_dialogue_user_id ON dialogue_sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_dialogue_session_id ON dialogue_sessions(session_id);
        """
        self.execute_sql(sql, "创建对话会话表")

    def create_dialogue_messages_table(self):
        """创建对话消息表"""
        sql = """
        CREATE TABLE IF NOT EXISTS dialogue_messages (
            id SERIAL PRIMARY KEY,
            session_id INTEGER NOT NULL,
            role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
            content TEXT NOT NULL,
            timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_message_session FOREIGN KEY (session_id) REFERENCES dialogue_sessions(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_message_session_id ON dialogue_messages(session_id);
        CREATE INDEX IF NOT EXISTS idx_message_timestamp ON dialogue_messages(timestamp);
        """
        self.execute_sql(sql, "创建对话消息表")

    def enable_pgcrypto(self):
        """启用pgcrypto扩展用于加密"""
        sql = "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
        self.execute_sql(sql, "启用pgcrypto加密扩展")

    def create_llm_presets_table(self):
        """创建预定义LLM模型表（支持加密存储API Key）"""
        sql = """
        CREATE TABLE IF NOT EXISTS llm_presets (
            id SERIAL PRIMARY KEY,
            name VARCHAR(50) NOT NULL UNIQUE,
            display_name VARCHAR(100) NOT NULL,
            api_key BYTEA,
            base_url VARCHAR(500) NOT NULL,
            default_model VARCHAR(100) NOT NULL,
            models JSONB DEFAULT '[]',
            is_active BOOLEAN DEFAULT true,
            is_system BOOLEAN DEFAULT false,
            provider VARCHAR(50) DEFAULT 'custom',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_llm_presets_name ON llm_presets(name);
        CREATE INDEX IF NOT EXISTS idx_llm_presets_is_active ON llm_presets(is_active);
        """
        self.execute_sql(sql, "创建预定义LLM模型表（支持加密）")

    def create_user_llm_configs_table(self):
        """创建用户自定义LLM配置表（支持加密存储API Key）"""
        sql = """
        CREATE TABLE IF NOT EXISTS user_llm_configs (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            name VARCHAR(50) NOT NULL,
            provider VARCHAR(50),
            api_key BYTEA NOT NULL,
            base_url VARCHAR(500) NOT NULL,
            model VARCHAR(100) NOT NULL,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_user_llm_configs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT uq_user_llm_config_name UNIQUE (user_id, name)
        );

        CREATE INDEX IF NOT EXISTS idx_user_llm_configs_user_id ON user_llm_configs(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_llm_configs_is_active ON user_llm_configs(is_active);
        """
        self.execute_sql(sql, "创建用户自定义LLM配置表（支持加密）")

    def create_user_llm_usage_table(self):
        """创建用户LLM使用量统计表"""
        sql = """
        CREATE TABLE IF NOT EXISTS user_llm_usage (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            preset_id INTEGER REFERENCES llm_presets(id) ON DELETE SET NULL,
            user_config_id INTEGER REFERENCES user_llm_configs(id) ON DELETE SET NULL,
            provider VARCHAR(50),
            model VARCHAR(100) NOT NULL,
            prompt_tokens INTEGER DEFAULT 0,
            completion_tokens INTEGER DEFAULT 0,
            total_tokens INTEGER DEFAULT 0,
            called_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_user_llm_usage_user_id ON user_llm_usage(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_llm_usage_called_at ON user_llm_usage(called_at);
        """
        self.execute_sql(sql, "创建用户LLM使用量统计表")

    def create_user_llm_preferences_table(self):
        """创建用户LLM偏好表"""
        sql = """
        CREATE TABLE IF NOT EXISTS user_llm_preferences (
            user_id INTEGER PRIMARY KEY,
            preset_id INTEGER REFERENCES llm_presets(id) ON DELETE SET NULL,
            user_config_id INTEGER REFERENCES user_llm_configs(id) ON DELETE SET NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_user_llm_preferences_preset ON user_llm_preferences(preset_id);
        CREATE INDEX IF NOT EXISTS idx_user_llm_preferences_config ON user_llm_preferences(user_config_id);
        """
        self.execute_sql(sql, "创建用户LLM偏好表")

    def create_admins_table(self):
        """创建管理员表"""
        sql = """
        CREATE TABLE IF NOT EXISTS admins (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL UNIQUE,
            role VARCHAR(50) NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin')),
            permissions JSONB DEFAULT '[]',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_admins_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_admins_user_id ON admins(user_id);
        CREATE INDEX IF NOT EXISTS idx_admins_role ON admins(role);
        """
        self.execute_sql(sql, "创建管理员表")

    def create_all_tables(self):
        """创建所有表"""
        print("\n开始创建数据库表...")
        print("=" * 50)

        # 先启用加密扩展
        self.enable_pgcrypto()
        
        # 定义要创建的表列表
        tables_to_create = [
            ("users", self.create_users_table),
            ("memberships", self.create_memberships_table),
            ("admins", self.create_admins_table),
            ("api_call_logs", self.create_api_call_logs_table),
            ("refresh_tokens", self.create_refresh_tokens_table),
            ("token_blacklist", self.create_token_blacklist_table),
            ("wechat_users", self.create_wechat_users_table),
            ("stock_analysis_results", self.create_stock_analysis_results_table),
            ("user_stock_watchlist", self.create_user_stock_watchlist_table),
            ("user_stock_portfolio", self.create_user_stock_portfolio_table),
            ("dialogue_sessions", self.create_dialogue_sessions_table),
            ("dialogue_messages", self.create_dialogue_messages_table),
            ("llm_presets", self.create_llm_presets_table),
            ("user_llm_configs", self.create_user_llm_configs_table),
            ("user_llm_usage", self.create_user_llm_usage_table),
            ("user_llm_preferences", self.create_user_llm_preferences_table)
        ]
        
        # 创建所有表
        created_tables = []
        for table_name, create_func in tables_to_create:
            try:
                create_func()
                created_tables.append(table_name)
                print(f"[OK] 创建表: {table_name}")
            except Exception as e:
                print(f"[ERROR] 创建表 {table_name} 失败: {e}")
        
        # 应用数据库结构补丁
        self.apply_schema_patches()

        print("=" * 50)
        print(f"所有表创建完成！共创建 {len(created_tables)} 个表")
        print(f"已创建的表: {', '.join(created_tables)}\n")

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

        -- 添加record_id字段用于唯一标识分析记录
        ALTER TABLE stock_analysis_results ADD COLUMN IF NOT EXISTS record_id VARCHAR(36);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_analysis_record_id ON stock_analysis_results(record_id);

        -- 为旧记录生成UUID
        UPDATE stock_analysis_results SET record_id = gen_random_uuid()::VARCHAR WHERE record_id IS NULL;

        -- 添加llm_presets表的models列
        ALTER TABLE llm_presets ADD COLUMN IF NOT EXISTS models JSONB DEFAULT '[]';

        -- 添加provider字段（用于替代原来用name字段存储provider的做法）
        ALTER TABLE llm_presets ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'custom';

        -- 删除config字段（冗余字段，已不再使用）
        ALTER TABLE llm_presets DROP COLUMN IF EXISTS config;

        -- 添加user_llm_configs表的provider字段
        ALTER TABLE user_llm_configs ADD COLUMN IF NOT EXISTS provider VARCHAR(50);

        -- 删除user_llm_configs表的config字段（冗余字段，已不再使用）
        ALTER TABLE user_llm_configs DROP COLUMN IF EXISTS config;

        -- 删除user_llm_usage表的cost字段（冗余字段，已不再使用）
        ALTER TABLE user_llm_usage DROP COLUMN IF EXISTS cost;
        """
        self.execute_sql(sql, "应用数据库结构补丁（仅加列/索引，不做历史数据回填）")
        
        # 执行数据迁移：将旧的name值迁移到provider字段（仅当provider为默认值时）
        self.migrate_provider_data()

    def migrate_provider_data(self):
        """
        迁移provider字段数据：将旧的name值迁移到新的provider字段
        这是因为之前的设计中，name字段同时承担了配置名称和provider的双重职责
        现在需要将原来存储在name中的provider值迁移到新的provider字段
        """
        print("\n检查并迁移provider字段数据...")
        print("-" * 50)
        
        cursor = self.connection.cursor()
        
        try:
            # 检查llm_presets表是否存在provider字段
            cursor.execute("""
                SELECT COUNT(*) 
                FROM information_schema.columns 
                WHERE table_name = 'llm_presets' AND column_name = 'provider'
            """)
            if cursor.fetchone()[0] == 0:
                print("llm_presets表不存在provider字段，跳过数据迁移")
                return
            
            # 检查是否有需要迁移的数据（provider为默认值'custom'且name不是配置名格式）
            cursor.execute("""
                SELECT id, name, provider 
                FROM llm_presets 
                WHERE provider = 'custom' OR provider IS NULL
            """)
            rows = cursor.fetchall()
            
            if not rows:
                print("没有需要迁移的provider数据")
                return
            
            print(f"发现 {len(rows)} 条记录需要迁移provider数据")
            
            # 定义旧name值到新provider值的映射
            # 原来的name字段存储的是provider值，现在需要迁移到新字段
            provider_mapping = {
                'aliyun': 'aliyun',
                'deepseek': 'deepseek',
                'openai': 'openai',
                'volcengine': 'volcengine',
                'qwen': 'aliyun',
                'qwen_config': 'aliyun',
                'deepseek_config': 'deepseek'
            }
            
            migrated_count = 0
            for row in rows:
                preset_id, old_name, current_provider = row
                # 根据旧name值确定新的provider值
                new_provider = provider_mapping.get(old_name.lower(), 'custom')
                
                if new_provider != 'custom':
                    cursor.execute("""
                        UPDATE llm_presets 
                        SET provider = %s 
                        WHERE id = %s
                    """, (new_provider, preset_id))
                    migrated_count += 1
                    print(f"迁移记录 ID={preset_id}: name='{old_name}' -> provider='{new_provider}'")
            
            if migrated_count > 0:
                self.connection.commit()
                print(f"\n成功迁移 {migrated_count} 条记录的provider数据")
            else:
                print("没有需要迁移的provider数据（所有name都不是已知的provider值）")
                
        except Exception as e:
            print(f"[ERROR] 迁移provider数据失败: {e}")
            self.connection.rollback()
        finally:
            cursor.close()

    def migrate_api_keys_to_encrypted(self, encryption_key: str):
        """
        将现有的明文API Key迁移为加密格式
        仅对仍为VARCHAR类型的api_key字段进行迁移
        
        Args:
            encryption_key: 加密密钥（从环境变量获取）
        """
        if not encryption_key:
            print("[ERROR] 未设置DB_ENCRYPTION_KEY环境变量，无法进行密钥迁移")
            return

        print("\n开始迁移API Key到加密格式...")
        print("-" * 50)
        print(f"[DEBUG] 使用的加密密钥: {encryption_key[:8]}...{encryption_key[-4:]}")

        try:
            # 启用pgcrypto扩展
            self.enable_pgcrypto()

            # 迁移 llm_presets 表
            cursor = self.connection.cursor()
            
            # 检查api_key字段类型是否为VARCHAR（未加密状态）
            cursor.execute("""
                SELECT data_type 
                FROM information_schema.columns 
                WHERE table_name = 'llm_presets' AND column_name = 'api_key'
            """)
            result = cursor.fetchone()
            print(f"[DEBUG] llm_presets.api_key 当前类型: {result[0] if result else 'UNKNOWN'}")
            
            if result and result[0] == 'character varying':
                # 先查看有多少条数据需要迁移
                cursor.execute("SELECT COUNT(*) FROM llm_presets WHERE api_key IS NOT NULL AND api_key != ''")
                count = cursor.fetchone()[0]
                print(f"正在迁移 llm_presets 表中的API Key ({count} 条)...")
                
                update_sql = """
                    UPDATE llm_presets 
                    SET api_key = pgp_sym_encrypt(api_key::text, %s)::bytea 
                    WHERE api_key IS NOT NULL AND api_key != ''
                """
                cursor.execute(update_sql, (encryption_key,))
                self.connection.commit()
                print(f"已加密 {cursor.rowcount} 条记录")
                
                # 将字段类型改为BYTEA
                alter_sql = "ALTER TABLE llm_presets ALTER COLUMN api_key TYPE bytea USING api_key::bytea"
                cursor.execute(alter_sql)
                self.connection.commit()
                print("已将 llm_presets.api_key 字段类型改为 bytea")
            elif result and result[0] == 'bytea':
                print("llm_presets 表中的API Key已是 bytea 类型，检查是否需要重新加密...")
                # 测试解密一条数据
                try:
                    cursor.execute("SELECT pgp_sym_decrypt(api_key, %s) FROM llm_presets WHERE api_key IS NOT NULL LIMIT 1", (encryption_key,))
                    test_result = cursor.fetchone()
                    print("解密测试成功，密钥匹配")
                except Exception as e:
                    print(f"[WARNING] 解密测试失败: {e}")
                    print("当前密钥与加密时使用的密钥不匹配！")
                    print("如果需要使用新密钥，请先使用旧密钥进行密钥轮换")
            else:
                print("llm_presets 表中的API Key状态未知，跳过")

            # 迁移 user_llm_configs 表
            cursor.execute("""
                SELECT data_type 
                FROM information_schema.columns 
                WHERE table_name = 'user_llm_configs' AND column_name = 'api_key'
            """)
            result = cursor.fetchone()
            print(f"[DEBUG] user_llm_configs.api_key 当前类型: {result[0] if result else 'UNKNOWN'}")
            
            if result and result[0] == 'character varying':
                # 先查看有多少条数据需要迁移
                cursor.execute("SELECT COUNT(*) FROM user_llm_configs WHERE api_key IS NOT NULL AND api_key != ''")
                count = cursor.fetchone()[0]
                print(f"正在迁移 user_llm_configs 表中的API Key ({count} 条)...")
                
                update_sql = """
                    UPDATE user_llm_configs 
                    SET api_key = pgp_sym_encrypt(api_key::text, %s)::bytea 
                    WHERE api_key IS NOT NULL AND api_key != ''
                """
                cursor.execute(update_sql, (encryption_key,))
                self.connection.commit()
                print(f"已加密 {cursor.rowcount} 条记录")
                
                # 将字段类型改为BYTEA
                alter_sql = "ALTER TABLE user_llm_configs ALTER COLUMN api_key TYPE bytea USING api_key::bytea"
                cursor.execute(alter_sql)
                self.connection.commit()
                print("已将 user_llm_configs.api_key 字段类型改为 bytea")
            elif result and result[0] == 'bytea':
                print("user_llm_configs 表中的API Key已是 bytea 类型，检查是否需要重新加密...")
                # 测试解密一条数据
                try:
                    cursor.execute("SELECT pgp_sym_decrypt(api_key, %s) FROM user_llm_configs WHERE api_key IS NOT NULL LIMIT 1", (encryption_key,))
                    test_result = cursor.fetchone()
                    print("解密测试成功，密钥匹配")
                except Exception as e:
                    print(f"[WARNING] 解密测试失败: {e}")
                    print("当前密钥与加密时使用的密钥不匹配！")
            else:
                print("user_llm_configs 表中的API Key状态未知，跳过")

            cursor.close()
            print("-" * 50)
            print("API Key迁移完成！\n")

        except Exception as e:
            print(f"[ERROR] API Key迁移失败: {e}")
            self.connection.rollback()
            raise

    def rotate_encryption_key(self, old_key: str, new_key: str):
        """
        密钥轮换：使用旧密钥解密数据，再用新密钥重新加密
        
        Args:
            old_key: 旧的加密密钥
            new_key: 新的加密密钥
        """
        if not old_key or not new_key:
            print("[ERROR] 必须提供旧密钥和新密钥")
            return

        print(f"\n开始密钥轮换...")
        print("-" * 50)

        try:
            cursor = self.connection.cursor()

            # 轮换 llm_presets 表
            print("正在轮换 llm_presets 表的密钥...")
            update_sql = """
                UPDATE llm_presets 
                SET api_key = pgp_sym_encrypt(pgp_sym_decrypt(api_key, %s), %s)::bytea 
                WHERE api_key IS NOT NULL
            """
            cursor.execute(update_sql, (old_key, new_key))
            self.connection.commit()
            print(f"已轮换 {cursor.rowcount} 条记录")

            # 轮换 user_llm_configs 表
            print("正在轮换 user_llm_configs 表的密钥...")
            update_sql = """
                UPDATE user_llm_configs 
                SET api_key = pgp_sym_encrypt(pgp_sym_decrypt(api_key, %s), %s)::bytea 
                WHERE api_key IS NOT NULL
            """
            cursor.execute(update_sql, (old_key, new_key))
            self.connection.commit()
            print(f"已轮换 {cursor.rowcount} 条记录")

            cursor.close()
            print("-" * 50)
            print("密钥轮换完成！\n")
            print("请更新环境变量 DB_ENCRYPTION_KEY 为新密钥")

        except Exception as e:
            print(f"[ERROR] 密钥轮换失败: {e}")
            self.connection.rollback()
            raise

    def add_llm_tables_if_not_exist(self):
        """为已存在的数据库添加LLM相关表"""
        sql = """
        CREATE TABLE IF NOT EXISTS llm_presets (
            id SERIAL PRIMARY KEY,
            name VARCHAR(50) NOT NULL UNIQUE,
            display_name VARCHAR(100) NOT NULL,
            api_key VARCHAR(500),
            base_url VARCHAR(500) NOT NULL,
            default_model VARCHAR(100) NOT NULL,
            models JSONB DEFAULT '[]',
            is_active BOOLEAN DEFAULT true,
            is_system BOOLEAN DEFAULT false,
            provider VARCHAR(50) DEFAULT 'custom',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS user_llm_configs (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            name VARCHAR(50) NOT NULL,
            provider VARCHAR(50),
            api_key VARCHAR(500) NOT NULL,
            base_url VARCHAR(500) NOT NULL,
            model VARCHAR(100) NOT NULL,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_user_llm_configs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT uq_user_llm_config_name UNIQUE (user_id, name)
        );
        
        CREATE TABLE IF NOT EXISTS user_llm_usage (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            preset_id INTEGER,
            user_config_id INTEGER,
            provider VARCHAR(50),
            model VARCHAR(100) NOT NULL,
            prompt_tokens INTEGER DEFAULT 0,
            completion_tokens INTEGER DEFAULT 0,
            total_tokens INTEGER DEFAULT 0,
            called_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_llm_preferences (
            user_id INTEGER PRIMARY KEY,
            preset_id INTEGER REFERENCES llm_presets(id) ON DELETE SET NULL,
            user_config_id INTEGER REFERENCES user_llm_configs(id) ON DELETE SET NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        """
        self.execute_sql(sql, "为已存在数据库添加LLM相关表")

    def drop_all_tables(self):
        """删除所有表（慎用！）"""
        print("\n警告：即将删除所有表！")
        confirm = input("确认删除所有表？(yes/no): ")
        if confirm.lower() != 'yes':
            print("操作已取消")
            return

        # 先获取当前存在的表
        cursor = self.connection.cursor()
        cursor.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        """)
        existing_tables = [row[0] for row in cursor.fetchall()]
        cursor.close()

        if not existing_tables:
            print("数据库中没有表")
            return

        print(f"\n当前数据库中的表 ({len(existing_tables)} 个):")
        print("-" * 50)
        for table in existing_tables:
            print(f"  - {table}")
        print("-" * 50)

        # 定义要删除的表（按依赖顺序）
        tables_to_drop = [
            'user_llm_usage',
            'user_llm_preferences',
            'user_llm_configs',
            'llm_presets',
            'dialogue_messages',
            'dialogue_sessions',
            'user_stock_portfolio',
            'user_stock_watchlist',
            'stock_analysis_results',
            'wechat_users',
            'token_blacklist',
            'refresh_tokens',
            'api_call_logs',
            'memberships',
            'admins',
            'users'
        ]

        # 只删除实际存在的表
        dropped_tables = []
        for table in tables_to_drop:
            if table in existing_tables:
                try:
                    cursor = self.connection.cursor()
                    cursor.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
                    self.connection.commit()
                    dropped_tables.append(table)
                    print(f"[OK] 删除表: {table}")
                    cursor.close()
                except Exception as e:
                    print(f"[ERROR] 删除表 {table} 失败: {e}")
                    self.connection.rollback()

        print("=" * 50)
        print(f"删除完成！共删除 {len(dropped_tables)} 个表")
        print(f"已删除的表: {', '.join(dropped_tables)}\n")

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

    # 解析命令行参数
    import sys
    args = sys.argv[1:]
    auto_create = False
    if args and args[0] == "--create":
        auto_create = True

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
        if auto_create:
            # 自动创建所有表
            initializer.create_all_tables()
        else:
            # 显示菜单
            while True:
                print("\n请选择操作：")
                print("  1. 创建所有表")
                print("  2. 删除所有表（慎用！）")
                print("  3. 显示所有表")
                print("  4. 查看表结构")
                print("  5. 迁移API Key到加密格式")
                print("  6. 密钥轮换")
                print("  7. 退出")

                choice = input("\n请输入选项 (1-7): ").strip()

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
                    encryption_key = os.getenv("DB_ENCRYPTION_KEY", "")
                    if not encryption_key:
                        print("[ERROR] 未设置DB_ENCRYPTION_KEY环境变量")
                        print("请先在.env文件中设置DB_ENCRYPTION_KEY")
                        continue
                    confirm = input("确认将现有的明文API Key迁移为加密格式？(yes/no): ")
                    if confirm.lower() == 'yes':
                        initializer.migrate_api_keys_to_encrypted(encryption_key)
                    else:
                        print("操作已取消")
                elif choice == '6':
                    old_key = input("请输入旧密钥: ").strip()
                    new_key = input("请输入新密钥: ").strip()
                    if not old_key or not new_key:
                        print("[ERROR] 必须提供旧密钥和新密钥")
                        continue
                    confirm = input(f"确认使用旧密钥轮换到新密钥？(yes/no): ")
                    if confirm.lower() == 'yes':
                        initializer.rotate_encryption_key(old_key, new_key)
                    else:
                        print("操作已取消")
                elif choice == '7':
                    print("退出程序")
                    break
                else:
                    print("无效选项，请重新输入")

    finally:
        initializer.disconnect()


if __name__ == "__main__":
    main()
