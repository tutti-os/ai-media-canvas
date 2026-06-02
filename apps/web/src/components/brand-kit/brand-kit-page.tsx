"use client";

import type {
  BrandKitSummary,
  BrandKitDetail,
  BrandKitAssetType,
} from "@aimc/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { BrandKitSkeleton } from "../skeletons/brand-kit-skeleton";
import {
  createBrandKit,
  createBrandKitAsset,
  deleteBrandKit,
  deleteBrandKitAsset,
  duplicateBrandKit,
  fetchBrandKit,
  fetchBrandKits,
  updateBrandKit,
  updateBrandKitAsset,
  uploadBrandKitAsset,
} from "../../lib/brand-kit-api";
import { BrandKitEditor } from "./brand-kit-editor";
import { BrandKitSidebar } from "./brand-kit-sidebar";
import { EmptyState } from "./empty-state";
import { useToast } from "../toast";

export function BrandKitPage() {
  const [kits, setKits] = useState<BrandKitSummary[]>([]);
  const [selectedKit, setSelectedKit] = useState<BrandKitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const { error: toastError } = useToast();

  const selectedKitRef = useRef(selectedKit);
  selectedKitRef.current = selectedKit;
  const detailRequestRef = useRef(0);

  const commitSelectedKit = useCallback((detail: BrandKitDetail | null) => {
    detailRequestRef.current += 1;
    setSelectedKit(detail);
  }, []);

  const handleActionError = useCallback(
    (message: string, err: unknown) => {
      console.error(message, err);
      toastError(message);
    },
    [toastError],
  );

  // --- Data loading (ref-based, no dependency cascades) ---

  const loadKitDetail = useCallback(
    async (kitId: string) => {
      const requestId = ++detailRequestRef.current;
      try {
        const detail = await fetchBrandKit(kitId);
        if (detailRequestRef.current === requestId) {
          setSelectedKit(detail);
        }
      } catch (err) {
        handleActionError("Failed to load brand kit detail.", err);
      }
    },
    [handleActionError],
  );

  const refreshList = useCallback(async () => {
      try {
        const data = await fetchBrandKits();
        setKits(data.brandKits);
        return data.brandKits;
      } catch (err) {
        handleActionError("Failed to load brand kits.", err);
        return [];
      }
    }, [handleActionError]);

  // Initial load — runs exactly once for the local app.
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    (async () => {
      setLoading(true);
      try {
        const data = await fetchBrandKits();
        setKits(data.brandKits);
        const firstKit = data.brandKits[0];
        if (firstKit) {
          await loadKitDetail(firstKit.id);
        }
      } catch (err) {
        handleActionError("Failed to load brand kits.", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [handleActionError, loadKitDetail]);

  // --- Kit handlers ---

  const handleSelectKit = useCallback(
    async (kitId: string) => {
      await loadKitDetail(kitId);
    },
    [loadKitDetail],
  );

  const handleCreateKit = useCallback(async () => {
    try {
      const newKit = await createBrandKit();
      await refreshList();
      commitSelectedKit(newKit);
    } catch (err) {
      handleActionError("Failed to create brand kit.", err);
    }
  }, [commitSelectedKit, handleActionError, refreshList]);

  const handleDuplicateKit = useCallback(async () => {
    const kit = selectedKitRef.current;
    if (!kit) return;
    try {
      const duplicated = await duplicateBrandKit(kit.id);
      await refreshList();
      commitSelectedKit(duplicated);
    } catch (err) {
      handleActionError("Failed to duplicate brand kit.", err);
    }
  }, [commitSelectedKit, handleActionError, refreshList]);

  const handleUpdateKit = useCallback(
    async (data: {
      name?: string;
      guidance_text?: string | null;
      is_default?: boolean;
    }) => {
      const kit = selectedKitRef.current;
      if (!kit) return;
      try {
        const updated = await updateBrandKit(kit.id, data);
        commitSelectedKit(updated);
        await refreshList();
      } catch (err) {
        handleActionError("Failed to update brand kit.", err);
      }
    },
    [commitSelectedKit, handleActionError, refreshList],
  );

  const handleDeleteKit = useCallback(async () => {
    const kit = selectedKitRef.current;
    if (!kit) return;
    try {
      await deleteBrandKit(kit.id);
      const remaining = await refreshList();
      const nextKit = remaining[0];
      if (nextKit) {
        await loadKitDetail(nextKit.id);
      } else {
        commitSelectedKit(null);
      }
    } catch (err) {
      handleActionError("Failed to delete brand kit.", err);
    }
  }, [commitSelectedKit, handleActionError, refreshList, loadKitDetail]);

  const handleDeleteKitFromSidebar = useCallback(
    async (kitId: string) => {
      try {
        await deleteBrandKit(kitId);
        const remaining = await refreshList();
        if (selectedKitRef.current?.id === kitId) {
          const nextKit = remaining[0];
          if (nextKit) {
            await loadKitDetail(nextKit.id);
          } else {
            commitSelectedKit(null);
          }
        }
      } catch (err) {
        handleActionError("Failed to delete brand kit.", err);
      }
    },
    [commitSelectedKit, handleActionError, refreshList, loadKitDetail],
  );

  // --- Asset handlers ---

  const handleAddAsset = useCallback(
    async (
      type: BrandKitAssetType,
      displayName: string,
      textContent?: string | null,
      metadata?: Record<string, unknown>,
    ) => {
      const kit = selectedKitRef.current;
      if (!kit) return;
      try {
        await createBrandKitAsset(kit.id, {
          asset_type: type,
          display_name: displayName,
          text_content: textContent ?? null,
          metadata,
        });
        await loadKitDetail(kit.id);
      } catch (err) {
        handleActionError("Failed to create asset.", err);
      }
    },
    [handleActionError, loadKitDetail],
  );

  const handleUpdateAsset = useCallback(
    async (
      assetId: string,
      data: { display_name?: string; text_content?: string | null },
    ) => {
      const kit = selectedKitRef.current;
      if (!kit) return;
      try {
        await updateBrandKitAsset(kit.id, assetId, data);
        await loadKitDetail(kit.id);
      } catch (err) {
        handleActionError("Failed to update asset.", err);
      }
    },
    [handleActionError, loadKitDetail],
  );

  const handleDeleteAsset = useCallback(
    async (assetId: string) => {
      const kit = selectedKitRef.current;
      if (!kit) return;
      try {
        await deleteBrandKitAsset(kit.id, assetId);
        await loadKitDetail(kit.id);
        await refreshList();
      } catch (err) {
        handleActionError("Failed to delete asset.", err);
      }
    },
    [handleActionError, loadKitDetail, refreshList],
  );

  const handleUploadAsset = useCallback(
    async (type: "logo" | "image", file: File) => {
      const kit = selectedKitRef.current;
      if (!kit) return;
      try {
        await uploadBrandKitAsset(kit.id, type, file);
        await loadKitDetail(kit.id);
        await refreshList();
      } catch (err) {
        handleActionError("Failed to upload asset.", err);
      }
    },
    [handleActionError, loadKitDetail, refreshList],
  );

  // --- Render ---

  if (loading) {
    return <BrandKitSkeleton />;
  }

  return (
    <div className="flex h-[100dvh] w-full flex-col bg-background md:flex-row">
      {/* Sidebar: full width horizontal on mobile, vertical panel on md+ */}
      <BrandKitSidebar
        kits={kits}
        selectedKitId={selectedKit?.id ?? null}
        onSelectKit={handleSelectKit}
        onCreateKit={handleCreateKit}
        onDeleteKit={handleDeleteKitFromSidebar}
      />

      {selectedKit ? (
        <BrandKitEditor
          kit={selectedKit}
          onUpdateKit={handleUpdateKit}
          onDeleteKit={handleDeleteKit}
          onDuplicateKit={handleDuplicateKit}
          onAddAsset={handleAddAsset}
          onUpdateAsset={handleUpdateAsset}
          onDeleteAsset={handleDeleteAsset}
          onUploadAsset={handleUploadAsset}
        />
      ) : (
        <EmptyState onCreateKit={handleCreateKit} />
      )}
    </div>
  );
}
