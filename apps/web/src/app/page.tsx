import { Suspense } from "react";
import { HomeContent } from "@/components/home-content";

export default function Home() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <HomeContent />
    </Suspense>
  );
}
