"use client";

import { useStoreHydrated } from "@/hooks/use-store-hydrated";
import { useNotificationPreferencesStore } from "@/stores/use-notification-preferences-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldTitle,
} from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { PageLoadingState } from "@/components/features/page-state";

export default function SettingsNotificationsPage() {
  const hydrated = useStoreHydrated(useNotificationPreferencesStore);
  const notifyTaskComplete = useNotificationPreferencesStore((s) => s.notifyTaskComplete);
  const notifyWorkspaceActions = useNotificationPreferencesStore((s) => s.notifyWorkspaceActions);
  const setNotifyTaskComplete = useNotificationPreferencesStore((s) => s.setNotifyTaskComplete);
  const setNotifyWorkspaceActions = useNotificationPreferencesStore((s) => s.setNotifyWorkspaceActions);
  const resetNotificationPreferences = useNotificationPreferencesStore((s) => s.resetNotificationPreferences);

  if (!hydrated) {
    return (
      <Card role="region" aria-labelledby="settings-subsection-notifications">
        <CardHeader>
          <CardTitle id="settings-subsection-notifications">通知设置</CardTitle>
          <CardDescription>控制页面内成功提示。</CardDescription>
        </CardHeader>
        <CardContent>
          <PageLoadingState title="正在加载通知偏好" description="正在读取本机保存的开关状态。" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card role="region" aria-labelledby="settings-subsection-notifications">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <CardTitle id="settings-subsection-notifications">通知设置</CardTitle>
          <CardDescription>关闭后，对应成功提示不再弹出；错误提示仍会保留。</CardDescription>
        </div>
        <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => resetNotificationPreferences()}>
          恢复默认
        </Button>
      </CardHeader>
      <CardContent>
        <FieldGroup className="gap-0">
          <Field orientation="responsive">
            <FieldContent>
              <FieldTitle id="settings-notify-task-label">报告与交接提示</FieldTitle>
              <FieldDescription>报告生成、选股交接等成功反馈。</FieldDescription>
            </FieldContent>
            <Switch
              checked={notifyTaskComplete}
              onCheckedChange={(v) => setNotifyTaskComplete(Boolean(v))}
              aria-labelledby="settings-notify-task-label"
            />
          </Field>
          <Separator className="my-4" />
          <Field orientation="responsive">
            <FieldContent>
              <FieldTitle id="settings-notify-workspace-label">导出与复制成功提示</FieldTitle>
              <FieldDescription>导出、复制等操作完成后的反馈。</FieldDescription>
            </FieldContent>
            <Switch
              checked={notifyWorkspaceActions}
              onCheckedChange={(v) => setNotifyWorkspaceActions(Boolean(v))}
              aria-labelledby="settings-notify-workspace-label"
            />
          </Field>
        </FieldGroup>
      </CardContent>
      <CardFooter className="text-muted-foreground text-xs leading-relaxed">
        浏览器或系统级推送不在此配置范围内。
      </CardFooter>
    </Card>
  );
}
