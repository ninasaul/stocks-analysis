/// <reference types="miniprogram-api-typings" />

type AnalyzePrefill = {
  market: "CN" | "HK" | "US";
  symbol: string;
  name: string;
};

interface IAppOption {
  globalData: {
    apiBase: string;
    analyzePrefill: AnalyzePrefill | null;
  };
}
