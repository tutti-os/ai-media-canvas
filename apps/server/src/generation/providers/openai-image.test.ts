import { beforeEach, describe, expect, it, vi } from "vitest";

const { imageGenerateMock } = vi.hoisted(() => ({
  imageGenerateMock: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    images = { generate: imageGenerateMock };
  },
}));

import { OpenAIImageProvider } from "./openai-image.js";

describe("OpenAIImageProvider", () => {
  beforeEach(() => {
    imageGenerateMock.mockReset();
    imageGenerateMock.mockResolvedValue({
      data: [{ b64_json: "QUJD" }],
    });
  });

  it("exposes only GPT Image 2 and GPT Image 1.5", () => {
    const provider = new OpenAIImageProvider("sk-openai");

    expect(provider.models.map((model) => model.id)).toEqual([
      "gpt-image-2",
      "gpt-image-1.5",
    ]);
  });

  it("generates with the official GPT Image 2 model id and arbitrary-size protocol", async () => {
    const provider = new OpenAIImageProvider("sk-openai");

    const result = await provider.generate({
      prompt: "A cinematic mountain landscape",
      model: "gpt-image-2",
      aspectRatio: "16:9",
    });

    expect(imageGenerateMock).toHaveBeenCalledWith({
      model: "gpt-image-2",
      prompt: "A cinematic mountain landscape",
      size: "1536x864",
      n: 1,
      output_format: "png",
    });
    expect(result).toEqual({
      url: "data:image/png;base64,QUJD",
      mimeType: "image/png",
      width: 1536,
      height: 864,
    });
  });

  it("maps AIMC quality and output format values to the OpenAI protocol", async () => {
    const provider = new OpenAIImageProvider("sk-openai");

    const result = await provider.generate({
      prompt: "A print-ready product poster",
      model: "gpt-image-2",
      aspectRatio: "3:4",
      quality: "ultra",
      outputFormat: "jpg",
    });

    expect(imageGenerateMock).toHaveBeenCalledWith({
      model: "gpt-image-2",
      prompt: "A print-ready product poster",
      size: "1152x1536",
      n: 1,
      output_format: "jpeg",
      quality: "high",
    });
    expect(result).toMatchObject({
      url: "data:image/jpeg;base64,QUJD",
      mimeType: "image/jpeg",
      width: 1152,
      height: 1536,
    });
  });

  it("uses the actual PNG dimensions returned by compatible gateways", async () => {
    const pngHeader = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(pngHeader);
    pngHeader.writeUInt32BE(1254, 16);
    pngHeader.writeUInt32BE(1254, 20);
    imageGenerateMock.mockResolvedValue({
      data: [{ b64_json: pngHeader.toString("base64") }],
    });
    const provider = new OpenAIImageProvider("sk-openai");

    const result = await provider.generate({
      prompt: "A square icon",
      model: "gpt-image-2",
      aspectRatio: "1:1",
    });

    expect(result).toMatchObject({ width: 1254, height: 1254 });
  });

  it("uses the discrete landscape size supported by earlier GPT Image models", async () => {
    const provider = new OpenAIImageProvider("sk-openai");

    await provider.generate({
      prompt: "A landscape",
      model: "gpt-image-1.5",
      aspectRatio: "16:9",
    });

    expect(imageGenerateMock).toHaveBeenCalledWith(
      expect.objectContaining({ size: "1536x1024" }),
    );
  });
});
