import type {
  BrandKitAsset,
  BrandKitAssetCreateRequest,
  BrandKitAssetUpdateRequest,
  BrandKitCreateRequest,
  BrandKitDetail,
  BrandKitSummary,
  BrandKitUpdateRequest,
} from "@aimc/shared";

import type { AuthenticatedUser } from "../../auth/types.js";

type BrandKitServiceErrorCode =
  | "brand_kit_not_found"
  | "brand_kit_create_failed"
  | "brand_kit_update_failed"
  | "brand_kit_delete_failed"
  | "brand_kit_query_failed"
  | "brand_kit_asset_not_found"
  | "brand_kit_asset_create_failed";

export class BrandKitServiceError extends Error {
  readonly statusCode: number;
  readonly code: BrandKitServiceErrorCode;

  constructor(
    code: BrandKitServiceErrorCode,
    message: string,
    statusCode: number,
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type BrandKitService = {
  listKits(user: AuthenticatedUser): Promise<BrandKitSummary[]>;
  getKit(user: AuthenticatedUser, kitId: string): Promise<BrandKitDetail>;
  createKit(
    user: AuthenticatedUser,
    input: BrandKitCreateRequest,
  ): Promise<BrandKitDetail>;
  updateKit(
    user: AuthenticatedUser,
    kitId: string,
    input: BrandKitUpdateRequest,
  ): Promise<BrandKitDetail>;
  deleteKit(user: AuthenticatedUser, kitId: string): Promise<void>;
  createAsset(
    user: AuthenticatedUser,
    kitId: string,
    input: BrandKitAssetCreateRequest,
  ): Promise<BrandKitAsset>;
  updateAsset(
    user: AuthenticatedUser,
    kitId: string,
    assetId: string,
    input: BrandKitAssetUpdateRequest,
  ): Promise<BrandKitAsset>;
  deleteAsset(
    user: AuthenticatedUser,
    kitId: string,
    assetId: string,
  ): Promise<void>;
  uploadAsset(
    user: AuthenticatedUser,
    kitId: string,
    assetType: "logo" | "image",
    fileName: string,
    fileBuffer: Buffer,
    mimeType: string,
  ): Promise<BrandKitAsset>;
  duplicateKit(
    user: AuthenticatedUser,
    kitId: string,
  ): Promise<BrandKitDetail>;
};
