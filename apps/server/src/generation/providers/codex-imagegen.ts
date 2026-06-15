import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";

import type {
  GeneratedImage,
  ImageGenerateParams,
  ImageProvider,
  ModelInfo,
} from "../types.js";
import { GenerationError, aspectRatioToDimensions } from "../utils.js";

const ICON_CODEX = "https://github.com/openai.png";
const DEFAULT_CODEX_TIMEOUT_MS = 5 * 60_000;
const CODEX_IMAGEGEN_MODEL_ID = "codex/gpt-image-2";

export const CODEX_IMAGEGEN_MODELS: readonly ModelInfo[] = [
  {
    id: CODEX_IMAGEGEN_MODEL_ID,
    displayName: "Codex GPT Image 2",
    description:
      "Routes image generation through the signed-in local Codex imagegen skill.",
    iconUrl: ICON_CODEX,
  },
];

export type CodexImagegenExec = (
  args: readonly string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    timeoutMs: number;
  },
) => Promise<{ stdout: string; stderr: string }>;

export interface CodexImagegenProviderOptions {
  codexPath?: string;
  codexHome?: string;
  timeoutMs?: number;
  execCodex?: CodexImagegenExec;
}

export class CodexImagegenProvider implements ImageProvider {
  readonly name = "codex-imagegen";
  readonly models = CODEX_IMAGEGEN_MODELS;
  private readonly codexPath: string;
  private readonly codexHome: string | undefined;
  private readonly timeoutMs: number;
  private readonly execCodex: CodexImagegenExec;

  constructor(options: CodexImagegenProviderOptions = {}) {
    this.codexPath = options.codexPath ?? "codex";
    this.codexHome = options.codexHome;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_CODEX_TIMEOUT_MS;
    this.execCodex = options.execCodex ?? defaultExecCodex(this.codexPath);
  }

  async generate(params: ImageGenerateParams): Promise<GeneratedImage> {
    if (params.model !== CODEX_IMAGEGEN_MODEL_ID) {
      throw new GenerationError(
        this.name,
        "model_not_found",
        `Unsupported Codex Imagegen model: ${params.model}`,
      );
    }
    if ((params.inputImages?.length ?? 0) > 0) {
      throw new GenerationError(
        this.name,
        "invalid_input",
        "Codex Imagegen currently supports text-to-image generation only.",
      );
    }

    const aspectRatio = params.aspectRatio ?? "1:1";
    const dimensions = params.size
      ? dimensionsFromSize(params.size, aspectRatio)
      : aspectRatioToDimensions(aspectRatio);
    const runDir = await mkdtemp(join(tmpdir(), "aimc-codex-imagegen-"));
    const outputPath = resolve(runDir, "codex-images", "result.png");
    await mkdir(dirname(outputPath), { recursive: true });

    try {
      const instruction = buildCodexImagegenInstruction(params, {
        aspectRatio,
        outputPath,
      });
      const env = {
        ...process.env,
        ...(this.codexHome ? { CODEX_HOME: this.codexHome } : {}),
      };
      const result = await this.execCodex(
        [
          "exec",
          "--ignore-user-config",
          "--full-auto",
          "--skip-git-repo-check",
          "-C",
          runDir,
          "--",
          instruction,
        ],
        {
          cwd: runDir,
          env,
          timeoutMs: this.timeoutMs,
        },
      );
      const savedPath = parseSavedPath(`${result.stdout}\n${result.stderr}`);
      const resolvedPath = resolveSavedPath(savedPath, runDir);
      if (!isPathInside(runDir, resolvedPath)) {
        throw new GenerationError(
          this.name,
          "invalid_output_path",
          "Codex Imagegen returned an output path outside the run directory.",
        );
      }
      const imageBuffer = await readFile(resolvedPath);
      return {
        url: `data:image/png;base64,${imageBuffer.toString("base64")}`,
        mimeType: "image/png",
        width: dimensions.width,
        height: dimensions.height,
      };
    } catch (error) {
      if (error instanceof GenerationError) throw error;
      throw new GenerationError(
        this.name,
        "api_error",
        error instanceof Error ? error.message : "Unknown Codex Imagegen error",
      );
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  }
}

function buildCodexImagegenInstruction(
  params: ImageGenerateParams,
  options: { aspectRatio: string; outputPath: string },
) {
  const quality = params.quality ?? "hd";
  return [
    "Use the system imagegen skill to generate exactly one raster image.",
    "Do not call any AIMC tools. Do not write explanations.",
    `Prompt: ${params.prompt}`,
    `Aspect ratio: ${options.aspectRatio}`,
    `Quality: ${quality}`,
    "Output format: PNG.",
    `Save the final image exactly at: ${options.outputPath}`,
    "After saving, print a final line in this exact format:",
    `SAVED: ${options.outputPath}`,
  ].join("\n");
}

export function parseSavedPath(output: string) {
  const matches = [...output.matchAll(/^SAVED:\s*(.+?)\s*$/gim)];
  const savedPath = matches.at(-1)?.[1]?.trim();
  if (!savedPath) {
    throw new GenerationError(
      "codex-imagegen",
      "no_output",
      "Codex Imagegen did not report a SAVED output path.",
    );
  }
  return savedPath;
}

function resolveSavedPath(savedPath: string, runDir: string) {
  return isAbsolute(savedPath)
    ? resolve(savedPath)
    : resolve(runDir, savedPath);
}

function isPathInside(parent: string, child: string) {
  const normalizedParent = resolve(parent);
  const normalizedChild = resolve(child);
  return (
    normalizedChild === normalizedParent ||
    normalizedChild.startsWith(`${normalizedParent}${sep}`)
  );
}

function dimensionsFromSize(size: string, fallbackAspectRatio: string) {
  const match = size.match(/^(\d+)x(\d+)$/);
  if (!match) return aspectRatioToDimensions(fallbackAspectRatio);
  return {
    width: Number.parseInt(match[1] ?? "1024", 10),
    height: Number.parseInt(match[2] ?? "1024", 10),
  };
}

function defaultExecCodex(command: string): CodexImagegenExec {
  return (args, options) =>
    new Promise((resolvePromise, reject) => {
      const child = spawn(command, [...args], {
        cwd: options.cwd,
        env: options.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        reject(
          new GenerationError(
            "codex-imagegen",
            "timeout",
            `Codex Imagegen timed out after ${options.timeoutMs}ms.`,
          ),
        );
      }, options.timeoutMs);

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolvePromise({ stdout, stderr });
          return;
        }
        reject(
          new GenerationError(
            "codex-imagegen",
            "api_error",
            `Codex Imagegen exited with code ${code}: ${stderr || stdout}`,
          ),
        );
      });
    });
}
