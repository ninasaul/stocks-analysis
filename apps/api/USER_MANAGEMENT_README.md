# 用户管理和会员管理模块使用说明

## 概述

本模块提供了完整的用户管理和会员管理功能，包括用户注册、登录、会员开通、续费、升级、API 调用次数限制、JWT 认证、多种登录方式、微信登录等功能。

## 数据库配置

### 1. 安装 PostgreSQL

确保已安装 PostgreSQL 数据库，并创建数据库：

```sql
CREATE DATABASE stocks_analysis;
```

### 2. 配置环境变量

在 `.env` 文件中添加数据库配置：

```env
# 数据库配置
DB_HOST="localhost"
DB_PORT="5432"
DB_NAME="stocks_analysis"
DB_USER="postgres"
DB_PASSWORD="your_password"

# JWT 配置
SECRET_KEY="your-secret-key-here"
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Redis 配置（用于速率限制）
REDIS_HOST="localhost"
REDIS_PORT="6379"
REDIS_PASSWORD="your_redis_password"
REDIS_DB=0

# 微信开放平台配置（可选）
WECHAT_APP_ID="your_wechat_app_id"
WECHAT_APP_SECRET="your_wechat_app_secret"
WECHAT_REDIRECT_URI="http://localhost:8000/api/auth/wechat/callback"
```

### 3. 初始化数据库表

运行数据库初始化脚本：

```bash
python scripts/init_database.py
```

脚本提供以下功能：
- 创建所有数据库表
- 删除所有表（慎用）
- 查看所有表
- 查看表结构

## 安装依赖

```bash
pip install -r requirements.txt
```

核心依赖：
- `psycopg2-binary`: PostgreSQL 数据库驱动
- `pydantic[email]`: 数据验证（包含邮箱验证）
- `python-jose[cryptography]`: JWT 令牌生成和验证
- `passlib[bcrypt]`: 密码哈希
- `APScheduler`: 定时任务
- `redis`: 速率限制

## API 接口说明

### 认证接口

#### 1. 用户注册
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "testuser",
  "email": "test@example.com",
  "password": "Test123456",
  "phone": "13800138000"
}
```

**说明**：
- 用户名支持字母、数字、下划线和连字符
- 密码长度必须在 8-16 位之间
- 注册成功后自动创建普通会员

#### 2. 用户登录（支持多种方式）
```http
POST /api/auth/login
Content-Type: application/x-www-form-urlencoded

username=testuser&password=Test123456
```

**支持的登录方式**：
- 用户名 + 密码
- 邮箱 + 密码
- 手机号 + 密码

**说明**：
- 返回访问令牌（30分钟过期）和刷新令牌（7天过期）
- 实施了速率限制，防止暴力破解

#### 3. 刷新访问令牌
```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refresh_token": "your_refresh_token"
}
```

**说明**：
- 刷新令牌会轮换，旧令牌自动失效
- 返回新的访问令牌和刷新令牌

#### 4. 登出
```http
POST /api/auth/logout
Content-Type: application/json
Authorization: Bearer <access_token>

{
  "refresh_token": "your_refresh_token"
}
```

**说明**：
- 将访问令牌和刷新令牌加入黑名单
- 令牌失效后无法再次使用

#### 5. 获取当前用户信息
```http
GET /api/auth/me
Authorization: Bearer <access_token>
```

### 微信登录接口

#### 1. 获取微信登录二维码
```http
GET /api/auth/wechat/qrcode
```

**返回示例**：
```json
{
  "qr_url": "https://open.weixin.qq.com/connect/qrconnect?...",
  "state": "uuid-string"
}
```

#### 2. 微信登录
```http
POST /api/auth/wechat/login?code=wechat_auth_code
```

**说明**：
- 新用户：自动创建账号并绑定微信
- 老用户：直接登录成功
- 返回 `is_new_user` 标识是否为新用户

#### 3. 获取微信绑定状态
```http
GET /api/auth/wechat/bind/status
Authorization: Bearer <access_token>
```

#### 4. 绑定微信
```http
POST /api/auth/wechat/bind
Content-Type: application/json
Authorization: Bearer <access_token>

{
  "code": "wechat_auth_code"
}
```

**说明**：
- 一个用户只能绑定一个微信
- 一个微信只能绑定一个用户

#### 5. 解除微信绑定
```http
DELETE /api/auth/wechat/bind
Authorization: Bearer <access_token>
```

### 会员管理接口

#### 1. 开通会员
```http
POST /api/memberships
Content-Type: application/json
Authorization: Bearer <access_token>

{
  "user_id": 1,
  "type": "premium_monthly",
  "duration_months": 1
}
```

**会员类型**：
- `normal`: 普通会员（10次/天）
- `premium_monthly`: 高级会员月度（100次/天）
- `premium_quarterly`: 高级会员季度（350次/天）
- `premium_yearly`: 高级会员年度（1500次/天）

#### 2. 获取用户会员信息
```http
GET /api/memberships/{user_id}
Authorization: Bearer <access_token>
```

#### 3. 更新会员信息
```http
PUT /api/memberships/{user_id}
Content-Type: application/json
Authorization: Bearer <access_token>

