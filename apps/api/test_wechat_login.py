"""测试微信登录功能"""
import requests
import json
import os
from dotenv import load_dotenv

load_dotenv()

BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8011")

def test_wechat_qrcode():
    """测试获取微信登录二维码"""
    print("\n=== 测试获取微信登录二维码 ===")
    url = f"{BASE_URL}/api/auth/wechat/qrcode"

    try:
        response = requests.get(url, timeout=10)
        print(f"状态码: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            print(f"二维码URL: {data['qr_url'][:80]}...")
            print(f"State: {data['state']}")
            print("✅ 获取二维码成功")
            return True, data
        if response.status_code == 503:
            print("⚠️ 获取二维码跳过：服务端未配置 WECHAT_APP_ID")
            return False, None
        else:
            print(f"❌ 获取二维码失败: {response.text}")
            return False, None
    except Exception as e:
        print(f"❌ 请求异常: {e}")
        return False, None


def test_wechat_bind_status(access_token):
    """测试获取微信绑定状态"""
    print("\n=== 测试获取微信绑定状态 ===")
    url = f"{BASE_URL}/api/auth/wechat/bind/status"
    headers = {
        "Authorization": f"Bearer {access_token}"
    }

    try:
        response = requests.get(url, headers=headers, timeout=10)
        print(f"状态码: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            print(f"是否已绑定: {data['is_bound']}")
            if data['wechat_user']:
                print(f"微信用户信息: {json.dumps(data['wechat_user'], ensure_ascii=False, indent=2)}")
            print("✅ 获取绑定状态成功")
            return True, data
        else:
            print(f"❌ 获取绑定状态失败: {response.text}")
            return False, None
    except Exception as e:
        print(f"❌ 请求异常: {e}")
        return False, None


def test_wechat_login_with_code(code):
    """测试使用授权码登录（需要真实的微信授权码）"""
    print("\n=== 测试微信登录 ===")
    url = f"{BASE_URL}/api/auth/wechat/login"
    params = {"code": code}

    try:
        response = requests.post(url, params=params, timeout=10)
        print(f"状态码: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            print(f"访问令牌: {data['access_token'][:20]}...")
            print(f"刷新令牌: {data['refresh_token'][:20]}...")
            print(f"用户信息: {json.dumps(data['user'], ensure_ascii=False, indent=2)}")
            print(f"是否新用户: {data['is_new_user']}")
            print("✅ 微信登录成功")
            return True, data
        else:
            print(f"❌ 微信登录失败: {response.text}")
            return False, None
    except Exception as e:
        print(f"❌ 请求异常: {e}")
        return False, None


def test_wechat_bind(code, access_token):
    """测试绑定微信（需要已登录的用户和授权码）"""
    print("\n=== 测试绑定微信 ===")
    url = f"{BASE_URL}/api/auth/wechat/bind"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    data = {"code": code}

    try:
        response = requests.post(url, json=data, headers=headers, timeout=10)
        print(f"状态码: {response.status_code}")

        if response.status_code == 200:
            wechat_user = response.json()
            print(f"绑定成功! 微信用户ID: {wechat_user['id']}")
            print(f"OpenID: {wechat_user['openid']}")
            print("✅ 绑定微信成功")
            return True
        else:
            print(f"❌ 绑定微信失败: {response.text}")
            return False
    except Exception as e:
        print(f"❌ 请求异常: {e}")
        return False


def test_wechat_unbind(access_token):
    """测试解除微信绑定"""
    print("\n=== 测试解除微信绑定 ===")
    url = f"{BASE_URL}/api/auth/wechat/bind"
    headers = {
        "Authorization": f"Bearer {access_token}"
    }

    try:
        response = requests.delete(url, headers=headers, timeout=10)
        print(f"状态码: {response.status_code}")

        if response.status_code == 200:
            print("✅ 解除绑定成功")
            return True
        else:
            print(f"❌ 解除绑定失败: {response.text}")
            return False
    except Exception as e:
        print(f"❌ 请求异常: {e}")
        return False


def check_wechat_config():
    """检查微信配置"""
    print("\n=== 检查微信配置 ===")
    app_id = os.getenv("WECHAT_APP_ID")
    app_secret = os.getenv("WECHAT_APP_SECRET")
    redirect_uri = os.getenv("WECHAT_REDIRECT_URI")

    print(f"WECHAT_APP_ID: {'已设置' if app_id else '未设置'}")
    print(f"WECHAT_APP_SECRET: {'已设置' if app_secret else '未设置'}")
    print(f"WECHAT_REDIRECT_URI: {redirect_uri or '未设置'}")

    if not app_id or not app_secret:
        print("\n⚠️ 警告：微信配置不完整！")
        print("请在 .env 文件中设置以下环境变量：")
        print("  WECHAT_APP_ID=你的微信应用ID")
        print("  WECHAT_APP_SECRET=你的微信应用密钥")
        print("  WECHAT_REDIRECT_URI=授权回调地址")
        return False

    print("✅ 微信配置完整")
    return True


def main():
    """主函数"""
    print("=" * 60)
    print("微信登录功能测试")
    print("=" * 60)

    config_ok = check_wechat_config()

    if not config_ok:
        print("\n由于微信配置不完整，获取二维码接口将返回 503。")

    success_count = 0
    total_count = 0

    total_count += 1
    success, qr_data = test_wechat_qrcode()
    if success:
        success_count += 1

    print("\n" + "=" * 60)
    print("测试说明")
    print("=" * 60)
    print("""
微信登录功能测试需要以下步骤：

1. 配置微信开放平台应用
   - 在微信开放平台注册应用获取 AppID 和 AppSecret
   - 设置授权回调域名为你的服务器地址

2. 获取授权码
   - 访问返回的二维码URL
   - 用微信扫描二维码（测试环境可能不支持）
   - 或者使用微信开放平台提供的测试号

3. 测试接口
   - GET  /api/auth/wechat/qrcode      - 获取登录二维码
   - POST /api/auth/wechat/login        - 使用授权码登录
   - GET  /api/auth/wechat/bind/status - 获取绑定状态
   - POST /api/auth/wechat/bind        - 绑定微信
   - DELETE /api/auth/wechat/bind       - 解除绑定

4. 测试脚本使用
   python test_wechat_login.py
   # 会自动测试获取二维码
   # 手动获取授权码后可以调用 test_wechat_login_with_code(code)
    """)

    print("\n" + "=" * 60)
    print(f"测试结果: {success_count}/{total_count} 通过")
    print("=" * 60)


if __name__ == "__main__":
    main()
