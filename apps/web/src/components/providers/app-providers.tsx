"use client";

import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { GlobalAnalyzeTaskWatcher } from "@/components/features/global-analyze-task-watcher";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Suspense, useState } from "react";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <NuqsAdapter>
        <ThemeProvider defaultTheme="system" enableSystem>
          <TooltipProvider>
            {children}
            <Toaster />
            <Suspense fallback={null}>
              <GlobalAnalyzeTaskWatcher />
            </Suspense>
          </TooltipProvider>
        </ThemeProvider>
      </NuqsAdapter>
    </QueryClientProvider>
  );
}
