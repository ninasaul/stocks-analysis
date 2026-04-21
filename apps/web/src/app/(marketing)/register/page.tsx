"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { loginCopy } from "@/lib/copy";
import { useStoreHydrated } from "@/hooks/use-store-hydrated";
import { useAuthStore } from "@/stores/use-auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";

const registerSchema = z
  .object({
    phone: z.string().regex(/^1\d{10}$/, "请输入有效的 11 位手机号"),
    password: z.string().min(8, "密码至少 8 位"),
    confirmPassword: z.string().min(8, "请再次输入密码"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "两次输入的密码不一致",
    path: ["confirmPassword"],
  });

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const authHydrated = useStoreHydrated(useAuthStore);
  const session = useAuthStore((s) => s.session);
  const registerPassword = useAuthStore((s) => s.registerPasswordMock);
  const [agree, setAgree] = useState(false);

  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { phone: "", password: "", confirmPassword: "" },
  });

  useEffect(() => {
    if (!authHydrated) return;
    if (session === "user") {
      router.replace("/app/analyze");
    }
  }, [authHydrated, session, router]);

  const onSubmit = form.handleSubmit((data) => {
    if (!agree) return;
    const ok = registerPassword(data.phone, data.password);
    if (ok) router.push("/app/analyze");
    else form.setError("root", { message: loginCopy.errors.registerFailed });
  });

  if (!authHydrated) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4">
        <p className="text-muted-foreground text-sm">加载中…</p>
      </div>
    );
  }

  if (session === "user") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4">
        <p className="text-muted-foreground text-sm">正在进入工作台…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center px-4 py-8">
      <Card className="w-full rounded-2xl">
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="text-2xl">注册</CardTitle>
          <p className="text-muted-foreground text-sm">
            已有账号？
            <Button variant="link" className="ml-1 h-auto p-0 text-sm" render={<Link href="/login" />}>
              去登录
            </Button>
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <form onSubmit={onSubmit} className="space-y-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="phone-register">手机号</FieldLabel>
                <Input
                  id="phone-register"
                  inputMode="numeric"
                  placeholder="请输入 11 位手机号"
                  {...form.register("phone")}
                />
                <FieldError errors={[form.formState.errors.phone]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="password-register">密码</FieldLabel>
                <Input
                  id="password-register"
                  type="password"
                  placeholder="至少 8 位密码"
                  {...form.register("password")}
                />
                <FieldError errors={[form.formState.errors.password]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="confirm-password-register">确认密码</FieldLabel>
                <Input
                  id="confirm-password-register"
                  type="password"
                  placeholder="再次输入密码"
                  {...form.register("confirmPassword")}
                />
                <FieldError errors={[form.formState.errors.confirmPassword]} />
              </Field>
            </FieldGroup>
            {form.formState.errors.root ? (
              <p className="text-destructive text-sm">{form.formState.errors.root.message}</p>
            ) : null}

            <div className="border-t pt-4">
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} className="mt-0.5" />
                <span className="text-muted-foreground leading-6">
                  我已阅读并同意
                  <Button variant="link" className="mx-1 h-auto p-0 text-sm" render={<Link href="/terms" />}>
                    服务条款
                  </Button>
                  与
                  <Button variant="link" className="mx-1 h-auto p-0 text-sm" render={<Link href="/privacy" />}>
                    隐私政策
                  </Button>
                </span>
              </label>
            </div>

            <Button type="submit" disabled={!agree} className="min-w-28">
              创建账号
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
