"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ListFilter, Plus, Search, ShieldCheck } from "lucide-react";
import type {
  SkillCategory,
  SkillDetail,
  SkillImportRequest,
  SkillListItem,
} from "@aimc/shared";

import { CreateSkillDialog } from "@/components/skills/create-skill-dialog";
import { ImportPanel } from "@/components/skills/import-panel";
import { MarketplacePanel } from "@/components/skills/marketplace-panel";
import { SkillCard } from "@/components/skills/skill-card";
import { SkillDetailDialog } from "@/components/skills/skill-detail-dialog";
import { SkillsSkeleton } from "@/components/skeletons/skills-skeleton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/toast";
import {
  createSkill,
  fetchInstalledSkills,
  fetchSkillCatalog,
  fetchSkillDetail,
  importSkill,
  installSkill,
  toggleSkill,
  uninstallSkill,
} from "@/lib/server-api";
import { useAppTranslation } from "@/i18n";
import { cn } from "@/lib/utils";

type SkillsTab = "installed" | "marketplace" | "import";

const TABS: SkillsTab[] = ["installed", "marketplace", "import"];

const CATEGORIES: Array<{ value: SkillCategory; label: string }> = [
  { value: "design", label: "Design" },
  { value: "generation", label: "Generation" },
  { value: "code", label: "Code" },
  { value: "data", label: "Data" },
  { value: "writing", label: "Writing" },
  { value: "custom", label: "Custom" },
];

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const emptyVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

function upsertSkill(
  skills: SkillListItem[],
  nextSkill: SkillListItem,
): SkillListItem[] {
  const index = skills.findIndex((skill) => skill.id === nextSkill.id);
  if (index === -1) {
    return [...skills, nextSkill];
  }
  return skills.map((skill) => (skill.id === nextSkill.id ? nextSkill : skill));
}

function compareInstalledSkills(
  left: SkillListItem,
  right: SkillListItem,
): number {
  const leftTime = Date.parse(left.updatedAt);
  const rightTime = Date.parse(right.updatedAt);
  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }
  return left.name.localeCompare(right.name, "zh-CN");
}

function upsertAndSortInstalledSkills(
  skills: SkillListItem[],
  nextSkill: SkillListItem,
): SkillListItem[] {
  return upsertSkill(skills, nextSkill).sort(compareInstalledSkills);
}

function removeSkill(
  skills: SkillListItem[],
  skillId: string,
): SkillListItem[] {
  return skills.filter((skill) => skill.id !== skillId);
}

