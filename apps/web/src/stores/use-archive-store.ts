"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ArchiveEntry } from "@/lib/contracts/domain";
import { useAuthStore } from "@/stores/use-auth-store";

type ArchiveState = {
  archives: ArchiveEntry[];
  tryAddArchive: (entry: ArchiveEntry, isGuest: boolean) => void;
  getById: (id: string) => ArchiveEntry | undefined;
};

export const useArchiveStore = create<ArchiveState>()(
  persist(
    (set, get) => ({
      archives: [],
      tryAddArchive: (entry, isGuest) => {
        if (isGuest) return;
        set((s) => ({ archives: [entry, ...s.archives].slice(0, 200) }));
      },
      getById: (id) => get().archives.find((a) => a.id === id),
    }),
    { name: "zhputian-archives", partialize: (s) => ({ archives: s.archives }) },
  ),
);

/** Guest cannot persist archives per PRD; expose helper for UI checks */
export function canUseArchives() {
  return useAuthStore.getState().session === "user";
}
