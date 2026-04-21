"use client";

/**
 * 日期选择：组合 Base UI 弹层与本项目的封装组件。
 * - `Popover` / `PopoverTrigger` / `PopoverContent` → `@base-ui/react/popover`（见 `components/ui/popover.tsx`）
 * - 触发器使用 Base UI 的 `render` 传入 `Button`（`@base-ui/react/button`）
 * - `Calendar` 为 react-day-picker，仅负责日历网格样式
 */
import * as React from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";

function parseYmdLocal(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return undefined;
  return dt;
}

export type DatePickerProps = {
  value: string;
  onValueChange: (next: string) => void;
  id?: string;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
};

export function DatePicker({
  value,
  onValueChange,
  id,
  disabled,
  className,
  placeholder = "选择日期",
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = parseYmdLocal(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            className={cn("w-full justify-start font-normal", className)}
            disabled={disabled}
          >
            <CalendarIcon data-icon="inline-start" />
            {selected ? (
              format(selected, "yyyy年M月d日", { locale: zhCN })
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </Button>
        }
      />
      <PopoverContent className="w-auto gap-0 p-0" align="start">
        <PopoverTitle className="sr-only">选择日期</PopoverTitle>
        <Calendar
          mode="single"
          captionLayout="dropdown"
          fromYear={2000}
          toYear={2100}
          selected={selected}
          onSelect={(d) => {
            if (!d) return;
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            onValueChange(`${y}-${m}-${day}`);
            setOpen(false);
          }}
          locale={zhCN}
        />
      </PopoverContent>
    </Popover>
  );
}
