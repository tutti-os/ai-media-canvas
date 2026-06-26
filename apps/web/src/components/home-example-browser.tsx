"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";

import { useAppTranslation } from "@/i18n";
import type {
  HomeExampleCard,
  HomeExampleCategory,
  HomeExampleSelection,
} from "@/lib/home-example-seeds";
import { cn } from "@/lib/utils";

function ExampleChip({
  label,
  active,
  accent,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  accent?: "special";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1 rounded-full border-[0.5px] px-3 text-xs transition-all",
        accent === "special"
          ? "border-accent bg-accent/30 text-foreground hover:bg-accent/40"
          : active
            ? "border-foreground bg-foreground text-background"
            : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
        disabled && accent !== "special" && "cursor-not-allowed opacity-60",
      )}
    >
      {accent === "special" && (
        <Sparkles aria-hidden="true" className="size-4 shrink-0" />
      )}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

function ExamplePreviewCard({
  title,
  previewImages,
  selected,
  onClick,
}: {
  title: string;
  previewImages: string[];
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={title}
      aria-pressed={selected}
      className={cn(
        "group aspect-[217/130] overflow-hidden rounded-xl px-4 pt-4 text-left transition-all duration-300",
        selected
          ? "bg-card shadow-md ring-1 ring-foreground/15"
          : "bg-card shadow-card hover:-translate-y-0.5 hover:bg-muted/70 hover:shadow-md",
      )}
    >
      <div className="flex h-20 w-full flex-col items-start gap-3 text-sm leading-5 text-foreground">
        {title}
      </div>
      <div className="relative -mt-3 h-full w-full">
        {previewImages.slice(0, 3).map((image, index) => {
          const positionClasses = [
            "left-[10%] top-0 w-[38%] -rotate-[15deg] group-hover:-translate-y-3",
            "left-[25%] -top-[10%] w-[44%] rotate-[9deg] group-hover:-translate-y-2",
            "left-[50%] top-[10%] w-[38%] rotate-[25deg] group-hover:-translate-y-2",
          ];

          return (
            <img
              key={image}
              src={image}
              alt={`${title} preview ${index + 1}`}
              loading="lazy"
              className={cn(
                "absolute aspect-[7/8] rounded-[4px] border-[0.5px] border-border object-cover transition-all duration-500 ease-out group-hover:shadow-lg",
                positionClasses[index] ?? positionClasses[0],
                selected && "shadow-lg",
              )}
            />
          );
        })}
      </div>
    </button>
  );
}

function toSelection(
  category: HomeExampleCategory,
  categoryLabel: string,
  example: HomeExampleCard,
): HomeExampleSelection {
  return {
    categoryKey: category.key,
    categoryLabel,
    exampleId: example.id,
    title: example.title,
    prompt: example.prompt,
    previewImages: example.previewImages,
    inputItems: example.inputItems,
  };
}

export function HomeExampleBrowser({
  categories,
  selectedExample,
  onExampleSelect,
}: {
  categories: HomeExampleCategory[];
  selectedExample?: HomeExampleSelection | null;
  onExampleSelect: (selection: HomeExampleSelection) => void;
}) {
  const { t } = useAppTranslation("home");
  const [internalSelection, setInternalSelection] =
    useState<HomeExampleSelection | null>(null);
  const currentSelection = selectedExample ?? internalSelection;
  const activeCategory =
    categories.find(
      (category) => category.key === currentSelection?.categoryKey,
    ) ?? null;
  const activeExamples = activeCategory?.examples ?? [];

  const getCategoryLabel = (category: HomeExampleCategory) =>
    t(`examples.categories.${category.key}`, {
      defaultValue: category.label,
    });

  const getExampleText = (example: HomeExampleCard) => ({
    title: t(`examples.cases.${example.id}.title`, {
      defaultValue: example.title,
    }),
    prompt: t(`examples.cases.${example.id}.prompt`, {
      defaultValue: example.prompt,
    }),
  });

  const applySelection = (selection: HomeExampleSelection) => {
    if (selectedExample === undefined) {
      setInternalSelection(selection);
    }
    onExampleSelect(selection);
  };

  const handleCategoryClick = (category: HomeExampleCategory) => {
    const firstExample = category.examples[0];
    if (!firstExample) return;
    applySelection(
      toSelection(category, getCategoryLabel(category), {
        ...firstExample,
        ...getExampleText(firstExample),
      }),
    );
  };

  return (
    <div className="mt-4 w-full">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {categories.map((category) => {
          const active = category.key === currentSelection?.categoryKey;
          const disabled =
            category.accent !== "special" && category.examples.length === 0;
          const label = getCategoryLabel(category);

          return (
            <ExampleChip
              key={category.key}
              label={label}
              active={active}
              {...(category.accent ? { accent: category.accent } : {})}
              disabled={disabled}
              onClick={() => handleCategoryClick(category)}
            />
          );
        })}
      </div>

      {activeExamples.length > 0 ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {activeExamples.map((example) => {
            const exampleText = getExampleText(example);
            const localizedExample = { ...example, ...exampleText };

            return (
              <ExamplePreviewCard
                key={`${activeCategory?.key ?? "active"}-${example.id}`}
                title={exampleText.title}
                previewImages={example.previewImages}
                selected={
                  currentSelection?.exampleId === example.id ||
                  (!currentSelection?.exampleId &&
                    currentSelection?.prompt === example.prompt)
                }
                onClick={() =>
                  activeCategory
                    ? applySelection(
                        toSelection(
                          activeCategory,
                          getCategoryLabel(activeCategory),
                          localizedExample,
                        ),
                      )
                    : undefined
                }
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
