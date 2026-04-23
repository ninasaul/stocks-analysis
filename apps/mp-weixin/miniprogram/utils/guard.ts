/**
 * 小程序登录策略（与 Web 全站壳层强制跳转登录不同）：
 * - 不拦截 Tab 浏览；未登录可查看页面与本地数据。
 * - 仅在需要鉴权的能力点调用 promptNavigateToLogin，弹窗后 navigateTo 登录页（保留 Tab 栈，不 reLaunch）。
 */
export function promptNavigateToLogin(options?: { title?: string; content?: string }): void {
  wx.showModal({
    title: options?.title ?? "需要登录",
    content:
      options?.content ??
      "登录后可执行股票预测并同步账号信息。",
    confirmText: "去登录",
    cancelText: "取消",
    success(res) {
      if (res.confirm) {
        wx.navigateTo({ url: "/pages/login/login" });
      }
    },
  });
}

export { hasSession } from "./session";
