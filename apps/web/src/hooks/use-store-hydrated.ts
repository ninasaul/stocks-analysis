"use client";

import { useEffect, useState } from "react";

type PersistApi = {
  hasHydrated: () => boolean;
  onFinishHydration: (fn: () => void) => () => void;
};

/** Avoid auth flash before zustand persist rehydrates from storage. */
export function useStoreHydrated(store: { persist?: PersistApi }) {
  const [hydrated, setHydrated] = useState(() => store.persist?.hasHydrated() ?? true);

  useEffect(() => {
    const p = store.persist;
    if (!p) {
      queueMicrotask(() => setHydrated(true));
      return;
    }
    if (p.hasHydrated()) {
      queueMicrotask(() => setHydrated(true));
      return;
    }
    const unsub = p.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, [store]);

  return hydrated;
}
