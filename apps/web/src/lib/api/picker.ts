import { getPublicApiBaseUrl } from "@/lib/env";
import { useAuthStore } from "@/stores/use-auth-store";

export type DialogueMode = "prompt" | "direct";

export type PickerTurnRequest = {
  session_id: string;
  text: string;
  mode?: DialogueMode;
};

export type PickerTurnResponse = {
  response: string;
  extension_questions: string[];
  session_id: string;
  history?: Array<{ role?: string; content?: string; timestamp?: string }>;
  criteria?: Record<string, unknown>;
};

export type PickerHistoryItem = {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
};

export type PickerHistoryResponse = {
  history: PickerHistoryItem[];
  session_id: string;
};

export async function requestPickerTurn(req: PickerTurnRequest): Promise<PickerTurnResponse> {
  const state = useAuthStore.getState();
  if (state.session !== "user" || !state.accessToken) {
    throw new Error("未登录，无法发送选股对话请求");
  }

  const text = req.text.trim();
  if (!text) {
    throw new Error("消息不能为空");
  }

  const url = new URL("/api/dialogue/sync", getPublicApiBaseUrl());
  url.searchParams.set("message", text);
  url.searchParams.set("mode", req.mode ?? "prompt");
  if (req.session_id.trim()) {
    url.searchParams.set("session_id", req.session_id.trim());
  }

  const response = await state.authenticatedFetch(url.toString(), { method: "POST" });
  if (!response.ok) {
    throw new Error(`对话请求失败（${response.status}）`);
  }

  const payload = (await response.json()) as Partial<PickerTurnResponse>;
  return {
    response: String(payload.response ?? "").trim(),
    extension_questions: Array.isArray(payload.extension_questions)
      ? payload.extension_questions
          .map((item) => String(item ?? "").trim())
          .filter((item) => item.length > 0)
      : [],
    session_id: String(payload.session_id ?? req.session_id),
    history: Array.isArray(payload.history) ? payload.history : [],
    criteria:
      payload.criteria && typeof payload.criteria === "object"
        ? (payload.criteria as Record<string, unknown>)
        : {},
  };
}

type RequestPickerTurnStreamOptions = {
  onChunk?: (chunk: string) => void;
};

export async function requestPickerTurnStream(
  req: PickerTurnRequest,
  options: RequestPickerTurnStreamOptions = {},
): Promise<PickerTurnResponse> {
  const state = useAuthStore.getState();
  if (state.session !== "user" || !state.accessToken) {
    throw new Error("未登录，无法发送选股对话请求");
  }

  const text = req.text.trim();
  if (!text) {
    throw new Error("消息不能为空");
  }

  const url = new URL("/api/dialogue/stream", getPublicApiBaseUrl());
  url.searchParams.set("message", text);
  url.searchParams.set("mode", req.mode ?? "prompt");
  if (req.session_id.trim()) {
    url.searchParams.set("session_id", req.session_id.trim());
  }

  const response = await state.authenticatedFetch(url.toString(), { method: "POST" });
  if (!response.ok || !response.body) {
    throw new Error(`对话流请求失败（${response.status}）`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let fullResponse = "";
  let extensionQuestions: string[] = [];

  const flushEvent = (eventBlock: string) => {
    const lines = eventBlock
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"));
    for (const line of lines) {
      const dataText = line.replace(/^data:\s*/, "");
      if (!dataText) continue;
      let payload: { chunk?: unknown; extension_questions?: unknown };
      try {
        payload = JSON.parse(dataText) as { chunk?: unknown; extension_questions?: unknown };
      } catch {
        continue;
      }
      const chunk = typeof payload.chunk === "string" ? payload.chunk : "";
      if (chunk) {
        fullResponse += chunk;
        options.onChunk?.(chunk);
      }
      if (Array.isArray(payload.extension_questions)) {
        extensionQuestions = payload.extension_questions
          .map((item) => String(item ?? "").trim())
          .filter((item) => item.length > 0);
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let splitIndex = buffer.indexOf("\n\n");
    while (splitIndex !== -1) {
      const eventBlock = buffer.slice(0, splitIndex);
      buffer = buffer.slice(splitIndex + 2);
      flushEvent(eventBlock);
      splitIndex = buffer.indexOf("\n\n");
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) flushEvent(buffer);

  return {
    response: fullResponse.trim(),
    extension_questions: extensionQuestions,
    session_id: req.session_id,
    history: [],
    criteria: {},
  };
}

export async function requestPickerHistory(sessionId: string): Promise<PickerHistoryResponse> {
  const state = useAuthStore.getState();
  if (state.session !== "user" || !state.accessToken) {
    throw new Error("未登录，无法获取对话历史");
  }

  const url = new URL("/api/dialogue/history", getPublicApiBaseUrl());
  if (sessionId.trim()) {
    url.searchParams.set("session_id", sessionId.trim());
  }

  const response = await state.authenticatedFetch(url.toString(), { method: "GET" });
  if (!response.ok) {
    throw new Error(`获取对话历史失败（${response.status}）`);
  }

  const payload = (await response.json()) as Partial<PickerHistoryResponse>;
  return {
    history: Array.isArray(payload.history)
      ? payload.history
          .map((item) => ({
            role: (item?.role === "user" ? "user" : "assistant") as "user" | "assistant",
            content: String(item?.content ?? "").trim(),
            timestamp: item?.timestamp,
          }))
          .filter((item) => item.content.length > 0)
      : [],
    session_id: String(payload.session_id ?? sessionId),
  };
}

export async function clearPickerHistory(sessionId?: string): Promise<boolean> {
  const state = useAuthStore.getState();
  if (state.session !== "user" || !state.accessToken) {
    return false;
  }

  const url = new URL("/api/dialogue/history", getPublicApiBaseUrl());
  if (sessionId?.trim()) {
    url.searchParams.set("session_id", sessionId.trim());
  }

  const response = await state.authenticatedFetch(url.toString(), { method: "DELETE" });
  if (!response.ok) {
    throw new Error(`清除对话历史失败（${response.status}）`);
  }

  const payload = (await response.json()) as { success?: unknown };
  return Boolean(payload.success);
}
