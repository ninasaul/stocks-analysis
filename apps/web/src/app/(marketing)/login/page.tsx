"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { QRCodeSVG } from "qrcode.react";
import { loginCopy } from "@/lib/copy";
import { useStoreHydrated } from "@/hooks/use-store-hydrated";
import { useAuthStore } from "@/stores/use-auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const phoneSchema = z.object({
  phone: z.string().regex(/^1\d{10}$/, "请输入有效的 11 位手机号"),
});

const passwordLoginSchema = phoneSchema.extend({
  password: z.string().min(8, "密码至少 8 位"),
});

const smsLoginSchema = phoneSchema.extend({
  code: z.string().length(6, "验证码为 6 位"),
});

const resetPasswordSchema = phoneSchema.extend({
  code: z.string().length(6, "验证码为 6 位"),
  newPassword: z.string().min(8, "新密码至少 8 位"),
});

type PasswordLoginForm = z.infer<typeof passwordLoginSchema>;
type SmsForm = z.infer<typeof smsLoginSchema>;
type ResetForm = z.infer<typeof resetPasswordSchema>;

function createMockWechatQrValue() {
  const nonce = Math.random().toString(36).slice(2, 10);
  return `weixin://mock-login?scene=stocks-analysis&nonce=${nonce}&ts=${Date.now()}`;
}

