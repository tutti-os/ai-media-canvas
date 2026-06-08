import type {
  BrandKitListResponse,
  BrandKitDetailResponse,
  BrandKitCreateRequest,
  BrandKitUpdateRequest,
  BrandKitAssetCreateRequest,
  BrandKitAssetUpdateRequest,
  BrandKitAssetResponse,
} from "@aimc/shared";

import { ApiApplicationError } from "./api-errors";
import { getServerBaseUrl } from "./env";
import { dedupeRequest } from "./dedupe-request";

async function handleErrorResponse(response: Response): Promise<never> {
  const body = await response.json().catch(() => null);
  const code = body?.error?.code ?? "application_error";
  const message = body?.error?.message ?? "Request failed";
  throw new ApiApplicationError(code, message);
}

// --- Brand Kit CRUD ---

export function fetchBrandKits(): Promise<BrandKitListResponse> {
  return dedupeRequest("brand-kits:list", async () => {
    const response = await fetch(`${getServerBaseUrl()}/api/brand-kits`);
    if (!response.ok) return handleErrorResponse(response);
    return (await response.json()) as BrandKitListResponse;
  });
}

export async function fetchBrandKit(kitId: string): Promise<BrandKitDetailResponse> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/brand-kits/${kitId}`,
  );
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as BrandKitDetailResponse;
}

export async function createBrandKit(
  data?: BrandKitCreateRequest,
): Promise<BrandKitDetailResponse> {
  const response = await fetch(`${getServerBaseUrl()}/api/brand-kits`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data ?? {}),
  });
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as BrandKitDetailResponse;
}

export async function updateBrandKit(
  kitId: string,
  data: BrandKitUpdateRequest,
): Promise<BrandKitDetailResponse> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/brand-kits/${kitId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    },
  );
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as BrandKitDetailResponse;
}

export async function duplicateBrandKit(
  kitId: string,
): Promise<BrandKitDetailResponse> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/brand-kits/${kitId}/duplicate`,
    {
      method: "POST",
    },
  );
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as BrandKitDetailResponse;
}

export async function deleteBrandKit(
  kitId: string,
): Promise<void> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/brand-kits/${kitId}`,
    {
      method: "DELETE",
    },
  );
  if (!response.ok) return handleErrorResponse(response);
}

// --- Brand Kit Asset CRUD ---

export async function createBrandKitAsset(
  kitId: string,
  data: BrandKitAssetCreateRequest,
): Promise<BrandKitAssetResponse> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/brand-kits/${kitId}/assets`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    },
  );
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as BrandKitAssetResponse;
}

export async function updateBrandKitAsset(
  kitId: string,
  assetId: string,
  data: BrandKitAssetUpdateRequest,
): Promise<BrandKitAssetResponse> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/brand-kits/${kitId}/assets/${assetId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    },
  );
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as BrandKitAssetResponse;
}

export async function deleteBrandKitAsset(
  kitId: string,
  assetId: string,
): Promise<void> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/brand-kits/${kitId}/assets/${assetId}`,
    {
      method: "DELETE",
    },
  );
  if (!response.ok) return handleErrorResponse(response);
}

export async function uploadBrandKitAsset(
  kitId: string,
  assetType: "logo" | "image",
  file: File,
): Promise<BrandKitAssetResponse> {
  const formData = new FormData();
  formData.append("asset_type", assetType);
  formData.append("file", file);

  const response = await fetch(
    `${getServerBaseUrl()}/api/brand-kits/${kitId}/assets/upload`,
    {
      method: "POST",
      body: formData,
    },
  );
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as BrandKitAssetResponse;
}
