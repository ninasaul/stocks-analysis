import type { ArchiveEntry } from "./types";

const STORAGE_KEY = "zhputian-archives";

type PersistShape = { state?: { archives?: ArchiveEntry[] }; archives?: ArchiveEntry[] };

function readRaw(): ArchiveEntry[] {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    if (!raw || typeof raw !== "string") return [];
    const parsed = JSON.parse(raw) as PersistShape;
    if (parsed.state?.archives && Array.isArray(parsed.state.archives)) {
      return parsed.state.archives;
    }
    if (parsed.archives && Array.isArray(parsed.archives)) {
      return parsed.archives;
    }
  } catch {
    return [];
  }
  return [];
}

function writeRaw(archives: ArchiveEntry[]): void {
  const body = JSON.stringify({
    state: { archives: archives.slice(0, 200) },
    version: 0,
  });
  wx.setStorageSync(STORAGE_KEY, body);
}

export function loadArchives(): ArchiveEntry[] {
  return readRaw();
}

export function prependArchive(entry: ArchiveEntry): void {
  const prev = readRaw();
  const next = [entry, ...prev.filter((x) => x.id !== entry.id)].slice(0, 200);
  writeRaw(next);
}

export function getArchiveById(id: string): ArchiveEntry | undefined {
  return readRaw().find((a) => a.id === id);
}
