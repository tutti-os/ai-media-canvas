"use client";

import type { ProjectSummary } from "@aimc/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { LoadingScreen } from "@/components/loading-screen";
import { ProjectList } from "@/components/project-list";
import { ProjectsSkeleton } from "@/components/skeletons/projects-skeleton";
import { useCreateProject } from "@/hooks/use-create-project";
import { LOCAL_ACCESS_TOKEN } from "@/lib/auth-context";
import {
  fetchProjects,
} from "@/lib/server-api";
import { Button } from "@/components/ui/button";

export default function ProjectsPage() {
  const { create: createNewProject, creating } = useCreateProject();

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const hasInitialized = useRef(false);

  const getToken = useCallback(() => LOCAL_ACCESS_TOKEN, []);

  const loadData = useCallback(async () => {
    setPageLoading(true);
    setLoadError(null);

    try {
      const data = await fetchProjects(getToken());
      setProjects(data.projects);
    } catch {
      setLoadError("Failed to load local projects. Please try again.");
    } finally {
      setPageLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    loadData();
  }, [loadData]);

  const handleDeleted = useCallback((projectId: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
  }, []);

  if (creating) {
    return <LoadingScreen />;
  }

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-sm text-destructive">{loadError}</p>
          <Button variant="outline" onClick={loadData}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (pageLoading) {
    return <ProjectsSkeleton />;
  }

  return (
    <div className="px-4 py-6 sm:px-6 md:p-8">
      <ProjectList
        projects={projects}
        highlightId={highlightId}
        onCreateClick={() => createNewProject()}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
