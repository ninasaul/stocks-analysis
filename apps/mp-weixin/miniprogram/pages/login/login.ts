import { loginWithWxCode } from "../../utils/auth";
import { hasSession } from "../../utils/session";

Page({
  data: {
    loading: false,
    errMsg: "",
    profileNickname: "",
    profileAvatarUrl: "",
  },

  onShow() {
    if (hasSession()) {
      wx.switchTab({ url: "/pages/watchlist/watchlist" });
    }
  },

  onSkipLogin() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({ url: "/pages/watchlist/watchlist" });
      },
    });
  },

  onChooseAvatar(e: WechatMiniprogram.CustomEvent<{ avatarUrl?: string }>) {
    const avatarUrl = (e.detail?.avatarUrl || "").trim();
    this.setData({ profileAvatarUrl: avatarUrl });
  },

  onNicknameBlur(e: WechatMiniprogram.CustomEvent<{ value?: string }>) {
    const nickname = (e.detail?.value || "").trim();
    this.setData({ profileNickname: nickname });
  },

  onWechatLogin() {
    if (this.data.loading) return;
    this.setData({ loading: true, errMsg: "" });
    wx.login({
      success: (res) => {
        if (!res.code) {
          this.setData({ loading: false, errMsg: "未获取到登录 code" });
          return;
        }
        const doLogin = (profile?: { nickname?: string; avatarUrl?: string }) => {
          loginWithWxCode(res.code, profile)
            .then(() => {
              this.setData({ loading: false });
              wx.switchTab({ url: "/pages/watchlist/watchlist" });
            })
            .catch((e: Error) => {
              this.setData({ loading: false, errMsg: e.message || "登录失败" });
            });
        };

        const profile = {
          nickname: (this.data.profileNickname || "").trim() || undefined,
          avatarUrl: (this.data.profileAvatarUrl || "").trim() || undefined,
        };
        if (profile.nickname || profile.avatarUrl) {
          doLogin(profile);
          return;
        }
        doLogin();
      },
      fail: () => {
        this.setData({ loading: false, errMsg: "wx.login 失败" });
      },
    });
  },
});