export default function LoginPage() {
  const router = useRouter();
  const authHydrated = useStoreHydrated(useAuthStore);
  const session = useAuthStore((s) => s.session);
  const loginPassword = useAuthStore((s) => s.loginPasswordMock);
  const loginSms = useAuthStore((s) => s.loginSmsMock);

  const [agree, setAgree] = useState(false);
  const [smsCooldown, setSmsCooldown] = useState(0);
  const [wxExpire, setWxExpire] = useState(120);
  const [wxQrValue, setWxQrValue] = useState(createMockWechatQrValue);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetCooldown, setResetCooldown] = useState(0);

  useEffect(() => {
    if (!authHydrated) return;
    if (session === "user") {
      router.replace("/app/analyze");
    }
  }, [authHydrated, session, router]);

  useEffect(() => {
    const t = window.setInterval(() => {
      setWxExpire((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (wxExpire !== 0) return;
    setWxQrValue(createMockWechatQrValue());
    setWxExpire(120);
  }, [wxExpire]);

  const loginPasswordForm = useForm<PasswordLoginForm>({
    resolver: zodResolver(passwordLoginSchema),
    defaultValues: { phone: "", password: "" },
  });

  const smsForm = useForm<SmsForm>({
    resolver: zodResolver(smsLoginSchema),
    defaultValues: { phone: "", code: "" },
  });

  const resetForm = useForm<ResetForm>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { phone: "", code: "", newPassword: "" },
  });

  const sendSmsMock = () => {
    if (smsCooldown > 0) return;
    setSmsCooldown(60);
    toast.message(loginCopy.smsSentToast);
    const t = window.setInterval(() => {
      setSmsCooldown((c) => {
        if (c <= 1) {
          window.clearInterval(t);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const onPasswordLogin = loginPasswordForm.handleSubmit((data) => {
    if (!agree) return;
    const ok = loginPassword(data.phone, data.password);
    if (ok) router.push("/app/analyze");
    else loginPasswordForm.setError("root", { message: loginCopy.errors.passwordWrong });
  });

  const onSmsLogin = smsForm.handleSubmit((data) => {
    if (!agree) return;
    const ok = loginSms(data.phone, data.code);
    if (ok) router.push("/app/analyze");
    else smsForm.setError("root", { message: loginCopy.errors.smsWrong });
  });

  const sendResetSmsMock = () => {
    if (resetCooldown > 0) return;
    setResetCooldown(60);
    const t = window.setInterval(() => {
      setResetCooldown((c) => {
        if (c <= 1) {
          window.clearInterval(t);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    toast.message(loginCopy.smsSentToast);
  };

  const onResetPassword = resetForm.handleSubmit(() => {
    toast.success(loginCopy.resetSuccessToast);
    setResetOpen(false);
    resetForm.reset();
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
          <CardTitle className="text-2xl">登录</CardTitle>
          <p className="text-muted-foreground text-sm">
            还没有账号？
            <Button variant="link" className="ml-1 h-auto p-0 text-sm" render={<Link href="/register" />}>
              去注册
            </Button>
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <Tabs defaultValue="password" className="space-y-4">
            <TabsList className="grid h-auto w-full grid-cols-3 rounded-lg bg-muted/70 p-1">
              <TabsTrigger value="password" className="rounded-md text-xs md:text-sm">
                密码
              </TabsTrigger>
              <TabsTrigger value="sms" className="rounded-md text-xs md:text-sm">
                验证码
              </TabsTrigger>
              <TabsTrigger value="wechat" className="rounded-md text-xs md:text-sm">
                微信
              </TabsTrigger>
            </TabsList>

            <TabsContent value="password">
              <form onSubmit={onPasswordLogin} className="space-y-4">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="phone-login">手机号</FieldLabel>
                    <Input
                      id="phone-login"
                      inputMode="numeric"
                      placeholder="请输入 11 位手机号"
                      {...loginPasswordForm.register("phone")}
                    />
                    <FieldError errors={[loginPasswordForm.formState.errors.phone]} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="password-login">密码</FieldLabel>
                    <Input
                      id="password-login"
                      type="password"
                      placeholder="至少 8 位密码"
                      {...loginPasswordForm.register("password")}
                    />
                    <FieldError errors={[loginPasswordForm.formState.errors.password]} />
                  </Field>
                </FieldGroup>
                {loginPasswordForm.formState.errors.root ? (
                  <p className="text-destructive text-sm">{loginPasswordForm.formState.errors.root.message}</p>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <Button type="submit" disabled={!agree} className="min-w-28">
                    登录
                  </Button>
                  <Button type="button" variant="link" className="h-auto px-1" onClick={() => setResetOpen(true)}>
                    忘记密码
                  </Button>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="sms">
              <form onSubmit={onSmsLogin} className="space-y-4">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="phone-sms">手机号</FieldLabel>
                    <Input
                      id="phone-sms"
                      inputMode="numeric"
                      placeholder="请输入 11 位手机号"
                      {...smsForm.register("phone")}
                    />
                    <FieldError errors={[smsForm.formState.errors.phone]} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="code">短信验证码</FieldLabel>
                    <div className="flex gap-2">
                      <Input
                        id="code"
                        inputMode="numeric"
                        placeholder="6 位验证码"
                        {...smsForm.register("code")}
                      />
                      <Button type="button" variant="secondary" disabled={smsCooldown > 0} onClick={sendSmsMock}>
                        {smsCooldown > 0 ? `${smsCooldown}s` : "发送"}
                      </Button>
                    </div>
                    <FieldDescription>{loginCopy.smsFieldNote}</FieldDescription>
                    <FieldError errors={[smsForm.formState.errors.code]} />
                  </Field>
                </FieldGroup>
                {smsForm.formState.errors.root ? (
                  <p className="text-destructive text-sm">{smsForm.formState.errors.root.message}</p>
                ) : null}
                <Button type="submit" disabled={!agree} className="min-w-28">
                  登录
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="wechat" className="space-y-4">
              <div className="mx-auto bg-muted/70 relative flex aspect-square max-w-[220px] items-center justify-center rounded-xl border p-3">
                <QRCodeSVG
                  value={wxQrValue}
                  size={184}
                  level="M"
                  includeMargin
                  className="h-full w-full rounded-md bg-white p-1"
                />
              </div>
              <p className="text-center text-xs text-muted-foreground">
                请使用微信扫码，二维码每 120 秒自动更新（剩余 {wxExpire}s）
              </p>
            </TabsContent>
          </Tabs>

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
        </CardContent>
      </Card>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>重置密码</DialogTitle>
            <DialogDescription>{loginCopy.resetDialogDesc}</DialogDescription>
          </DialogHeader>
          <form onSubmit={onResetPassword} className="space-y-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="reset-phone">手机号</FieldLabel>
                <Input
                  id="reset-phone"
                  inputMode="numeric"
                  placeholder="请输入 11 位手机号"
                  {...resetForm.register("phone")}
                />
                <FieldError errors={[resetForm.formState.errors.phone]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="reset-code">短信验证码</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    id="reset-code"
                    inputMode="numeric"
                    placeholder="6 位验证码"
                    {...resetForm.register("code")}
                  />
                  <Button type="button" variant="secondary" disabled={resetCooldown > 0} onClick={sendResetSmsMock}>
                    {resetCooldown > 0 ? `${resetCooldown}s` : "发送"}
                  </Button>
                </div>
                <FieldError errors={[resetForm.formState.errors.code]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="reset-new">新密码</FieldLabel>
                <Input
                  id="reset-new"
                  type="password"
                  placeholder="至少 8 位新密码"
                  {...resetForm.register("newPassword")}
                />
                <FieldError errors={[resetForm.formState.errors.newPassword]} />
              </Field>
            </FieldGroup>
            <DialogFooter className="gap-2 sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setResetOpen(false)}>
                取消
              </Button>
              <Button type="submit">完成重置</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
