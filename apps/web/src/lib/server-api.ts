import type {
  ViewerResponse,
  ProjectListResponse,
  ProjectCreateRequest,
  ProjectCreateResponse,
  ProjectDetailResponse,
  ProjectUpdateRequest,
  CanvasDetail,
  ProfileUpdateResponse,
  ModelListResponse,
  SessionListResponse,
  SessionCreateResponse,
  MessageListResponse,
  MessageCreateResponse,
  ChatMessageCreateRequest,
  SkillCreateRequest,
  SkillDetailResponse,
  SkillImportRequest,
  SkillListResponse,
  SkillToggleRequest,
  UploadResponse,
  AssetSignedUrlResponse,
} from "@aimc/shared";

import { getServerBaseUrl } from "./env";
import { dedupeRequest } from "./dedupe-request";

// --- Error types ---

export class ApiApplicationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ApiApplicationError";
    this.code = code;
  }
}

// --- Local app API ---

async function handleErrorResponse(response: Response): Promise<never> {
  const body = await response.json().catch(() => null);
  const code = body?.error?.code ?? "application_error";
  const message = body?.error?.message ?? "Request failed";
  throw new ApiApplicationError(code, message);
}

export async function fetchViewer(): Promise<ViewerResponse> {
  const response = await fetch(`${getServerBaseUrl()}/api/viewer`);
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as ViewerResponse;
}

export async function fetchProjects(): Promise<ProjectListResponse> {
  const response = await fetch(`${getServerBaseUrl()}/api/projects`);
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as ProjectListResponse;
}

export async function createProject(
  data: ProjectCreateRequest,
): Promise<ProjectCreateResponse> {
  const response = await fetch(`${getServerBaseUrl()}/api/projects`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as ProjectCreateResponse;
}

export async function deleteProject(
  projectId: string,
): Promise<void> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/projects/${projectId}`,
    {
      method: "DELETE",
    },
  );
  if (!response.ok) return handleErrorResponse(response);
}

export async function fetchProject(
  projectId: string,
): Promise<ProjectDetailResponse> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/projects/${projectId}`,
  );
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as ProjectDetailResponse;
}

export async function updateProject(
  projectId: string,
  data: ProjectUpdateRequest,
): Promise<void> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/projects/${projectId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    },
  );
  if (!response.ok) return handleErrorResponse(response);
}

// --- Canvas API ---

export async function fetchCanvas(canvasId: string): Promise<{ canvas: CanvasDetail }> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/canvases/${canvasId}`,
  );
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as { canvas: CanvasDetail };
}

export async function saveCanvas(
  canvasId: string,
  content: { elements: Record<string, unknown>[]; appState: Record<string, unknown>; files: Record<string, Record<string, unknown>> },
): Promise<void> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/canvases/${canvasId}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    },
  );
  if (!response.ok) return handleErrorResponse(response);
}

export async function uploadThumbnail(
  projectId: string,
  blob: Blob,
): Promise<void> {
  const formData = new FormData();
  formData.append("file", blob, "thumbnail.webp");
  const response = await fetch(
    `${getServerBaseUrl()}/api/projects/${projectId}/thumbnail`,
    {
      method: "PUT",
      body: formData,
    },
  );
  if (!response.ok) return handleErrorResponse(response);
}

// --- Settings API ---

export async function updateProfile(
  data: { displayName: string },
): Promise<ProfileUpdateResponse> {
  const response = await fetch(`${getServerBaseUrl()}/api/viewer/profile`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as ProfileUpdateResponse;
}

export async function fetchModels(): Promise<ModelListResponse> {
  const response = await fetch(`${getServerBaseUrl()}/api/models`);
  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.status}`);
  }
  return (await response.json()) as ModelListResponse;
}

// --- Chat Session API ---

export function fetchSessions(
  canvasId: string,
): Promise<SessionListResponse> {
  return dedupeRequest(`sessions:${canvasId}`, async () => {
    const response = await fetch(
      `${getServerBaseUrl()}/api/canvases/${canvasId}/sessions`,
    );
    if (!response.ok) return handleErrorResponse(response);
    return (await response.json()) as SessionListResponse;
  });
}

export async function createSession(
  canvasId: string,
  title?: string,
): Promise<SessionCreateResponse> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/canvases/${canvasId}/sessions`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(title ? { title } : {}),
    },
  );
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as SessionCreateResponse;
}

export async function updateSessionTitle(
  sessionId: string,
  title: string,
): Promise<void> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/sessions/${sessionId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    },
  );
  if (!response.ok) return handleErrorResponse(response);
}

export async function deleteSession(
  sessionId: string,
): Promise<void> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/sessions/${sessionId}`,
    {
      method: "DELETE",
    },
  );
  if (!response.ok) return handleErrorResponse(response);
}