{
  "type": "premium_yearly",
  "end_date": "2026-12-31T23:59:59",
  "status": "active"
}
```

#### 4. 获取会员列表
```http
GET /api/memberships?page=1&page_size=10&status=active
Authorization: Bearer <access_token>
```

#### 5. 会员续费
```http
POST /api/memberships/renew?user_id=1
Content-Type: application/json
Authorization: Bearer <access_token>

{
  "duration_months": 3
}
```

**说明**：
- 普通会员不能续费
- 在原结束时间基础上叠加新时长

#### 6. 会员升级/降级
```http
POST /api/memberships/upgrade?user_id=1
Content-Type: application/json
Authorization: Bearer <access_token>

{
  "new_type": "premium_yearly",
  "duration_months": 12
}
```

**说明**：
- 会员时长叠加：在原结束时间基础上叠加
- API调用次数更新：自动更新为新会员类型的限制
- 已使用次数重置：升级/降级后重置为0
- 降级为普通会员：无期限限制

### API 调用统计接口

#### 1. 获取 API 调用统计
```http
GET /api/memberships/{user_id}/api-calls
Authorization: Bearer <access_token>
```

**返回示例**：
```json
{
  "user_id": 1,
  "total_calls": 150,
  "successful_calls": 145,
  "failed_calls": 5,
  "today_calls": 20,
  "api_call_limit": 1000,
  "api_call_used": 20,
  "api_call_remaining": 980,
  "membership_type": "premium_monthly",
  "membership_status": "active"
}
```

#### 2. 获取 API 调用日志
```http
GET /api/memberships/{user_id}/api-logs?page=1&page_size=10
Authorization: Bearer <access_token>
```

### 管理员接口

#### 重置所有会员的每日 API 调用次数
```http
POST /api/admin/reset-api-calls
Authorization: Bearer <admin_access_token>
```

**说明**：
- 此接口由定时任务每天 0 时自动调用
- 重置所有活跃会员的 `api_call_used` 为 0

## 数据库表结构

### users 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| username | VARCHAR(50) | 用户名（唯一）|
| email | VARCHAR(100) | 邮箱（唯一）|
| password_hash | VARCHAR(255) | 密码哈希（bcrypt）|
| phone | VARCHAR(20) | 手机号（唯一）|
| status | VARCHAR(20) | 状态（active/inactive/suspended）|
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### memberships 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| user_id | INTEGER | 用户ID（外键）|
| type | VARCHAR(30) | 会员类型 |
| start_date | TIMESTAMP | 开始时间 |
| end_date | TIMESTAMP | 结束时间 |
| api_call_limit | INTEGER | API调用次数限制 |
| api_call_used | INTEGER | 已使用次数 |
| status | VARCHAR(20) | 状态（active/expired/cancelled）|
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### api_call_logs 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| user_id | INTEGER | 用户ID（外键）|
| endpoint | VARCHAR(100) | API端点 |
| method | VARCHAR(10) | HTTP方法 |
| call_time | TIMESTAMP | 调用时间 |
| response_status | INTEGER | 响应状态码 |

### refresh_tokens 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| user_id | INTEGER | 用户ID（外键）|
| token | TEXT | 刷新令牌 |
| expires_at | TIMESTAMP | 过期时间 |
| status | VARCHAR(20) | 状态（active/revoked/expired）|
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### token_blacklist 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| token | TEXT | 令牌 |
| token_type | VARCHAR(20) | 令牌类型（access/refresh）|
| user_id | INTEGER | 用户ID（外键）|
| expires_at | TIMESTAMP | 过期时间 |
| added_at | TIMESTAMP | 添加时间 |

### wechat_users 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| user_id | INTEGER | 用户ID（外键）|
| openid | VARCHAR(100) | 微信openid（唯一）|
| unionid | VARCHAR(100) | 微信unionid |
| nickname | VARCHAR(100) | 昵称 |
| avatar_url | VARCHAR(255) | 头像URL |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

## 使用示例

### 1. 用户注册和登录

```python
import requests

# 注册用户
user_data = {
    "username": "testuser",
    "email": "test@example.com",
    "password": "Test123456",
    "phone": "13800138000"
}
response = requests.post("http://localhost:8000/api/auth/register", json=user_data)
print(response.json())

# 使用用户名登录
login_data = {
    "username": "testuser",
    "password": "Test123456"
}
response = requests.post("http://localhost:8000/api/auth/login", data=login_data)
login_result = response.json()
access_token = login_result["access_token"]
refresh_token = login_result["refresh_token"]
```

### 2. 使用多种方式登录

```python
# 使用邮箱登录
response = requests.post("http://localhost:8000/api/auth/login", data={
    "username": "test@example.com",
    "password": "Test123456"
})

