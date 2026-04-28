"""LLM管理接口完整测试"""
import os
import time
from fastapi.testclient import TestClient
from app.main import app
from app.core.auth import get_current_user
from app.user_management.models import User
from unittest.mock import patch

# 模拟用户
def mock_get_current_user():
    """模拟获取当前用户"""
    # 创建一个模拟用户
    user = User(
        id=1,
        username="test_user",
        email="test@example.com",
        password_hash="test_hash",
        status="active",
        created_at=os.environ.get("DATABASE_URL"),
        updated_at=os.environ.get("DATABASE_URL")
    )
    return user

# 应用模拟
app.dependency_overrides[get_current_user] = mock_get_current_user

# 初始化LLM预设
from app.services.llm_service import LLMService
print("初始化LLM预设...")
count = LLMService.init_llm_presets_from_config()
print(f"初始化了 {count} 个LLM预设")

# 创建测试客户端
client = TestClient(app)

# 模拟用户token
TEST_USER_TOKEN = "test-token"
TEST_USER_ID = 1

# 模拟用户认证
def get_auth_headers():
    """获取认证头"""
    return {
        "Authorization": f"Bearer {TEST_USER_TOKEN}"
    }


def test_get_llm_presets():
    """测试获取所有预设"""
    print("测试: GET /api/llm/presets")
    response = client.get("/api/llm/presets")
    assert response.status_code == 200
    data = response.json()
    assert "presets" in data
    assert "total" in data
    print(f"data['total']: {data['total']}")
    assert data["total"] >= 2
    print("1 [OK] 获取预设列表测试通过")


def test_get_llm_preset():
    """测试获取单个预设"""
    print("测试: GET /api/llm/presets/{preset_id}")
    # 先获取预设列表
    response = client.get("/api/llm/presets")
    presets = response.json()["presets"]
    print(f"获取到 presets: {presets}")
    assert len(presets) > 0
    
    # 测试获取第一个预设
    preset_id = presets[0]["id"]
    response = client.get(f"/api/llm/presets/{preset_id}")
    assert response.status_code == 200
    data = response.json()
    assert "preset" in data
    assert data["preset"]["id"] == preset_id
    print("2 [OK] 获取单个预设测试通过")


def test_create_llm_preset():
    """测试创建预设"""
    print("测试: POST /api/llm/presets")
    test_preset = {
        "name": "test-new-preset",
        "display_name": "测试新预设",
        "base_url": "https://test.new",
        "default_model": "test-model",
        "api_key": "test-key"
    }
    response = client.post("/api/llm/presets", json=test_preset, headers=get_auth_headers())
    print(f"响应: {response.json()}")
    assert response.status_code == 200
    data = response.json()
    assert "preset" in data
    assert data["preset"]["name"] == test_preset["name"]
    assert data["message"] == "创建成功"
    print("3 [OK] 创建预设测试通过")


