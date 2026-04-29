"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SearchIcon } from "lucide-react";
import type { AnalyzeSymbolSearchItem } from "@/lib/analyze-symbol-search";
import { cn } from "@/lib/utils";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";

type StockSearchComboboxProps = {
  query: string;
  onQueryChange: (next: string) => void;
  items: AnalyzeSymbolSearchItem[];
  loading: boolean;
  title: string;
  emptyMessage: string;
  placeholder?: string;
  ariaLabel?: string;
  inputId?: string;
  listId?: string;
  formatCode: (item: AnalyzeSymbolSearchItem) => string;
  onSelect: (item: AnalyzeSymbolSearchItem) => void;
  onResolveEnter: (rawQuery: string, activeItem: AnalyzeSymbolSearchItem | undefined) => void;
};

export function StockSearchCombobox({
  query,
  onQueryChange,
  items,
  loading,
  title,
  emptyMessage,
  placeholder = "代码或名称；点击或输入后选择标的",
  ariaLabel = "股票搜索",
  inputId = "stock-search-combobox-input",
  listId = "stock-search-combobox-listbox",
  formatCode,
  onSelect,
  onResolveEnter,
}: StockSearchComboboxProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const activeItem = useMemo(
    () => (items.length ? items[Math.min(activeIndex, items.length - 1)] : undefined),
    [activeIndex, items],
  );

  useEffect(() => {
    if (!open) {
      setActiveIndex(0);
      return;
    }
    setActiveIndex((prev) => {
      if (!items.length) return 0;
      return Math.min(prev, items.length - 1);
    });
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const target = event.target as Node | null;
      if (target && root.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, []);

  return (
    <div className="relative w-full min-w-0 shrink-0 sm:max-w-md lg:max-w-lg" ref={rootRef}>
      <InputGroup className="bg-background">
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          id={inputId}
          value={query}
          onChange={(e) => {
            onQueryChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              if (!items.length) return;
              setActiveIndex((prev) => (prev + 1) % items.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
              if (!items.length) return;
              setActiveIndex((prev) => (prev === 0 ? items.length - 1 : prev - 1));
              return;
            }
            if (e.key !== "Enter") return;
            e.preventDefault();
            onResolveEnter(query.trim(), activeItem);
            setOpen(false);
          }}
          placeholder={placeholder}
          aria-label={ariaLabel}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && activeItem ? `stock-search-option-${activeItem.key}` : undefined}
          autoComplete="off"
        />
        {loading ? (
          <InputGroupAddon align="inline-end" className="text-muted-foreground">
            <Spinner className="size-4" />
          </InputGroupAddon>
        ) : null}
      </InputGroup>

      {open ? (
        <section aria-label="匹配标的" className="absolute z-50 mt-1 w-full rounded-lg border bg-background p-1">
          <div className="text-muted-foreground px-2 py-1 text-xs font-medium">{title}</div>
          {items.length > 0 ? (
            <ul id={listId} role="listbox" aria-labelledby={inputId} className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {items.map((item, index) => (
                <li key={item.key}>
                  <button
                    type="button"
                    id={`stock-search-option-${item.key}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    className={cn(
                      "hover:bg-muted flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm",
                      index === activeIndex && "bg-muted",
                    )}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onSelect(item);
                      setOpen(false);
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{item.name}</span>
                      <span className="text-muted-foreground ml-2 tabular-nums">{formatCode(item)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : loading ? (
            <p className="text-muted-foreground px-2 py-3 text-sm">正在搜索...</p>
          ) : (
            <p className="text-muted-foreground px-2 py-3 text-sm">{emptyMessage}</p>
          )}
        </section>
      ) : null}
    </div>
  );
}

