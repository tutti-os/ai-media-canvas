"use client";

import { useMemo, useState } from "react";

import type {
  HomeDiscoveryCategory,
  HomeDiscoveryCase,
  HomeDiscoverySelection,
} from "@/lib/home-discovery-seeds";
import { useAppTranslation } from "@/i18n";
import { cn } from "@/lib/utils";

type HomeDiscoveryGalleryProps = {
  categories: HomeDiscoveryCategory[];
  onCaseSelect: (selection: HomeDiscoverySelection) => void;
};

function DiscoveryTab({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-muted-foreground hover:border-foreground/25 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

export function HomeDiscoveryGallery({
  categories,
  onCaseSelect,
}: HomeDiscoveryGalleryProps) {
  const { t } = useAppTranslation("home");
  const [activeCategoryKey, setActiveCategoryKey] = useState<string>("all");

  const visibleCases = useMemo<
    Array<HomeDiscoveryCase & { categoryKey: string; categoryLabel: string }>
  >(() => {
    const localizeCase = (
      item: HomeDiscoveryCase,
      category: HomeDiscoveryCategory,
    ) => ({
      ...item,
      categoryKey: category.key,
      categoryLabel: t(`discovery.categories.${category.key}`, {
        defaultValue: category.label,
      }),
      prompt: t(`discovery.cases.${item.id}.prompt`, {
        defaultValue: item.prompt,
      }),
    });

    if (activeCategoryKey === "all") {
      return categories.flatMap((category) =>
        category.cases.map((item) => localizeCase(item, category)),
      );
    }

    const category = categories.find((item) => item.key === activeCategoryKey);
    if (!category) return [];

    return category.cases.map((item) => localizeCase(item, category));
  }, [activeCategoryKey, categories, t]);

  if (categories.length === 0) return null;

  return (
    <section className="mt-14 w-full">
      <div className="mb-5 flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium text-foreground">
              {t("discovery.title")}
            </h2>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <DiscoveryTab
            active={activeCategoryKey === "all"}
            label={t("discovery.all")}
            onClick={() => setActiveCategoryKey("all")}
          />
          {categories.map((category) => (
            <DiscoveryTab
              key={category.key}
              active={activeCategoryKey === category.key}
              label={t(`discovery.categories.${category.key}`, {
                defaultValue: category.label,
              })}
              onClick={() => setActiveCategoryKey(category.key)}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visibleCases.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-label={item.title}
            onClick={() => onCaseSelect(item)}
            className="group overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
          >
            <div className="relative aspect-[4/4.6] overflow-hidden bg-muted">
              <img
                src={item.coverImageUrl}
                alt={item.title}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent p-4">
                <span className="inline-flex rounded-full bg-white/12 px-2 py-1 text-[11px] text-white/85 backdrop-blur-sm">
                  {item.categoryLabel}
                </span>
                <p className="mt-2 line-clamp-2 text-sm font-medium text-white">
                  {item.title}
                </p>
              </div>
            </div>

            <div className="px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <img
                    src={item.authorAvatarUrl}
                    alt=""
                    className="h-6 w-6 rounded-full object-cover"
                  />
                  <span className="truncate text-sm text-foreground">
                    {item.authorName}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-left text-xs leading-5 text-muted-foreground">
                  {item.prompt}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