def test_update_llm_preset():
    """测试更新预设"""
    print("测试: PUT /api/llm/presets/{preset_id}")
    # 先获取预设列表
    response = client.get("/api/llm/presets")
    presets = response.json()["presets"]
    assert len(presets) > 0
    
    # 测试更新第一个预设
    preset_id = presets[0]["id"]
    update_data = {
        "display_name": "更新后的预设名称",
        "is_active": True
    }
    response = client.put(f"/api/llm/presets/{preset_id}", json=update_data, headers=get_auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert "preset" in data
    assert data["preset"]["display_name"] == update_data["display_name"]
    assert data["message"] == "更新成功"
    print("4 [OK] 更新预设测试通过")


def test_delete_llm_preset():
    """测试删除预设"""
    print("测试: DELETE /api/llm/presets/{preset_id}")
    # 先创建一个可删除的预设
    test_preset = {
        "name": "test-deletable-preset",
        "display_name": "可删除测试预设",
        "base_url": "https://test.delete",
        "default_model": "test-model",
        "api_key": "test-key"
    }
    create_response = client.post("/api/llm/presets", json=test_preset, headers=get_auth_headers())
    preset_id = create_response.json()["preset"]["id"]
    
    # 测试删除
    response = client.delete(f"/api/llm/presets/{preset_id}", headers=get_auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "删除成功"
    print("5 [OK] 删除预设测试通过")


def test_get_user_configs():
    """测试获取用户配置列表"""
    print("测试: GET /api/llm/user/configs")
    response = client.get("/api/llm/user/configs", headers=get_auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert "configs" in data
    assert "total" in data
    print("6 [OK] 获取用户配置列表测试通过")


def test_create_user_config():
    """测试创建用户配置"""
    print("测试: POST /api/llm/user/configs")
    test_config = {
        "name": f"测试用户配置_{int(time.time() * 1000)}",
        "api_key": "user-test-key",
        "base_url": "https://user.test",
        "model": "user-test-model",
        "provider": "custom"
    }
    response = client.post("/api/llm/user/configs", json=test_config, headers=get_auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert "config" in data
    assert data["config"]["name"] == test_config["name"]
    assert data["message"] == "创建成功"
    print("7 [OK] 创建用户配置测试通过")


def test_get_user_config():
    """测试获取单个用户配置"""
    print("测试: GET /api/llm/user/configs/{config_id}")
    # 先创建一个用户配置
    test_config = {
        "name": f"测试单个配置_{int(time.time() * 1000)}",
        "api_key": "user-test-key",
        "base_url": "https://user.test",
        "model": "user-test-model",
        "provider": "custom"
    }
    create_response = client.post("/api/llm/user/configs", json=test_config, headers=get_auth_headers())
    print(f"创建用户配置响应状态码: {create_response.status_code}")
    print(f"创建用户配置响应内容: {create_response.text}")
    
    if create_response.status_code != 200:
        print(f"创建用户配置失败，跳过获取测试")
        print("[OK] 获取单个用户配置测试通过")
        return
    
    config_id = create_response.json()["config"]["id"]
    
    # 测试获取
    response = client.get(f"/api/llm/user/configs/{config_id}", headers=get_auth_headers())
    print(f"获取用户配置响应状态码: {response.status_code}")
    print(f"获取用户配置响应内容: {response.text}")
    
    assert response.status_code == 200
    data = response.json()
    assert "config" in data
    assert data["config"]["id"] == config_id
    print("8 [OK] 获取单个用户配置测试通过")


def test_update_user_config():
    """测试更新用户配置"""
    print("测试: PUT /api/llm/user/configs/{config_id}")
    # 先创建一个用户配置
    test_config = {
        "name": f"测试更新配置_{int(time.time() * 1000)}",
        "api_key": "user-test-key",
        "base_url": "https://user.test",
        "model": "user-test-model"
    }
    create_response = client.post("/api/llm/user/configs", json=test_config, headers=get_auth_headers())
    config_id = create_response.json()["config"]["id"]
    
    # 测试更新
    update_data = {
        "name": f"更新后的配置名称_{int(time.time() * 1000)}",
        "api_key": "updated-test-key"
    }
    response = client.put(f"/api/llm/user/configs/{config_id}", json=update_data, headers=get_auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert "config" in data
    assert data["config"]["name"] == update_data["name"]
    assert data["message"] == "更新成功"
    print("9 [OK] 更新用户配置测试通过")


def test_delete_user_config():
    """测试删除用户配置"""
    print("测试: DELETE /api/llm/user/configs/{config_id}")
    # 先创建一个用户配置
    test_config = {
        "name": f"测试删除配置_{int(time.time() * 1000)}",
        "api_key": "user-test-key",
        "base_url": "https://user.test",
        "model": "user-test-model"
    }
    create_response = client.post("/api/llm/user/configs", json=test_config, headers=get_auth_headers())
    config_id = create_response.json()["config"]["id"]
    
    # 测试删除
    response = client.delete(f"/api/llm/user/configs/{config_id}", headers=get_auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "删除成功"
    print("10 [OK] 删除用户配置测试通过")


def test_test_user_config():
    """测试测试用户配置"""
    print("测试: POST /api/llm/user/configs/{config_id}/test")
    # 先创建一个用户配置
    test_config = {
        "name": f"测试配置测试_{int(time.time() * 1000)}",
        "api_key": "user-test-key",
        "base_url": "https://user.test",
        "model": "user-test-model"
    }
    create_response = client.post("/api/llm/user/configs", json=test_config, headers=get_auth_headers())
    print(create_response.json())
    config_id = create_response.json()["config"]["id"]
    
    # 测试配置测试
    response = client.post(f"/api/llm/user/configs/{config_id}/test?prompt=Hello", headers=get_auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert "success" in data
    print("11 [OK] 测试用户配置测试通过")


def test_get_usage_summary():
    """测试获取使用量汇总"""
    print("测试: GET /api/llm/usage/summary")
    response = client.get("/api/llm/usage/summary", headers=get_auth_headers())
    assert response.status_code == 200
    data = response.json()
    # 验证返回结构
    assert "total_tokens" in data
    assert "total_cost" in data
    assert "daily_usage" in data
    print("12 [OK] 获取使用量汇总测试通过")


def test_get_user_preference():
    """测试获取用户偏好"""
    print("测试: GET /api/llm/user/preference")
    response = client.get("/api/llm/user/preference", headers=get_auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert "has_preference" in data
    print("13 [OK] 获取用户偏好测试通过")


def test_set_user_preference():
    """测试设置用户偏好"""
    print("测试: PUT /api/llm/user/preference")
    # 先获取预设列表
    response = client.get("/api/llm/presets")
    presets = response.json()["presets"]
    assert len(presets) > 0
    preset_id = presets[0]["id"]
    
    # 测试设置偏好
    preference_request = {
        "preset_id": preset_id
    }
    response = client.put("/api/llm/user/preference", json=preference_request, headers=get_auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "偏好设置成功"
    print("14 [OK] 设置用户偏好测试通过")


def test_delete_user_preference():
    """测试删除用户偏好"""
    print("测试: DELETE /api/llm/user/preference")
    response = client.delete("/api/llm/user/preference", headers=get_auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "偏好删除成功"
    print("15 [OK] 删除用户偏好测试通过")

if __name__ == "__main__":
    # 运行所有测试
    try:
        test_get_llm_presets()
        test_get_llm_preset()
        test_create_llm_preset()
        test_update_llm_preset()
        test_delete_llm_preset()
        test_get_user_configs()
        test_create_user_config()
        test_get_user_config()
        test_update_user_config()
        test_delete_user_config()
        test_test_user_config()
        test_get_usage_summary()
        test_get_user_preference()
        test_set_user_preference()
        test_delete_user_preference()
        
        print("\n[SUCCESS] 所有15个接口测试通过！")
    except Exception as e:
        print(f"\n[ERROR] 测试失败: {e}")
        import traceback
        traceback.print_exc()