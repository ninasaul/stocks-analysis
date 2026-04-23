import { Suspense } from "react";
import { WechatLoginCallback } from "./wechat-login-callback";

export default function WechatLoginCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-[40vh] max-w-md flex-col items-center justify-center gap-4 px-4 py-12">
          <p className="text-muted-foreground text-sm">处理中…</p>
        </div>
      }
    >
      <WechatLoginCallback />
    </Suspense>
  );
}
