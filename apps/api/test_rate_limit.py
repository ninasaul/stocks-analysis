"""测试登录接口速率限制功能"""
import time
import requests
import json

BASE_URL = "http://localhost:8000"
TEST_USER = {
    "username": "ratetest",
    "password": "Test123456",
    "email": "ratelimit@example.com"
}

def test_redis_connection():
    """测试Redis连接"""
    print("\n=== 测试Redis连接 ===")
    try:
        import redis
        import os
        from dotenv import load_dotenv
        load_dotenv()

        r = redis.Redis(
            host=os.getenv("REDIS_HOST", "localhost"),
            port=int(os.getenv("REDIS_PORT", "6379")),
            password=os.getenv("REDIS_PASSWORD") or None,
            decode_responses=True,
            db=int(os.getenv("REDIS_DB", "0"))
        )
        r.ping()
        print("✅ Redis连接成功")
        return True
    except Exception as e:
        print(f"❌ Redis连接失败: {e}")
        return False

def test_register():
    """测试用户注册"""
    print("\n=== 测试用户注册 ===")
    register_url = f"{BASE_URL}/api/auth/register"

    try:
        response = requests.post(register_url, json=TEST_USER, timeout=10)
        print(f"注册状态码: {response.status_code}")
        print(f"注册响应: {response.json()}")

        if response.status_code in [200, 201]:
            print("✅ 用户注册成功")
            return True
        elif "已存在" in response.json().get("detail", ""):
            print("✅ 用户已存在，跳过注册")
            return True
        else:
            print(f"❌ 注册失败: {response.json()}")
            return False
    except Exception as e:
        print(f"❌ 注册请求失败: {e}")
        return False

def test_normal_login():
    """测试正常登录"""
    print("\n=== 测试正常登录 ===")
    login_url = f"{BASE_URL}/api/auth/login"

    try:
        response = requests.post(login_url, data={
            "username": TEST_USER["username"],
            "password": TEST_USER["password"]
        }, timeout=10)

        print(f"登录状态码: {response.status_code}")

        if response.status_code == 200:
            print("✅ 正常登录成功")
            data = response.json()
            print(f"用户: {data['user']['username']}, 令牌: {data['access_token'][:20]}...")
            return True
        else:
            print(f"❌ 登录失败: {response.json()}")
            return False
    except Exception as e:
        print(f"❌ 登录请求失败: {e}")
        return False

def test_ip_rate_limit():
    """测试IP速率限制"""
    print("\n=== 测试IP速率限制 ===")

    login_url = f"{BASE_URL}/api/auth/login"

    success_count = 0
    for i in range(6):
        try:
            response = requests.post(login_url, data={
                "username": "nonexistent_user_123",
                "password": "wrong_password"
            }, timeout=10)

            print(f"第{i+1}次请求 - 状态码: {response.status_code}")

            if response.status_code == 429:
                print(f"✅ IP速率限制触发: {response.json()['detail']}")
                return True
            elif response.status_code == 401:
                success_count += 1
                if success_count >= 5:
                    print(f"已发送5次失败请求，但速率限制未触发")
        except Exception as e:
            print(f"第{i+1}次请求异常: {e}")

        time.sleep(0.5)

    print("❌ IP速率限制未触发")
    return False

def test_user_rate_limit():
    """测试用户名速率限制"""
    print("\n=== 测试用户名速率限制 ===")

    login_url = f"{BASE_URL}/api/auth/login"

    success_count = 0
    for i in range(4):
        try:
            response = requests.post(login_url, data={
                "username": TEST_USER["username"],
                "password": "wrong_password_123"
            }, timeout=10)

            print(f"第{i+1}次请求 - 状态码: {response.status_code}")

            if response.status_code == 429:
                print(f"✅ 用户名速率限制触发: {response.json()['detail']}")
                return True
            elif response.status_code == 401:
                success_count += 1
                if success_count >= 3:
                    print(f"已发送3次失败请求，但速率限制未触发")
        except Exception as e:
            print(f"第{i+1}次请求异常: {e}")

        time.sleep(0.5)

    print("❌ 用户名速率限制未触发")
    return False

def test_rate_limit_after_wait():
    """等待后测试速率限制重置"""
    print("\n=== 测试速率限制重置（等待60秒）===")
    print("等待60秒，让速率限制重置...")
    time.sleep(61)

    login_url = f"{BASE_URL}/api/auth/login"
    try:
        response = requests.post(login_url, data={
            "username": TEST_USER["username"],
            "password": TEST_USER["password"]
        }, timeout=10)

        print(f"登录状态码: {response.status_code}")

        if response.status_code == 200:
            print("✅ 速率限制已重置，登录成功")
            return True
        else:
            print(f"⚠️ 登录失败（可能是其他原因）: {response.json()}")
            return False
    except Exception as e:
        print(f"❌ 登录请求失败: {e}")
        return False

def main():
    """运行所有测试"""
    print("=" * 50)
    print("开始测试登录接口速率限制功能...")
    print("=" * 50)

    tests = [
        ("Redis连接测试", test_redis_connection),
        ("用户注册测试", test_register),
        ("正常登录测试", test_normal_login),
        ("IP速率限制测试", test_ip_rate_limit),
        ("用户名速率限制测试", test_user_rate_limit),
        ("速率限制重置测试", test_rate_limit_after_wait),
    ]

    results = []
    for name, test_func in tests:
        try:
            result = test_func()
            results.append((name, result))
        except Exception as e:
            print(f"测试 '{name}' 发生异常: {e}")
            results.append((name, False))

    print("\n" + "=" * 50)
    print("测试结果汇总")
    print("=" * 50)

    passed = 0
    failed = 0
    for name, result in results:
        status = "✅ 通过" if result else "❌ 失败"
        print(f"{name}: {status}")
        if result:
            passed += 1
        else:
            failed += 1

    print(f"\n通过: {passed}/{len(results)}")
    print(f"失败: {failed}/{len(results)}")

if __name__ == "__main__":
    main()
