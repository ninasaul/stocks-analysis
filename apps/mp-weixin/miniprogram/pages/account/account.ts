import { bindMiniprogramPhoneCode, fetchCurrentUser, logoutRemote } from "../../utils/auth";
import { hasSession } from "../../utils/guard";
import { getAccessToken, getRefreshToken, getStoredUser, saveSession, type StoredUser } from "../../utils/session";
import { loadSubscriptionDisplay, type SubscriptionDisplay } from "../../utils/subscription-local";
import { loadWatchlist } from "../../utils/watchlist";
import { loadArchives } from "../../utils/archive";

function maskPhone(phone?: string | null): string {
  if (!phone) return "";
  if (!/^1\d{10}$/.test(phone)) return phone;
  return `${phone.slice(0, 3)} **** ${phone.slice(-4)}`;
}

function isPlaceholderUsername(username?: string): boolean {
  if (!username) return false;
  return username.startsWith("wechat_mp_") || username.startsWith("wechat_");
}

function resolveDisplayName(user: StoredUser | null): string {
  const displayName = String(user?.display_name || "").trim();
  if (displayName) return displayName;
  const username = String(user?.username || "").trim();
  if (!username || isPlaceholderUsername(username)) return "微信用户";
  return username;
}

function resolveAccountIdLine(user: StoredUser | null): string {
  if (!user) return "";
  const username = String(user?.username || "").trim();
  if (!username) return user?.id ? `ID ${user.id}` : "";
  if (isPlaceholderUsername(username)) {
    const tail = username.slice(-6).toUpperCase();
    return `ID ${tail}`;
  }
  return username;
}

function resolveAvatarLabel(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : "Z";
}

