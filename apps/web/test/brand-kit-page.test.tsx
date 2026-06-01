// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BrandKitPage } from "../src/components/brand-kit/brand-kit-page";

const {
  createBrandKitAssetMock,
  createBrandKitMock,
  deleteBrandKitAssetMock,
  deleteBrandKitMock,
  duplicateBrandKitMock,
  fetchBrandKitMock,
  fetchBrandKitsMock,
  toastErrorMock,
  updateBrandKitAssetMock,
  updateBrandKitMock,
  uploadBrandKitAssetMock,
} = vi.hoisted(() => ({
  createBrandKitAssetMock: vi.fn(),
  createBrandKitMock: vi.fn(),
  deleteBrandKitAssetMock: vi.fn(),
  deleteBrandKitMock: vi.fn(),
  duplicateBrandKitMock: vi.fn(),
  fetchBrandKitMock: vi.fn(),
  fetchBrandKitsMock: vi.fn(),
  toastErrorMock: vi.fn(),
  updateBrandKitAssetMock: vi.fn(),
  updateBrandKitMock: vi.fn(),
  uploadBrandKitAssetMock: vi.fn(),
}));

vi.mock("../src/lib/brand-kit-api", () => ({
  createBrandKit: createBrandKitMock,
  createBrandKitAsset: createBrandKitAssetMock,
  deleteBrandKit: deleteBrandKitMock,
  deleteBrandKitAsset: deleteBrandKitAssetMock,
  duplicateBrandKit: duplicateBrandKitMock,
  fetchBrandKit: fetchBrandKitMock,
  fetchBrandKits: fetchBrandKitsMock,
  updateBrandKit: updateBrandKitMock,
  updateBrandKitAsset: updateBrandKitAssetMock,
  uploadBrandKitAsset: uploadBrandKitAssetMock,
}));

vi.mock("../src/components/toast", () => ({
  useToast: () => ({
    error: toastErrorMock,
  }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function buildKitSummary(id: string, name: string) {
  return {
    id,
    name,
    is_default: false,
    cover_url: null,
    asset_counts: {
      color: 0,
      font: 0,
      image: 0,
      logo: 0,
    },
    created_at: "2026-06-02T00:00:00.000Z",
    updated_at: "2026-06-02T00:00:00.000Z",
  };
}

function buildKitDetail(id: string, name: string) {
  return {
    id,
    name,
    is_default: false,
    guidance_text: null,
    cover_url: null,
    assets: [],
    created_at: "2026-06-02T00:00:00.000Z",
    updated_at: "2026-06-02T00:00:00.000Z",
  };
}

describe("BrandKitPage", () => {
  beforeEach(() => {
    createBrandKitMock.mockReset();
    createBrandKitAssetMock.mockReset();
    deleteBrandKitMock.mockReset();
    deleteBrandKitAssetMock.mockReset();
    duplicateBrandKitMock.mockReset();
    updateBrandKitMock.mockReset();
    updateBrandKitAssetMock.mockReset();
    uploadBrandKitAssetMock.mockReset();
    toastErrorMock.mockReset();
    fetchBrandKitsMock.mockReset();
    fetchBrandKitsMock.mockResolvedValue({
      brandKits: [
        buildKitSummary("kit-a", "Kit A"),
        buildKitSummary("kit-b", "Kit B"),
      ],
    });
    fetchBrandKitMock.mockReset();
    fetchBrandKitMock.mockImplementation(async (kitId: string) =>
      buildKitDetail(kitId, kitId === "kit-a" ? "Kit A" : "Kit B"),
    );
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("ignores stale brand-kit detail responses when the user switches quickly", async () => {
    const delayedKitB = deferred<ReturnType<typeof buildKitDetail>>();

    fetchBrandKitMock.mockImplementation((kitId: string) => {
      if (kitId === "kit-b") {
        return delayedKitB.promise;
      }
      return Promise.resolve(buildKitDetail("kit-a", "Kit A"));
    });

    render(<BrandKitPage />);

    await screen.findByDisplayValue("Kit A");

    await userEvent.click(screen.getAllByText("Kit B")[0]!);
    await userEvent.click(screen.getAllByText("Kit A")[0]!);

    delayedKitB.resolve(buildKitDetail("kit-b", "Kit B"));

    await waitFor(() =>
      expect(screen.getByDisplayValue("Kit A")).toBeInTheDocument(),
    );
    expect(screen.queryByDisplayValue("Kit B")).not.toBeInTheDocument();
  });
});
