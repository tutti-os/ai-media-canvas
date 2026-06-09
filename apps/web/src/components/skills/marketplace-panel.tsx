"use client";

import { useMemo, useState } from "react";
import { Download, Package, Search, ShieldCheck } from "lucide-react";
import type { SkillListItem } from "@aimc/shared";

import { Button } from "@/components/ui/button";
import { useAppTranslation } from "@/i18n";
import { cn } from "@/lib/utils";

export function MarketplacePanel({
  skills,
  loading,
  onInspect,
  onInstall,
}: {
  skills: SkillListItem[];
  loading: boolean;
  onInspect: (skill: SkillListItem) => void;
  onInstall: (skillId: string) => Promise<void>;
}) {
  const { t } = useAppTranslation("skills");
  const [query, setQuery] = useState("");
  const visibleSkills = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return skills;
    return skills.filter(
      (skill) =>
        skill.name.toLowerCase().includes(normalized) ||
        skill.description.toLowerCase().includes(normalized),
    );
  }, [query, skills]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder={t("marketplace.searchPlaceholder")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-10 w-full rounded-lg border border-input bg-transparent pl-8 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          {t("marketplace.loading")}
        </div>
      ) : visibleSkills.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          {t("marketplace.empty")}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
          {visibleSkills.map((skill) => (
            <button
              key={skill.id}
              type="button"
              onClick={() => onInspect(skill)}
              className="group rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/50"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Package className="size-3.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {skill.name}
                      </span>
                      {skill.isFeatured ? (
                        <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-medium text-foreground">
                          Featured
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {skill.author}
                    </p>
                  </div>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  v{skill.version}
                </span>
              </div>

              <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                {skill.description}
              </p>

              <div className="mt-4 flex items-center justify-between gap-3">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                    skill.installed
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <ShieldCheck className="size-3" />
                  {skill.installed
                    ? t("marketplace.installed")
                    : t("marketplace.available")}
                </span>
                <Button
                  variant={skill.installed ? "outline" : "default"}
                  size="xs"
                  disabled={skill.installed}
                  onClick={(event) => {
                    event.stopPropagation();
                    void onInstall(skill.id);
                  }}
                >
                  <Download className="size-3.5" />
                  {skill.installed
                    ? t("marketplace.alreadyLocal")
                    : t("actions.installShort")}
                </Button>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