export async function fetchMessages(sessionId: string): Promise<MessageListResponse> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/sessions/${sessionId}/messages`,
  );
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as MessageListResponse;
}

export async function saveMessage(
  sessionId: string,
  data: ChatMessageCreateRequest,
): Promise<MessageCreateResponse> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/sessions/${sessionId}/messages`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    },
  );
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as MessageCreateResponse;
}

// --- Upload API ---

export async function uploadFile(
  file: File,
  projectId?: string,
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  if (projectId) {
    formData.append("projectId", projectId);
  }

  const response = await fetch(`${getServerBaseUrl()}/api/uploads`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as UploadResponse;
}

export async function getAssetUrl(assetId: string): Promise<AssetSignedUrlResponse> {
  const response = await fetch(`${getServerBaseUrl()}/api/uploads/${assetId}/url`);
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as AssetSignedUrlResponse;
}

export async function deleteAsset(assetId: string): Promise<void> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/uploads/${assetId}`,
    {
      method: "DELETE",
    },
  );
  if (!response.ok) return handleErrorResponse(response);
}

// --- Skills API ---

export async function fetchInstalledSkills(): Promise<SkillListResponse> {
  const response = await fetch(`${getServerBaseUrl()}/api/skills`);
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as SkillListResponse;
}

export async function fetchSkillCatalog(): Promise<SkillListResponse> {
  const response = await fetch(`${getServerBaseUrl()}/api/skills/catalog`);
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as SkillListResponse;
}

export async function fetchSkillDetail(skillId: string): Promise<SkillDetailResponse> {
  const response = await fetch(`${getServerBaseUrl()}/api/skills/${skillId}`);
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as SkillDetailResponse;
}

export async function createSkill(
  data: SkillCreateRequest,
): Promise<SkillDetailResponse> {
  const response = await fetch(`${getServerBaseUrl()}/api/skills`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as SkillDetailResponse;
}

export async function importSkill(
  data: SkillImportRequest,
): Promise<SkillDetailResponse> {
  const response = await fetch(`${getServerBaseUrl()}/api/skills/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as SkillDetailResponse;
}

export async function installSkill(skillId: string): Promise<SkillDetailResponse> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/skills/catalog/${skillId}/install`,
    { method: "POST" },
  );
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as SkillDetailResponse;
}

export async function toggleSkill(
  skillId: string,
  data: SkillToggleRequest,
): Promise<SkillDetailResponse> {
  const response = await fetch(`${getServerBaseUrl()}/api/skills/${skillId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as SkillDetailResponse;
}

export async function uninstallSkill(skillId: string): Promise<void> {
  const response = await fetch(`${getServerBaseUrl()}/api/skills/${skillId}`, {
    method: "DELETE",
  });
  if (!response.ok) return handleErrorResponse(response);
}

// --- Canvas-Native Generation API ---

export type GenerateImageResponse = {
  url: string;
  prompt: string;
  mimeType: string;
  width: number;
  height: number;
};

export type ImageModelInfo = {
  id: string;
  displayName: string;
  description: string;
  provider: string;
  iconUrl?: string;
  creditCost?: number;
  accessible?: boolean;
  minTier?: string;
};

export async function fetchImageModels(): Promise<{ models: ImageModelInfo[] }> {
  const response = await fetch(`${getServerBaseUrl()}/api/image-models`);
  if (!response.ok) {
    throw new Error(`Failed to fetch image models: ${response.status}`);
  }
  return (await response.json()) as { models: ImageModelInfo[] };
}

export type VideoModelInfo = {
  id: string;
  displayName: string;
  description: string;
  provider: string;
  iconUrl?: string;
  accessible?: boolean;
};

export async function fetchVideoModels(): Promise<{ models: VideoModelInfo[] }> {
  const response = await fetch(`${getServerBaseUrl()}/api/video-models`);
  if (!response.ok) {
    throw new Error(`Failed to fetch video models: ${response.status}`);
  }
  return (await response.json()) as { models: VideoModelInfo[] };
}

export async function generateImageDirect(
  prompt: string,
  options?: { model?: string; aspectRatio?: string; quality?: string },
): Promise<GenerateImageResponse> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/agent/generate-image`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt,
        ...(options?.model ? { model: options.model } : {}),
        ...(options?.aspectRatio ? { aspectRatio: options.aspectRatio } : {}),
        ...(options?.quality ? { quality: options.quality } : {}),
      }),
    },
  );
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as GenerateImageResponse;
}
