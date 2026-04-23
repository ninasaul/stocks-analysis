"""测试多种登录方式功能"""
import requests
import json

BASE_URL = "http://localhost:8011"

# 测试用户信息
TEST_USER = {
    "username": "test_multilogin",
    "password": "Test123456",
    "email": "test_multilogin@example.com",
    "phone": "13800138000"
}

def test_register():
    """测试用户注册"""
    print("\n=== 测试用户注册 ===")
    register_url = f"{BASE_URL}/api/auth/register"

    response = requests.post(register_url, json=TEST_USER)
    print(f"注册状态码: {response.status_code}")

    if response.status_code in [200, 201]:
        print("✅ 用户注册成功")
        user_data = response.json()
        print(f"用户ID: {user_data['id']}")
        print(f"用户名: {user_data['username']}")
        print(f"邮箱: {user_data['email']}")
        print(f"手机号: {user_data.get('phone')}")
        return True
    elif response.status_code == 400 and "已存在" in response.json().get("detail", ""):
        print("✅ 用户已存在，跳过注册")
        return True
    else:
        print(f"❌ 注册失败: {response.json()}")
        return False

def test_login_with_username():
    """测试使用用户名登录"""
    print("\n=== 测试使用用户名登录 ===")
    login_url = f"{BASE_URL}/api/auth/login"

    response = requests.post(login_url, data={
        "username": TEST_USER["username"],
        "password": TEST_USER["password"]
    })

    print(f"登录状态码: {response.status_code}")

    if response.status_code == 200:
        print("✅ 使用用户名登录成功")
        data = response.json()
        print(f"访问令牌: {data['access_token'][:20]}...")
        print(f"刷新令牌: {data['refresh_token'][:20]}...")
        return True
    else:
        print(f"❌ 登录失败: {response.json()}")
        return False

def test_login_with_email():
    """测试使用邮箱登录"""
    print("\n=== 测试使用邮箱登录 ===")
    login_url = f"{BASE_URL}/api/auth/login"

    response = requests.post(login_url, data={
        "username": TEST_USER["email"],  # 这里使用邮箱作为identifier
        "password": TEST_USER["password"]
    })

    print(f"登录状态码: {response.status_code}")

    if response.status_code == 200:
        print("✅ 使用邮箱登录成功")
        data = response.json()
        print(f"访问令牌: {data['access_token'][:20]}...")
        return True
    else:
        print(f"❌ 登录失败: {response.json()}")
        return False

def test_login_with_phone():
    """测试使用手机号登录"""
    print("\n=== 测试使用手机号登录 ===")
    login_url = f"{BASE_URL}/api/auth/login"

    response = requests.post(login_url, data={
        "username": TEST_USER["phone"],  # 这里使用手机号作为identifier
        "password": TEST_USER["password"]
    })

    print(f"登录状态码: {response.status_code}")

    if response.status_code == 200:
        print("✅ 使用手机号登录成功")
        data = response.json()
        print(f"访问令牌: {data['access_token'][:20]}...")
        return True
    else:
        print(f"❌ 登录失败: {response.json()}")
        return False

def test_login_with_wrong_credentials():
    """测试使用错误凭据登录"""
    print("\n=== 测试使用错误凭据登录 ===")
    login_url = f"{BASE_URL}/api/auth/login"

    passed = True

    # 测试错误的用户名
    response = requests.post(login_url, data={
        "username": "non_existent_user",
        "password": TEST_USER["password"]
    })
    print(f"错误用户名 - 状态码: {response.status_code}")
    if response.status_code == 401:
        print("✅ 错误用户名处理正确")
    else:
        print(f"❌ 错误用户名处理失败: {response.json()}")
        passed = False

    # 测试错误的密码
    response = requests.post(login_url, data={
        "username": TEST_USER["username"],
        "password": "wrong_password"
    })
    print(f"错误密码 - 状态码: {response.status_code}")
    if response.status_code == 401:
        print("✅ 错误密码处理正确")
    else:
        print(f"❌ 错误密码处理失败: {response.json()}")
        passed = False

    return passed

def main():
    """运行所有测试"""
    print("=" * 60)
    print("开始测试多种登录方式功能...")
    print("=" * 60)

    tests = [
        ("用户注册测试", test_register),
        ("用户名登录测试", test_login_with_username),
        ("邮箱登录测试", test_login_with_email),
        ("手机号登录测试", test_login_with_phone),
        ("错误凭据测试", test_login_with_wrong_credentials)
    ]

    results = []
    for name, test_func in tests:
        try:
            result = test_func()
            results.append((name, result))
        except Exception as e:
            print(f"测试 '{name}' 发生异常: {e}")
            results.append((name, False))

    print("\n" + "=" * 60)
    print("测试结果汇总")
    print("=" * 60)

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
