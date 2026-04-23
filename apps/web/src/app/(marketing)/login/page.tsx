import { Suspense } from "react";
import { LoginPageClient } from "./login-page-client";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center px-4">
          <p className="text-muted-foreground text-sm">加载中…</p>
        </div>
      }
    >
      <LoginPageClient />
    </Suspense>
  );
}
