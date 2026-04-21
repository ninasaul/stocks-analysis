import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_ANALYZE_PREFERENCES,
  normalizeAnalyzePreferences,
  type AnalyzePreferenceAnalystRole,
  type AnalyzePreferenceDepth,
  type AnalyzePreferenceLanguage,
  type AnalyzeModelOption,
  type AnalyzePreferencesState,
} from "@/lib/analyze-preferences-schema";

export type AnalyzePreferencesSnapshot = AnalyzePreferencesState;

type AnalyzePreferencesActions = {
  setDepth: (depth: AnalyzePreferenceDepth) => void;
  setAnalystRoles: (roles: AnalyzePreferenceAnalystRole[]) => void;
  toggleAnalystRole: (id: AnalyzePreferenceAnalystRole) => void;
  setQuickModel: (m: AnalyzeModelOption) => void;
  setDeepModel: (m: AnalyzeModelOption) => void;
  setSentiment: (v: boolean) => void;
  setRiskAssessment: (v: boolean) => void;
  setLanguage: (v: AnalyzePreferenceLanguage) => void;
  resetToDefaults: () => void;
  /** 与「分析配置」弹窗在提交成功时同步，避免两套默认值分叉。 */
  syncFromDialog: (snapshot: AnalyzePreferencesSnapshot) => void;
};

export const useAnalyzePreferencesStore = create<AnalyzePreferencesState & AnalyzePreferencesActions>()(
  persist(
    (set) => ({
      ...DEFAULT_ANALYZE_PREFERENCES,

      setDepth: (depth) => set({ depth }),

      setAnalystRoles: (roles) =>
        set((s) => ({
          analystRoles: normalizeAnalyzePreferences({
            depth: s.depth,
            analystRoles: roles,
            quickModel: s.quickModel,
            deepModel: s.deepModel,
            sentiment: s.sentiment,
            riskAssessment: s.riskAssessment,
            language: s.language,
          }).analystRoles,
        })),

      toggleAnalystRole: (id) =>
        set((s) => {
          const setRoles = new Set(s.analystRoles);
          if (setRoles.has(id)) {
            if (setRoles.size <= 1) return s;
            setRoles.delete(id);
          } else {
            setRoles.add(id);
          }
          return {
            analystRoles: normalizeAnalyzePreferences({
              depth: s.depth,
              analystRoles: [...setRoles],
              quickModel: s.quickModel,
              deepModel: s.deepModel,
              sentiment: s.sentiment,
              riskAssessment: s.riskAssessment,
              language: s.language,
            }).analystRoles,
          };
        }),

      setQuickModel: (quickModel) => set({ quickModel }),
      setDeepModel: (deepModel) => set({ deepModel }),
      setSentiment: (sentiment) => set({ sentiment }),
      setRiskAssessment: (riskAssessment) => set({ riskAssessment }),
      setLanguage: (language) => set({ language }),

      resetToDefaults: () => set({ ...DEFAULT_ANALYZE_PREFERENCES }),

      syncFromDialog: (snapshot) =>
        set(() => normalizeAnalyzePreferences(snapshot)),
    }),
    {
      name: "zhputian-analyze-preferences",
      version: 1,
      partialize: (state) => ({
        depth: state.depth,
        analystRoles: state.analystRoles,
        quickModel: state.quickModel,
        deepModel: state.deepModel,
        sentiment: state.sentiment,
        riskAssessment: state.riskAssessment,
        language: state.language,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...normalizeAnalyzePreferences(
          persisted as Partial<AnalyzePreferencesState> & Record<string, unknown>,
        ),
      }),
    },
  ),
);
