import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  CodexImagegenProvider,
  parsePngDimensions,
  parseSavedPath,
} from "./codex-imagegen.js";

describe("CodexImagegenProvider", () => {
  it("generates through codex exec and returns a data URI", async () => {
    const sourceHome = await createCodexImagegenHomeFixture();
    const execCodex = vi.fn(async (args: readonly string[], options) => {
      const instruction = String(args.at(-1));
      const outputPath = instruction.match(
        /Save the final image exactly at: (.+)/,
      )?.[1];
      if (!outputPath) throw new Error("missing output path");
      expect(options.env.CODEX_HOME).toBe(join(options.cwd, ".codex-home"));
      await expect(
        readFile(
          join(
            options.env.CODEX_HOME,
            "skills",
            ".system",
            "imagegen",
            "SKILL.md",
          ),
          "utf8",
        ),
      ).resolves.toContain("imagegen skill");
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, Buffer.from("png-bytes"));
      return { stdout: `SAVED: ${outputPath}\n`, stderr: "" };
    });
    const provider = new CodexImagegenProvider({
      codexHome: sourceHome,
      agentModel: "gpt-5.4",
      timeoutMs: 1234,
      execCodex,
    });

    try {
      const image = await provider.generate({
        model: "codex/gpt-image-2",
        prompt: "a red mug",
        aspectRatio: "16:9",
        quality: "standard",
      });

      expect(execCodex).toHaveBeenCalledWith(
        expect.arrayContaining([
          "exec",
          "--ignore-user-config",
          "-m",
          "gpt-5.4",
          "--sandbox",
          "workspace-write",
          "--skip-git-repo-check",
          "-C",
        ]),
        expect.objectContaining({
          env: expect.objectContaining({
            CODEX_HOME: expect.stringContaining(".codex-home"),
          }),
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
    } finally {
      await rm(sourceHome, { recursive: true, force: true });
    }
  });

  it("uses a dynamically resolved Codex agent model", async () => {
    const sourceHome = await createCodexImagegenHomeFixture();
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
      codexHome: sourceHome,
      execCodex,
      resolveAgentModel: async () => "gpt-5.4-mini",
    });

    try {
      await provider.generate({
        model: "codex/gpt-image-2",
        prompt: "a red mug",
      });

      expect(execCodex).toHaveBeenCalledWith(
        expect.arrayContaining([
          "exec",
          "--ignore-user-config",
          "-m",
          "gpt-5.4-mini",
          "--sandbox",
          "workspace-write",
        ]),
        expect.any(Object),
      );
    } finally {
      await rm(sourceHome, { recursive: true, force: true });
    }
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
    const sourceHome = await createCodexImagegenHomeFixture();
    const provider = new CodexImagegenProvider({
      codexHome: sourceHome,
      resolveAgentModel: async () => "gpt-5.4-mini",
      execCodex: vi.fn(async () => ({
        stdout: "SAVED: /tmp/outside-codex-image.png\n",
        stderr: "",
      })),
    });

    try {
      await expect(
        provider.generate({
          model: "codex/gpt-image-2",
          prompt: "a red mug",
        }),
      ).rejects.toMatchObject({
        code: "invalid_output_path",
      });
    } finally {
      await rm(sourceHome, { recursive: true, force: true });
    }
  });

  it("requires Codex to print a SAVED path", () => {
    expect(() => parseSavedPath("generated successfully")).toThrow(
      "SAVED output path",
    );
    expect(parseSavedPath("SAVED: /tmp/one.png\nSAVED: /tmp/two.png")).toBe(
      "/tmp/two.png",
    );
  });

  it("reads dimensions from PNG headers", () => {
    const png = Buffer.alloc(24);
    Buffer.from("89504e470d0a1a0a", "hex").copy(png, 0);
    png.writeUInt32BE(1254, 16);
    png.writeUInt32BE(1254, 20);

    expect(parsePngDimensions(png)).toEqual({ width: 1254, height: 1254 });
    expect(parsePngDimensions(Buffer.from("not png"))).toBeUndefined();
  });
});

async function createCodexImagegenHomeFixture() {
  const sourceHome = await mkdtemp(join(tmpdir(), "aimc-codex-home-"));
  await mkdir(join(sourceHome, "skills", ".system", "imagegen"), {
    recursive: true,
  });
  await writeFile(
    join(sourceHome, "auth.json"),
    JSON.stringify({ OPENAI_API_KEY: "test-key" }),
    "utf8",
  );
  await writeFile(
    join(sourceHome, "skills", ".system", "imagegen", "SKILL.md"),
    "imagegen skill",
    "utf8",
  );
  return sourceHome;
}