export default function SkillsPage() {
  const { t } = useAppTranslation("skills");
  const { success, error: toastError } = useToast();
  const [activeTab, setActiveTab] = useState<SkillsTab>("installed");
  const [installedSkills, setInstalledSkills] = useState<SkillListItem[]>([]);
  const [catalogSkills, setCatalogSkills] = useState<SkillListItem[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<
    Set<SkillCategory>
  >(new Set());
  const [officialOnly, setOfficialOnly] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailSkill, setDetailSkill] = useState<SkillDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadSkills = useCallback(async () => {
    const [installed, catalog] = await Promise.all([
      fetchInstalledSkills(),
      fetchSkillCatalog(),
    ]);
    setInstalledSkills(installed.skills);
    setCatalogSkills(catalog.skills);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPageLoading(true);
    void loadSkills()
      .catch((error) => {
        if (!cancelled) {
          console.error("Failed to fetch local skills:", error);
          toastError(t("toasts.loadFailed"));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPageLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadSkills, t, toastError]);

  const localizeSkill = useCallback(
    <T extends SkillListItem | SkillDetail>(skill: T): T => ({
      ...skill,
      description: t(`catalog.${skill.slug}.description`, {
        defaultValue: t(`catalog.${skill.id}.description`, {
          defaultValue: skill.description,
        }),
      }),
    }),
    [t],
  );

  const localizedInstalledSkills = useMemo(
    () => installedSkills.map((skill) => localizeSkill(skill)),
    [installedSkills, localizeSkill],
  );

  const localizedCatalogSkills = useMemo(
    () => catalogSkills.map((skill) => localizeSkill(skill)),
    [catalogSkills, localizeSkill],
  );

  const localizedDetailSkill = useMemo(
    () => (detailSkill ? localizeSkill(detailSkill) : null),
    [detailSkill, localizeSkill],
  );

  const filteredSkills = useMemo(() => {
    let result = localizedInstalledSkills;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (skill) =>
          skill.name.toLowerCase().includes(query) ||
          skill.description.toLowerCase().includes(query),
      );
    }
    if (selectedCategories.size > 0) {
      result = result.filter((skill) => selectedCategories.has(skill.category));
    }
    if (officialOnly) {
      result = result.filter((skill) => skill.source === "system");
    }
    return result;
  }, [localizedInstalledSkills, officialOnly, searchQuery, selectedCategories]);

  const toggleCategory = useCallback((category: SkillCategory) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  const handleToggle = useCallback(
    async (skillId: string, enabled: boolean) => {
      setInstalledSkills((prev) =>
        prev.map((skill) =>
          skill.id === skillId ? { ...skill, enabled } : skill,
        ),
      );
      try {
        const result = await toggleSkill(skillId, { enabled });
        setInstalledSkills((prev) =>
          prev.map((skill) => (skill.id === skillId ? result.skill : skill)),
        );
      } catch (error) {
        console.error("Failed to toggle skill:", error);
        toastError(t("toasts.toggleFailed"));
        setInstalledSkills((prev) =>
          prev.map((skill) =>
            skill.id === skillId ? { ...skill, enabled: !enabled } : skill,
          ),
        );
      }
    },
    [t, toastError],
  );

  const handleCardClick = useCallback(
    async (skill: SkillListItem) => {
      setDetailLoading(true);
      setDetailOpen(true);
      try {
        const result = await fetchSkillDetail(skill.id);
        setDetailSkill(result.skill);
      } catch (error) {
        console.error("Failed to fetch skill detail:", error);
        toastError(t("toasts.detailLoadFailed"));
        setDetailSkill(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [t, toastError],
  );

  const handleInstall = useCallback(
    async (skillId: string) => {
      try {
        const result = await installSkill(skillId);
        success(t("toasts.installed", { name: result.skill.name }));
        setInstalledSkills((prev) =>
          upsertAndSortInstalledSkills(prev, result.skill),
        );
        setCatalogSkills((prev) => upsertSkill(prev, result.skill));
        if (detailSkill?.id === skillId) {
          setDetailSkill(result.skill);
        }
      } catch (error) {
        console.error("Failed to install skill:", error);
        toastError(t("toasts.installFailed"));
      }
    },
    [detailSkill?.id, success, t, toastError],
  );

  const handleUninstall = useCallback(
    async (skillId: string) => {
      try {
        const targetSkill =
          installedSkills.find((skill) => skill.id === skillId) ?? null;
        await uninstallSkill(skillId);
        success(t("toasts.uninstalled"));
        setInstalledSkills((prev) => removeSkill(prev, skillId));
        setCatalogSkills((prev) =>
          targetSkill?.source === "system"
            ? prev.map((skill) =>
                skill.id === skillId
                  ? { ...skill, installed: false, enabled: false }
                  : skill,
              )
            : prev,
        );
        if (detailSkill?.id === skillId) {
          setDetailOpen(false);
        }
      } catch (error) {
        console.error("Failed to uninstall skill:", error);
        toastError(t("toasts.uninstallFailed"));
      }
    },
    [detailSkill?.id, installedSkills, success, t, toastError],
  );

  const handleCreate = useCallback(
    async (data: {
      name: string;
      description: string;
      category: SkillCategory;
      skillContent: string;
      files?: Array<{ filePath: string; content: string }>;
    }) => {
      const result = await createSkill(data);
      success(t("toasts.created", { name: result.skill.name }));
      setInstalledSkills((prev) =>
        upsertAndSortInstalledSkills(prev, result.skill),
      );
    },
    [success, t],
  );

  const handleImport = useCallback(async (payload: SkillImportRequest) => {
    const result = await importSkill(payload);
    setInstalledSkills((prev) =>
      upsertAndSortInstalledSkills(prev, result.skill),
    );
    return { skillName: result.skill.name };
  }, []);

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    selectedCategories.size > 0 ||
    officialOnly;

  if (pageLoading) {
    return <SkillsSkeleton />;
  }

  return (
    <div className="px-4 py-6 sm:px-6 md:p-8">
      <h1 className="text-base font-semibold sm:text-lg">{t("title")}</h1>
      <p className="mt-1 mb-4 text-xs text-muted-foreground sm:mb-6 sm:text-sm">
        {t("subtitle")}
      </p>

      <div className="mb-4 flex items-center gap-1 overflow-x-auto border-b border-border sm:mb-6">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              "min-h-[44px] whitespace-nowrap border-b-2 -mb-px px-3 py-2 text-sm font-medium transition-colors sm:min-h-0",
              activeTab === tab
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`tabs.${tab}`)}
          </button>
        ))}
      </div>

      {activeTab === "installed" ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2 sm:mb-6 sm:gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-[44px] sm:min-h-0"
                  />
                }
              >
                <ListFilter className="size-3.5" />
                {t("filters.label")}
                {selectedCategories.size > 0 ? (
                  <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-[10px] font-medium text-background">
                    {selectedCategories.size}
                  </span>
                ) : null}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={4}>
                {CATEGORIES.map((category) => (
                  <DropdownMenuCheckboxItem
                    key={category.value}
                    checked={selectedCategories.has(category.value)}
                    onClick={() => toggleCategory(category.value)}
                  >
                    {category.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="relative order-last w-full sm:order-none sm:max-w-sm sm:flex-1">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("filters.searchPlaceholder")}
                aria-label={t("filters.searchLabel")}
                className="h-10 w-full rounded-lg border border-input bg-transparent pl-8 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-7"
              />
            </div>

            <Button
              variant={officialOnly ? "default" : "outline"}
              size="sm"
              className="min-h-[44px] sm:min-h-0"
              onClick={() => setOfficialOnly((prev) => !prev)}
            >
              <ShieldCheck className="size-3.5" />
              {t("filters.official")}
            </Button>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-card p-3 sm:mb-6 sm:gap-5 sm:p-5"
          >
            <div className="hidden shrink-0 items-center justify-center sm:flex">
              <div className="relative h-16 w-20">
                <div className="absolute left-0 top-1 h-14 w-12 rounded-lg border border-border bg-secondary shadow-sm" />
                <div className="absolute left-5 top-0 flex h-14 w-12 items-center justify-center rounded-lg border border-border bg-card shadow-sm">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    className="size-6 text-muted-foreground"
                  >
                    <path d="M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-medium text-foreground">
                {t("customCard.title")}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("customCard.description")}
              </p>
            </div>

            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-3.5" />
              {t("customCard.add")}
            </Button>
          </motion.div>

          {filteredSkills.length === 0 ? (
            <motion.div
              variants={emptyVariants}
              initial="hidden"
              animate="visible"
              className="flex flex-col items-center justify-center py-20 text-center"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Search className="size-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">
                {hasActiveFilters
                  ? t("empty.noMatches")
                  : t("empty.noInstalled")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {hasActiveFilters
                  ? t("empty.adjustFilters")
                  : t("empty.installOrImport")}
              </p>
            </motion.div>
          ) : (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2"
            >
              {filteredSkills.map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  onToggle={handleToggle}
                  onClick={handleCardClick}
                  onUninstall={handleUninstall}
                />
              ))}
            </motion.div>
          )}
        </>
      ) : null}

      {activeTab === "marketplace" ? (
        <MarketplacePanel
          skills={localizedCatalogSkills}
          loading={false}
          onInspect={handleCardClick}
          onInstall={handleInstall}
        />
      ) : null}

      {activeTab === "import" ? (
        <ImportPanel
          onImported={handleImport}
          onSwitchToInstalled={() => setActiveTab("installed")}
        />
      ) : null}

      <CreateSkillDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
      />

      <SkillDetailDialog
        skill={localizedDetailSkill}
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) {
            setDetailSkill(null);
            setDetailLoading(false);
          }
        }}
        onInstall={handleInstall}
        onUninstall={handleUninstall}
        onDelete={handleUninstall}
      />

      {detailLoading && !detailSkill ? (
        <div className="sr-only" aria-live="polite">
          {t("detail.loading")}
        </div>
      ) : null}
    </div>
  );
}