function nowHm(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isSameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function loadLocalStats(): { watch: number; reports: number; today: number } {
  const watch = loadWatchlist().length;
  const archives = loadArchives();
  const now = Date.now();
  let today = 0;
  for (const a of archives) {
    const ts = typeof a.created_at === "number" ? a.created_at : Date.parse(String(a.created_at || ""));
    if (!Number.isFinite(ts)) continue;
    if (isSameDay(ts, now)) today += 1;
  }
  return { watch, reports: archives.length, today };
}

function readAppVersion(): string {
  try {
    const info = wx.getAccountInfoSync();
    const ver = info.miniProgram?.version || "";
    if (ver) return `v${ver}`;
  } catch {
    // ignore
  }
  return "开发版";
}

type AccountData = {
  guest: boolean;
  displayName: string;
  accountIdLine: string;
  phoneMasked: string;
  hasPhone: boolean;
  avatarUrl: string;
  avatarLabel: string;
  connectionLine: string;

  isPro: boolean;
  planName: string;
  planPeriodLine: string;
  autoRenewLine: string;
  planCtaLabel: string;

  statsWatch: number;
  statsReports: number;
  statsToday: number;

  syncing: boolean;
  syncStamp: string;
  phoneBinding: boolean;
  logoutPending: boolean;

  appVersion: string;
};

Page({
  data: {
    guest: true,
    displayName: "未登录",
    accountIdLine: "",
    phoneMasked: "",
    hasPhone: false,
    avatarUrl: "",
    avatarLabel: "Z",
    connectionLine: "登录后解锁跨端同步",

    isPro: false,
    planName: "免费版",
    planPeriodLine: "登录后查看订阅状态",
    autoRenewLine: "未开启",
    planCtaLabel: "了解专业版",

    statsWatch: 0,
    statsReports: 0,
    statsToday: 0,

    syncing: false,
    syncStamp: "--:--",
    phoneBinding: false,
    logoutPending: false,

    appVersion: "",
  } as AccountData,

  onLoad() {
    this.setData({ appVersion: readAppVersion() });
  },

  setGuestView() {
    const stats = loadLocalStats();
    this.setData({
      guest: true,
      displayName: "未登录",
      accountIdLine: "",
      phoneMasked: "",
      hasPhone: false,
      avatarUrl: "",
      avatarLabel: "Z",
      connectionLine: "登录后解锁跨端同步与订阅权益",

      isPro: false,
      planName: "免费版",
      planPeriodLine: "登录后查看订阅状态",
      autoRenewLine: "未开启",
      planCtaLabel: "了解专业版",

      statsWatch: stats.watch,
      statsReports: stats.reports,
      statsToday: stats.today,

      syncing: false,
      syncStamp: "--:--",
    } as Partial<AccountData>);
  },

  applyUserView(user: StoredUser | null) {
    const sub: SubscriptionDisplay = loadSubscriptionDisplay();
    const displayName = resolveDisplayName(user);
    const phone = String(user?.phone || "").trim();
    const stats = loadLocalStats();

    this.setData({
      guest: false,
      displayName,
      accountIdLine: resolveAccountIdLine(user),
      phoneMasked: maskPhone(phone || undefined),
      hasPhone: Boolean(phone),
      avatarUrl: String(user?.avatar_url || "").trim(),
      avatarLabel: resolveAvatarLabel(displayName),
      connectionLine: "微信已连接 · 跨端数据实时同步",

      isPro: sub.isPro,
      planName: sub.planName,
      planPeriodLine: sub.periodLine,
      autoRenewLine: sub.autoRenewLine,
      planCtaLabel: sub.isPro ? "管理订阅" : "升级专业版",

      statsWatch: stats.watch,
      statsReports: stats.reports,
      statsToday: stats.today,

      syncStamp: nowHm(),
    } as Partial<AccountData>);
  },

  syncUser(showToast = false, done?: () => void) {
    const token = getAccessToken();
    if (!token) {
      done?.();
      return;
    }

    this.setData({ syncing: true });
    void fetchCurrentUser()
      .then((fresh) => {
        const refreshToken = getRefreshToken();
        if (refreshToken) {
          saveSession({
            access_token: token,
            refresh_token: refreshToken,
            user: fresh,
          });
        }
        this.setData({ syncing: false });
        this.applyUserView(fresh);
        if (showToast) wx.showToast({ title: "已刷新", icon: "success" });
      })
      .catch(() => {
        this.setData({ syncing: false });
        if (showToast) wx.showToast({ title: "同步失败，请稍后重试", icon: "none" });
      })
      .finally(() => done?.());
  },

  onShow() {
    if (!hasSession()) {
      this.setGuestView();
      return;
    }
    this.applyUserView(getStoredUser());
    this.syncUser();
  },

  onPullDownRefresh() {
    if (!hasSession() || this.data.guest) {
      wx.stopPullDownRefresh();
      return;
    }
    this.syncUser(true, () => wx.stopPullDownRefresh());
  },

  onGoLogin() {
    wx.navigateTo({ url: "/pages/login/login" });
  },

  onSettings() {
    wx.navigateTo({ url: "/pages/settings/settings" });
  },

  onGoHistory() {
    wx.navigateTo({ url: "/pages/history/history" });
  },

  onManualSync() {
    if (this.data.syncing || this.data.guest) return;
    this.syncUser(true);
  },

  onTapPlan() {
    wx.showModal({
      title: this.data.isPro ? "订阅管理" : "专业版权益",
      content: this.data.isPro
        ? "订阅的续费与发票管理请在 Web 端完成，小程序将自动同步最新状态。"
        : "专业版提供更高频的 AI 分析额度与全量选股能力，请在 Web 端完成升级，小程序会自动同步。",
      showCancel: false,
      confirmText: "知道了",
    });
  },

  onTapPhoneCell() {
    if (this.data.hasPhone) {
      wx.showToast({ title: "手机号已绑定", icon: "none" });
    }
  },

  onTapCompliance() {
    wx.showModal({
      title: "合规与免责",
      content: "本产品提供的分析内容仅供研究参考，不构成任何投资建议，不提供交易执行能力。投资有风险，决策需谨慎。",
      showCancel: false,
      confirmText: "我知道了",
    });
  },

  onTapAbout() {
    wx.showModal({
      title: "关于",
      content: `智谱投研 小程序 ${this.data.appVersion || "开发版"}\n移动端提供轻量查询与账户管理，完整功能请在 Web 端使用。`,
      showCancel: false,
      confirmText: "知道了",
    });
  },

  async onGetPhoneNumber(e: WechatMiniprogram.TouchEvent) {
    const d = e.detail as { errMsg?: string; code?: string };
    if (d.errMsg !== "getPhoneNumber:ok") {
      wx.showToast({ title: "未授权或已取消", icon: "none" });
      return;
    }
    const code = d.code;
    if (!code) {
      wx.showToast({ title: "未拿到手机号凭证", icon: "none" });
      return;
    }
    if (this.data.phoneBinding) return;

    this.setData({ phoneBinding: true });
    try {
      const fresh = await bindMiniprogramPhoneCode(code);
      const token = getAccessToken();
      const refreshToken = getRefreshToken();
      if (token && refreshToken) {
        saveSession({ access_token: token, refresh_token: refreshToken, user: fresh });
      }
      this.applyUserView(fresh);
      wx.showToast({ title: "手机号已绑定", icon: "success" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "绑定失败";
      wx.showToast({ title: msg, icon: "none", duration: 3200 });
    } finally {
      this.setData({ phoneBinding: false });
    }
  },

  async onLogout() {
    if (this.data.logoutPending) return;
    const { confirm } = await wx.showModal({
      title: "退出登录",
      content: "退出后将清除本地登录状态，是否继续？",
      confirmText: "退出",
      cancelText: "取消",
      confirmColor: "#d92d20",
    });
    if (!confirm) return;

    this.setData({ logoutPending: true });
    try {
      await logoutRemote();
      this.setGuestView();
      wx.showToast({ title: "已退出登录", icon: "success" });
    } finally {
      this.setData({ logoutPending: false });
    }
  },
});
