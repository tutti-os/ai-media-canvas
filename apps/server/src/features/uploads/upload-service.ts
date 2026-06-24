import type {
  AssetBucket,
  AssetObject,
  ManagedFileAssetMetadata,
} from "@aimc/shared";

import type { AuthenticatedUser } from "../../auth/types.js";

export class UploadServiceError extends Error {
  readonly statusCode: number;
  readonly code: "upload_failed" | "asset_in_use" | "asset_not_found";

  constructor(
    code: "upload_failed" | "asset_in_use" | "asset_not_found",
    message: string,
    statusCode: number,
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type UploadFileInput = {
  bucket: AssetBucket;
  fileName: string;
  fileBuffer: Buffer;
  mimeType: string;
  projectId?: string | undefined;
};

export type ManagedFileAssetInput = {
  bucket: AssetBucket;
  file: ManagedFileAssetMetadata;
  projectId?: string | undefined;
};

export type UploadService = {
  uploadFile(
    user: AuthenticatedUser,
    input: UploadFileInput,
  ): Promise<{ asset: AssetObject; url: string }>;
  createManagedFileAsset(
    user: AuthenticatedUser,
    input: ManagedFileAssetInput,
  ): Promise<{ asset: AssetObject; url: string }>;
  getAssetUrl(user: AuthenticatedUser, assetId: string): Promise<string>;
  deleteAsset(user: AuthenticatedUser, assetId: string): Promise<void>;
};
