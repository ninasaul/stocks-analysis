import type { FiveState } from "./types";

const BADGE: Record<FiveState, string> = {
  wait: "badge-neutral",
  trial: "badge-trial",
  add: "badge-add",
  reduce: "badge-reduce",
  exit: "badge-exit",
};

export function badgeClassForAction(action: FiveState): string {
  return BADGE[action] || "badge-neutral";
}

export function reportCardModForAction(action: FiveState): string {
  return `rep-${action}`;
}