# 使用手机号登录
response = requests.post("http://localhost:8000/api/auth/login", data={
    "username": "13800138000",
    "password": "Test123456"
})
```

### 3. 刷新令牌

```python
response = requests.post("http://localhost:8000/api/auth/refresh", json={
    "refresh_token": refresh_token
})
new_tokens = response.json()
access_token = new_tokens["access_token"]
refresh_token = new_tokens["refresh_token"]
```

### 4. 微信登录

```python
# 获取二维码
response = requests.get("http://localhost:8000/api/auth/wechat/qrcode")
qr_data = response.json()
print(f"二维码URL: {qr_data['qr_url']}")

# 用户扫码后，使用授权码登录
response = requests.post("http://localhost:8000/api/auth/wechat/login", params={
    "code": "wechat_auth_code"
})
login_result = response.json()
print(f"是否新用户: {login_result['is_new_user']}")
```

### 5. 绑定微信

```python
# 先登录获取 token
# 然后绑定微信
response = requests.post(
    "http://localhost:8000/api/auth/wechat/bind",
    json={"code": "wechat_auth_code"},
    headers={"Authorization": f"Bearer {access_token}"}
)
print(response.json())
```

### 6. 检查 API 调用限制

```python
response = requests.get(
    f"http://localhost:8000/api/memberships/{user_id}/api-calls",
    headers={"Authorization": f"Bearer {access_token}"}
)
stats = response.json()

if stats["api_call_remaining"] > 0:
    print(f"还可以调用 {stats['api_call_remaining']} 次")
else:
    print("API 调用次数已用完")
```

### 7. 会员升级

```python
response = requests.post(
    f"http://localhost:8000/api/memberships/upgrade?user_id={user_id}",
    json={
        "new_type": "premium_yearly",
        "duration_months": 12
    },
    headers={"Authorization": f"Bearer {access_token}"}
)
membership = response.json()
print(f"升级后会员类型: {membership['type']}")
print(f"API调用限制: {membership['api_call_limit']}")
```

## 安全特性

### 1. JWT 认证
- 访问令牌：30分钟过期
- 刷新令牌：7天过期
- 令牌黑名单：登出后令牌失效

### 2. 密码安全
- 使用 bcrypt 算法哈希存储
- 密码长度限制：8-16位
- 自动截断超过72字节的密码

### 3. 速率限制
- IP限制：每分钟最多5次登录尝试
- 用户限制：每分钟最多3次登录尝试
- 使用 Redis 存储限制信息

### 4. 令牌轮换
- 刷新令牌使用后自动失效
- 生成新的刷新令牌
- 防止令牌重放攻击

## 定时任务

系统使用 APScheduler 实现以下定时任务：

### 1. 每日重置 API 调用次数
- **执行时间**：每天 0 时 0 分 0 秒
- **功能**：重置所有活跃会员的 `api_call_used` 为 0
- **配置**：在 `app/core/scheduler.py` 中配置

### 2. 清理过期令牌
- **执行时间**：每天 1 时 0 分 0 秒
- **功能**：将过期的刷新令牌标记为 expired
- **清理黑名单**：删除已过期的黑名单令牌

## 注意事项

1. **密码安全**：密码使用 bcrypt 哈希存储，不存储明文密码
2. **会员过期**：系统会自动检查会员是否过期，过期会员状态会更新为 "expired"
3. **API 调用限制**：每次 API 调用都会检查用户的会员状态和剩余调用次数
4. **级联删除**：删除用户时，会级联删除其会员记录、API 调用日志、刷新令牌等
5. **每日重置**：系统会自动在每天 0 时重置所有会员的每日 API 调用次数
6. **多种登录方式**：支持用户名、邮箱、手机号登录，同一个账号可以绑定多种登录方式
7. **微信登录**：支持新用户自动创建账号和老用户直接登录
8. **会员升级/降级**：会员时长叠加、API调用次数更新、已使用次数重置
9. **速率限制**：登录接口实施速率限制，防止暴力破解

## 测试脚本

项目提供了以下测试脚本：

1. **test_user_membership.py** - 用户和会员管理功能测试
2. **test_multilogin.py** - 多种登录方式测试
3. **test_wechat_login.py** - 微信登录功能测试
4. **test_rate_limit.py** - 登录速率限制测试

运行测试：
```bash
python test_user_membership.py
python test_multilogin.py
python test_wechat_login.py
python test_rate_limit.py
```

## 后续开发建议

1. **支付集成**：集成支付系统实现会员购买和续费
2. **邮件通知**：会员即将过期时发送邮件提醒
3. **监控系统**：添加 API 调用监控和告警功能
4. **用户反馈**：提供用户反馈渠道，收集用户意见和建议
5. **数据库优化**：添加数据库索引优化查询性能
6. **缓存优化**：使用 Redis 缓存热点数据
7. **日志分析**：实现日志分析和统计功能
8. **数据备份**：定期备份数据库，防止数据丢失
