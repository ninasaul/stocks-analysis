# JWT 认证使用文档

## 概述

本项目使用 JWT（JSON Web Token）进行用户认证和授权。JWT 是一种基于令牌的认证机制，它允许用户在登录后获得一个令牌，然后使用该令牌访问需要认证的 API 接口。

## 依赖

项目使用以下库实现 JWT 认证：

- `python-jose[cryptography]` - 用于 JWT 令牌的生成和验证
- `passlib[bcrypt]` - 用于密码哈希
- `python-multipart` - 用于处理表单数据

## 配置

JWT 相关的配置在 `app/core/config.py` 文件中定义：

```python
# JWT 配置
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
```

建议在生产环境中通过环境变量设置 `SECRET_KEY`，以提高安全性。

## API 接口

### 1. 用户注册

**接口**：`POST /api/users/register`

**请求体**：
```json
{
  "username": "user1",
  "email": "user1@example.com",
  "password": "password123",
  "phone": "13800138000"
}
```

**响应**：
```json
{
  "id": 1,
  "username": "user1",
  "email": "user1@example.com",
  "phone": "13800138000",
  "status": "active",
  "created_at": "2026-04-20T10:00:00",
  "updated_at": "2026-04-20T10:00:00"
}
```

### 2. 用户登录

**接口**：`POST /api/auth/login`

**请求体**：
```json
{
  "username": "user1",
  "password": "password123"
}
```

**响应**：
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "username": "user1",
    "email": "user1@example.com",
    "phone": "13800138000",
    "status": "active",
    "created_at": "2026-04-20T10:00:00",
    "updated_at": "2026-04-20T10:00:00"
  }
}
```

### 3. 获取当前用户信息

**接口**：`GET /api/auth/me`

**请求头**：
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**响应**：
```json
{
  "id": 1,
  "username": "user1",
  "email": "user1@example.com",
  "phone": "13800138000",
  "status": "active",
  "created_at": "2026-04-20T10:00:00",
  "updated_at": "2026-04-20T10:00:00"
}
```

## 保护需要认证的接口

所有需要认证的 API 接口都需要在请求头中包含 `Authorization` 字段，格式为 `Bearer <token>`。

### 示例：使用 curl 访问需要认证的接口

```bash
curl -X GET "http://localhost:8000/api/users/1" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### 示例：使用 Python requests 库访问需要认证的接口

```python
import requests

url = "http://localhost:8000/api/users/1"
headers = {
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}

response = requests.get(url, headers=headers)
print(response.json())
```

## 需要认证的接口列表

以下接口需要认证：

- `GET /api/users/me` - 获取当前用户信息
- `GET /api/users/{user_id}` - 获取用户信息
- `PUT /api/users/{user_id}` - 更新用户信息
- `DELETE /api/users/{user_id}` - 删除用户
- `GET /api/users` - 获取用户列表
- `POST /api/memberships` - 开通会员
- `GET /api/memberships/{user_id}` - 获取用户会员信息
- `PUT /api/memberships/{user_id}` - 更新会员信息
- `GET /api/memberships` - 获取会员列表
- `POST /api/memberships/renew` - 会员续费
- `POST /api/memberships/upgrade` - 会员升级
- `GET /api/memberships/{user_id}/api-calls` - 获取API调用统计
- `GET /api/memberships/{user_id}/api-logs` - 获取API调用日志
- `POST /api/admin/reset-api-calls` - 重置所有会员的每日API调用次数

## 错误处理

### 1. 未提供认证令牌

**状态码**：401 Unauthorized
**响应**：
```json
{
  "detail": "Not authenticated"
}
```

### 2. 无效的认证令牌

**状态码**：401 Unauthorized
**响应**：
```json
{
  "detail": "无法验证凭据"
}
```

### 3. 用户已被禁用

**状态码**：403 Forbidden
**响应**：
```json
{
  "detail": "用户已被禁用"
}
```

## 安全注意事项

1. **令牌安全**：JWT 令牌应该通过 HTTPS 传输，以防止被窃取。
2. **令牌过期**：令牌默认过期时间为 30 分钟，可以根据实际需求调整。
3. **密码安全**：密码使用 bcrypt 算法进行哈希，存储在数据库中。
4. **密钥管理**：`SECRET_KEY` 应该保密，并且在生产环境中定期更换。
5. **权限控制**：目前所有认证用户都可以访问所有需要认证的接口，后续可以根据需要添加更细粒度的权限控制。

## 前端集成

### 示例：使用 JavaScript 获取令牌并访问需要认证的接口

```javascript
// 登录获取令牌
async function login(username, password) {
  const response = await fetch('http://localhost:8000/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, password })
  });
  
  if (!response.ok) {
    throw new Error('登录失败');
  }
  
  const data = await response.json();
  localStorage.setItem('access_token', data.access_token);
  return data.user;
}

// 访问需要认证的接口
async function fetchProtectedData() {
  const token = localStorage.getItem('access_token');
  
  if (!token) {
    throw new Error('未登录');
  }
  
  const response = await fetch('http://localhost:8000/api/users/me', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    throw new Error('获取数据失败');
  }
  
  return await response.json();
}
```

## 总结

JWT 认证提供了一种安全、无状态的认证机制，适用于前后端分离的应用。通过本项目的实现，用户可以注册、登录，然后使用获得的令牌访问需要认证的 API 接口。

如果需要进一步增强安全性，可以考虑：

1. 实现刷新令牌机制，让用户在令牌过期后不需要重新登录
2. 添加更细粒度的权限控制，例如基于角色的访问控制（RBAC）
3. 实现令牌黑名单，用于在用户登出时使令牌失效
4. 使用 HTTPS 保护所有 API 接口的通信
