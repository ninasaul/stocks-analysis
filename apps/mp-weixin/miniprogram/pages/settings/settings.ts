import { MP_API_BASE_STORAGE_KEY, resolveApiBase } from "../../utils/config";

Page({
  data: {
    apiLine: "",
    storageHint: "",
  },

  onShow() {
    const base = resolveApiBase();
    getApp<IAppOption>().globalData.apiBase = base;
    this.setData({
      apiLine: base,
      storageHint: `开发联调可在调试器执行：wx.setStorageSync('${MP_API_BASE_STORAGE_KEY}', 'https://你的域名')；进入本页或下拉刷新会重新读取。`,
    });
  },

  onPullDownRefresh() {
    const base = resolveApiBase();
    getApp<IAppOption>().globalData.apiBase = base;
    this.setData({ apiLine: base });
    wx.stopPullDownRefresh();
    wx.showToast({ title: "已更新后端地址", icon: "none" });
  },

  onGoHistory() {
    wx.navigateTo({ url: "/pages/history/history" });
  },
});
