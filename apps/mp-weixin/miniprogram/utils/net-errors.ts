/** wx.request fail 的 errMsg 归一化为用户可读中文 */
export function normalizeNetworkError(errMsg: string): string {
  const m = errMsg || "";
  if (/timeout|超时/i.test(m)) return "请求超时，请检查网络后重试";
  if (/fail\s*ssl|certificate|证书/i.test(m)) return "网络或证书异常，请检查域名与 HTTPS 配置";
  if (/domain|not\s+in\s+domain|合法域名/i.test(m)) return "请求域名未在小程序后台配置，或需关闭域名校验（仅开发）";
  return m || "网络错误";
}
