import { resolveApiBase } from "./utils/config";

App<IAppOption>({
  globalData: {
    apiBase: resolveApiBase(),
    analyzePrefill: null,
  },
  onLaunch() {
    this.globalData.apiBase = resolveApiBase();
  },
});
