"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { loginCopy } from "@/lib/copy";
import { useAuthStore } from "@/stores/use-auth-store";
import { Button } from "@/components/ui/button";

const STATE_KEY = "wechat_oauth_state";
const NEXT_KEY = "wechat_oauth_next";

export function WechatLoginCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const loginWechatCode = useAuthStore((s) => s.loginWechatCode);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    void (async () => {
      await Promise.resolve();

      const oauthErr = searchParams.get("error");
      if (oauthErr) {
        setErr(loginCopy.wechatDenied);
        return;
      }

      const code = searchParams.get("code");
      const state = searchParams.get("state");
      if (!code) {
        setErr(loginCopy.wechatCallbackMissingCode);
        return;
      }

      const saved = sessionStorage.getItem(STATE_KEY);
      if (saved && state && saved !== state) {
        setErr(loginCopy.wechatCallbackStateMismatch);
        return;
      }

      const next = sessionStorage.getItem(NEXT_KEY) || "/app/analyze";

      try {
        setMsg("正在完成登录…");
        await loginWechatCode(code);
        sessionStorage.removeItem(STATE_KEY);
        sessionStorage.removeItem(NEXT_KEY);
        router.replace(next);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "登录失败");
        setMsg(null);
      }
    })();
  }, [searchParams, loginWechatCode, router]);

  return (
    <div className="mx-auto flex min-h-[40vh] max-w-md flex-col items-center justify-center gap-4 px-4 py-12">
      {err ? (
        <>
          <p className="text-destructive text-center text-sm">{err}</p>
          <Button type="button" onClick={() => router.push("/login")}>返回登录</Button>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">{msg ?? "处理中…"}</p>
      )}
    </div>
  );
}
