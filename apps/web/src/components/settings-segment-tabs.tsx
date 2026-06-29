"use client";

import type { ComponentType, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type SettingsSegmentTabItem<Value extends string> = {
  value: Value;
  label: string;
  description: string;
  icon?: ComponentType<{ className?: string }> | undefined;
  leading?: ReactNode;
};

export function SettingsSegmentTabs<Value extends string>({
  columns,
  items,
  value,
  onValueChange,
}: {
  columns: 2 | 3;
  items: readonly SettingsSegmentTabItem<Value>[];
  value: Value;
  onValueChange: (value: Value) => void;
}) {
  return (
    <div
      aria-orientation="horizontal"
      className={cn(
        "grid rounded-xl border bg-muted/30 p-1",
        columns === 2 ? "grid-cols-2" : "grid-cols-3",
      )}
      role="tablist"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const selected = value === item.value;

        return (
          <button
            aria-label={item.label}
            aria-selected={selected}
            className={cn(
              "flex min-h-14 items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
              selected
                ? "border-border bg-background shadow-sm"
                : "border-transparent text-muted-foreground hover:bg-background/70 hover:text-foreground",
            )}
            key={item.value}
            onClick={() => onValueChange(item.value)}
            role="tab"
            type="button"
          >
            {item.leading ? (
              item.leading
            ) : Icon ? (
              <Icon className="size-4 shrink-0" />
            ) : null}
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{item.label}</span>
              <span className="block text-xs">{item.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
