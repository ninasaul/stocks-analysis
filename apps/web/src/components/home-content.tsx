"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { ActivityIcon } from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiGet } from "@/lib/api";
import { useUiStore } from "@/stores/use-ui-store";

const symbolFormSchema = z.object({
  symbol: z
    .string()
    .min(1, "Enter a symbol")
    .max(12, "Too long")
    .regex(/^[A-Za-z0-9.-]+$/, "Invalid characters"),
});

type SymbolFormValues = z.infer<typeof symbolFormSchema>;

export function HomeContent() {
  const [symbolParam, setSymbolParam] = useQueryState(
    "symbol",
    parseAsString.withDefault(""),
  );

  const tipsDismissed = useUiStore((s) => s.tipsDismissed);
  const dismissTips = useUiStore((s) => s.dismissTips);
  const resetTips = useUiStore((s) => s.resetTips);

  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => apiGet<{ status: string }>("/health"),
    retry: 1,
  });

  const form = useForm<SymbolFormValues>({
    resolver: zodResolver(symbolFormSchema),
    defaultValues: { symbol: symbolParam || "" },
  });

  useEffect(() => {
    form.reset({ symbol: symbolParam || "" });
    // Intentionally only when URL-driven `symbol` changes; `form` is stable enough for reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync form from nuqs, not full form object
  }, [symbolParam]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 md:p-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Stocks analysis
        </h1>
        <p className="text-muted-foreground text-sm">
          Next.js, shadcn/ui, Zustand, TanStack Query, nuqs, Zod, React Hook Form.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ActivityIcon data-icon="inline-start" />
              API health
            </CardTitle>
            <CardDescription>TanStack Query calls FastAPI `/health`.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {health.isPending && (
              <p className="text-muted-foreground">Checking…</p>
            )}
            {health.isError && (
              <p className="text-destructive">
                {health.error.message} (is the API running on port 8000?)
              </p>
            )}
            {health.isSuccess && (
              <p className="font-mono text-muted-foreground">
                status: {health.data.status}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">URL state (nuqs)</CardTitle>
            <CardDescription>
              Query param <code className="font-mono">symbol</code> stays in the
              address bar.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="symbol-param">Watch symbol</FieldLabel>
                <Input
                  id="symbol-param"
                  value={symbolParam}
                  onChange={(e) => void setSymbolParam(e.target.value || null)}
                  placeholder="e.g. AAPL"
                />
                <FieldDescription>
                  Share or refresh the page; the value is preserved in the URL.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Form + Zod (React Hook Form)</CardTitle>
          <CardDescription>
            Validates input; sync to URL on submit for a typical filter flow.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit(async (values) => {
              await setSymbolParam(values.symbol);
            })}
          >
            <FieldGroup>
              <Field data-invalid={!!form.formState.errors.symbol}>
                <FieldLabel htmlFor="symbol-form">Symbol</FieldLabel>
                <Input
                  id="symbol-form"
                  aria-invalid={!!form.formState.errors.symbol}
                  {...form.register("symbol")}
                />
                <FieldError>{form.formState.errors.symbol?.message}</FieldError>
              </Field>
            </FieldGroup>
            <Button type="submit" size="sm">
              Apply to URL
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Zustand (client UI)</CardTitle>
          <CardDescription>Session-only UI flags, not server data.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {!tipsDismissed ? (
            <p className="text-muted-foreground">
              This panel is cheap client state; reset survives navigation until
              reload.
            </p>
          ) : (
            <p className="text-muted-foreground">Tips hidden.</p>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          {!tipsDismissed ? (
            <Button type="button" variant="outline" size="sm" onClick={dismissTips}>
              Dismiss tips
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={resetTips}>
              Show tips again
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
