"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { accountCopy } from "@/lib/copy";
import { useAuthStore } from "@/stores/use-auth-store";
import { useSubscriptionStore } from "@/stores/use-subscription-store";
import { useStoreHydrated } from "@/hooks/use-store-hydrated";
import {
  requestCurrentMembership,
  requestCurrentUserProfile,
  requestUpdateCurrentUserProfile,
  type UserApiResult,
} from "@/lib/api/users";
import type { MembershipApiResult } from "@/lib/api/subscription";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageLoadingState } from "@/components/features/page-state";

function userStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "active":
      return "正常";
    case "idle":
      return "未激活";
    case "disabled":
      return "已禁用";
    case "suspended":
      return "已冻结";
    case "unknown":
    case null:
    case undefined:
      return "未知";
    default:
      return status;
  }
}

export default function AccountPage() {
  const router = useRouter();
  const authHydrated = useStoreHydrated(useAuthStore);
  const subHydrated = useStoreHydrated(useSubscriptionStore);
  const session = useAuthStore((s) => s.session);
  const syncSession = useAuthStore((s) => s.syncSession);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const getPlan = useSubscriptionStore((s) => s.getPlan);
  const currentPlanId = useSubscriptionStore((s) => s.currentPlanId);
  const billingCycle = useSubscriptionStore((s) => s.billingCycle);
  const periodEnd = useSubscriptionStore((s) => s.periodEnd);
  const autoRenew = useSubscriptionStore((s) => s.autoRenew);
  const [logoutPending, setLogoutPending] = useState(false);
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserApiResult | null>(null);
  const [membership, setMembership] = useState<MembershipApiResult | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [avatarUrlInput, setAvatarUrlInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");

  const subscriptionReady = subHydrated;
  const backendSubscription = useMemo(() => {
    if (!membership) return null;
    if (membership.type === "normal") {
      return {
        planId: "free" as const,
        billingCycle: null,
        periodEnd: null,
        autoRenew: false,
      };
    }
    if (membership.type === "premium_quarterly") {
      return {
        planId: "pro" as const,
        billingCycle: "quarter" as const,
        periodEnd: membership.end_date?.slice(0, 10) ?? null,
        autoRenew: membership.status === "active",
      };
    }
    if (membership.type === "premium_yearly") {
      return {
        planId: "pro" as const,
        billingCycle: "year" as const,
        periodEnd: membership.end_date?.slice(0, 10) ?? null,
        autoRenew: membership.status === "active",
      };
    }
    return {
      planId: "pro" as const,
      billingCycle: "month" as const,
      periodEnd: membership.end_date?.slice(0, 10) ?? null,
      autoRenew: membership.status === "active",
    };
  }, [membership]);

  const displayPlanId = backendSubscription?.planId ?? currentPlanId;
  const displayBillingCycle = backendSubscription?.billingCycle ?? billingCycle;
  const displayPeriodEnd = backendSubscription?.periodEnd ?? periodEnd;
  const displayAutoRenew = backendSubscription?.autoRenew ?? autoRenew;

  useEffect(() => {
    let cancelled = false;
    if (!authHydrated || session !== "user") {
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      setMembershipLoading(true);
      setProfileLoading(true);
      setLoadError(null);
      try {
        await syncSession();
        const latest = useAuthStore.getState();
        if (latest.session !== "user" || !latest.accessToken) {
          throw new Error("登录状态已失效，请重新登录");
        }
        const [me, membershipResult] = await Promise.all([
          requestCurrentUserProfile(latest.accessToken),
          requestCurrentMembership(latest.accessToken),
        ]);
        if (!cancelled) {
          setProfile(me);
          setDisplayNameInput(me.display_name ?? "");
          setAvatarUrlInput(me.avatar_url ?? "");
          setEmailInput(me.email ?? "");
          setPhoneInput(me.phone ?? "");
          setMembership(membershipResult);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "获取账户信息失败");
        }
      } finally {
        if (!cancelled) {
          setMembershipLoading(false);
          setProfileLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authHydrated, session, syncSession]);

  if (!authHydrated || !subscriptionReady) {
    return (
      <PageLoadingState title="正在加载账号信息" description="请稍候，正在同步你的账号状态。" />
    );
  }

  const onSaveProfile = async () => {
    const latest = useAuthStore.getState();
    if (latest.session !== "user" || !latest.accessToken) {
      setSaveError("登录状态已失效，请重新登录");
      return;
    }
    setSavingProfile(true);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      const updated = await requestUpdateCurrentUserProfile(latest.accessToken, {
        display_name: displayNameInput.trim() || undefined,
        avatar_url: avatarUrlInput.trim() || undefined,
        email: emailInput.trim(),
        phone: phoneInput.trim() || undefined,
      });
      setProfile(updated);
      setDisplayNameInput(updated.display_name ?? "");
      setAvatarUrlInput(updated.avatar_url ?? "");
      setEmailInput(updated.email ?? "");
      setPhoneInput(updated.phone ?? "");
      setSaveSuccess("账号信息已更新");
      setProfileDialogOpen(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "更新账号信息失败");
    } finally {
      setSavingProfile(false);
    }
  };

  const openProfileDialog = () => {
    setDisplayNameInput(profile?.display_name ?? "");
    setAvatarUrlInput(profile?.avatar_url ?? "");
    setEmailInput(profile?.email ?? "");
    setPhoneInput(profile?.phone ?? "");
    setSaveError(null);
    setSaveSuccess(null);
    setProfileDialogOpen(true);
  };

  return (
    <>
        <Card>
          <CardHeader>
            <CardTitle>个人信息</CardTitle>
            <CardDescription>管理昵称、头像、邮箱和手机号等账号信息。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <div className="flex items-center gap-3">
              <Avatar size="lg">
                <AvatarImage src={avatarUrlInput || undefined} alt="用户头像" />
                <AvatarFallback>
                  {(displayNameInput || profile?.username || "用户").slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-medium">{displayNameInput || profile?.username || "未设置昵称"}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {profile?.email || "未设置邮箱"}
                </p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">昵称</p>
                <p className="font-medium">{profile?.display_name || "未设置"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">用户名</p>
                <p className="font-medium">{profile?.username || user?.username || "暂未获取"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">邮箱</p>
                <p className="font-medium break-all">{profile?.email || "未设置"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">手机号</p>
                <p className="font-medium">{profile?.phone || "未设置"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">账号标识</p>
                <p className="font-medium">{user?.phoneMasked || "暂未获取账号标识"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">微信绑定</p>
                <p className="font-medium">{user?.wechatBound ? accountCopy.wechatBound : accountCopy.wechatNotBound}</p>
              </div>
              <div className="space-y-1 md:col-span-2">
                <p className="text-muted-foreground text-xs">账号状态</p>
                <Badge variant="secondary" className="w-fit">
                  {userStatusLabel(profile?.status)}
                </Badge>
              </div>
            </div>
            {profileLoading ? (
              <p className="text-muted-foreground inline-flex items-center gap-2">
                <Spinner />
                正在加载个人信息
              </p>
            ) : null}
            {saveSuccess ? <p className="text-sm text-emerald-600">{saveSuccess}</p> : null}
          </CardContent>
          <CardFooter className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={openProfileDialog}>
              编辑资料
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={logoutPending}
              onClick={async () => {
                if (logoutPending) return;
                setLogoutPending(true);
                try {
                  await logout();
                  router.push("/");
                } finally {
                  setLogoutPending(false);
                }
              }}
            >
              {logoutPending ? (
                <>
                  <Spinner />
                  退出中
                </>
              ) : (
                "退出登录"
              )}
            </Button>
          </CardFooter>
        </Card>
        <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>编辑个人信息</DialogTitle>
              <DialogDescription>更新昵称、头像、邮箱和手机号后将同步到账号资料。</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 text-sm">
              <label className="grid gap-1">
                <span className="text-muted-foreground">昵称</span>
                <Input
                  value={displayNameInput}
                  onChange={(event) => setDisplayNameInput(event.target.value)}
                  placeholder="请输入展示昵称"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-muted-foreground">头像地址</span>
                <Input
                  value={avatarUrlInput}
                  onChange={(event) => setAvatarUrlInput(event.target.value)}
                  placeholder="请输入头像 URL（可选）"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-muted-foreground">邮箱</span>
                <Input
                  value={emailInput}
                  onChange={(event) => setEmailInput(event.target.value)}
                  placeholder="请输入邮箱"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-muted-foreground">手机号</span>
                <Input
                  value={phoneInput}
                  onChange={(event) => setPhoneInput(event.target.value)}
                  placeholder="请输入手机号（可选）"
                />
              </label>
              {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setProfileDialogOpen(false)}>
                取消
              </Button>
              <Button type="button" disabled={savingProfile} onClick={onSaveProfile}>
                {savingProfile ? (
                  <>
                    <Spinner />
                    保存中
                  </>
                ) : (
                  "保存资料"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Card>
          <CardHeader>
            <CardTitle>订阅与套餐</CardTitle>
            <CardDescription>当前档位与计费周期；变更套餐请前往订阅页。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">当前</span>
              <Badge variant={displayPlanId === "pro" ? "default" : "secondary"}>
                {getPlan(displayPlanId).name}
              </Badge>
              {displayPlanId === "pro" && displayBillingCycle ? (
                <span className="text-muted-foreground">
                  · {displayBillingCycle === "month" ? "月付" : displayBillingCycle === "quarter" ? "季付" : "年付"}
                </span>
              ) : null}
            </div>
            {displayPeriodEnd ? (
              <p className="text-muted-foreground">
                当前周期至 <span className="text-foreground font-medium tabular-nums">{displayPeriodEnd}</span>
                ，自动续费：{displayAutoRenew ? "开" : "关"}
              </p>
            ) : (
              <p className="text-muted-foreground">未开通付费套餐。</p>
            )}
            {membershipLoading ? (
              <p className="text-muted-foreground inline-flex items-center gap-2">
                <Spinner />
                正在同步后端会员状态
              </p>
            ) : null}
            {loadError ? (
              <p className="text-sm text-destructive">{loadError}</p>
            ) : null}
          </CardContent>
          <CardFooter>
            <Button type="button" variant="outline" onClick={() => router.push("/app/account/subscription")}>
              查看订阅与用量
            </Button>
          </CardFooter>
        </Card>

    </>
  );
}
