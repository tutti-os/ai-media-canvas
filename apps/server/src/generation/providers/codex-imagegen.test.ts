import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { CodexImagegenProvider, parseSavedPath } from "./codex-imagegen.js";

describe("CodexImagegenProvider", () => {
  it("generates through codex exec and returns a data URI", async () => {
    const execCodex = vi.fn(async (args: readonly string[]) => {
      const instruction = String(args.at(-1));
      const outputPath = instruction.match(
        /Save the final image exactly at: (.+)/,
      )?.[1];
      if (!outputPath) throw new Error("missing output path");
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, Buffer.from("png-bytes"));
      return { stdout: `SAVED: ${outputPath}\n`, stderr: "" };
    });
    const provider = new CodexImagegenProvider({
      codexHome: "/tmp/codex-home",
      timeoutMs: 1234,
      execCodex,
    });

    const image = await provider.generate({
      model: "codex/gpt-image-2",
      prompt: "a red mug",
      aspectRatio: "16:9",
      quality: "standard",
    });

    expect(execCodex).toHaveBeenCalledWith(
      expect.arrayContaining([
        "exec",
        "--full-auto",
        "--skip-git-repo-check",
        "-C",
      ]),
      expect.objectContaining({
        env: expect.objectContaining({ CODEX_HOME: "/tmp/codex-home" }),
        timeoutMs: 1234,
      }),
    );
    const args = execCodex.mock.calls[0]?.[0] ?? [];
    expect(args.at(-1)).toContain("Prompt: a red mug");
    expect(args.at(-1)).toContain("Aspect ratio: 16:9");
    expect(image).toEqual({
      url: `data:image/png;base64,${Buffer.from("png-bytes").toString("base64")}`,
      mimeType: "image/png",
      width: 1024,
      height: 576,
    });
  });

  it("rejects image edit inputs for the text-to-image MVP", async () => {
    const provider = new CodexImagegenProvider({
      execCodex: vi.fn(),
    });

    await expect(
      provider.generate({
        model: "codex/gpt-image-2",
        prompt: "edit this",
        inputImages: ["https://example.com/input.png"],
      }),
    ).rejects.toMatchObject({
      code: "invalid_input",
    });
  });

  it("rejects saved paths outside the run directory", async () => {
    const provider = new CodexImagegenProvider({
      execCodex: vi.fn(async () => ({
        stdout: "SAVED: /tmp/outside-codex-image.png\n",
        stderr: "",
      })),
    });

    await expect(
      provider.generate({
        model: "codex/gpt-image-2",
        prompt: "a red mug",
      }),
    ).rejects.toMatchObject({
      code: "invalid_output_path",
    });
  });

  it("requires Codex to print a SAVED path", () => {
    expect(() => parseSavedPath("generated successfully")).toThrow(
      "SAVED output path",
    );
    expect(parseSavedPath("SAVED: /tmp/one.png\nSAVED: /tmp/two.png")).toBe(
      "/tmp/two.png",
    );
  });
});
