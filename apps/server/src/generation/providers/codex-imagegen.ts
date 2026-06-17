import { spawn } from "node:child_process";
import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";

import { resolveCodexImagegenAgentModel } from "../../agent/local-agent-models.js";
import type {
  GeneratedImage,
  ImageGenerateParams,
  ImageProvider,
  ModelInfo,
} from "../types.js";
import { GenerationError, aspectRatioToDimensions } from "../utils.js";

const ICON_CODEX = "https://github.com/openai.png";
const DEFAULT_CODEX_TIMEOUT_MS = 10 * 60_000;
const CODEX_IMAGEGEN_MODEL_ID = "codex/gpt-image-2";
const CODEX_IMAGEGEN_MAX_INPUT_IMAGES = 16;

export const CODEX_IMAGEGEN_MODELS: readonly ModelInfo[] = [
  {
    id: CODEX_IMAGEGEN_MODEL_ID,
    displayName: "GPT Image 2",
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
  agentModel?: string;
  resolveAgentModel?: () => Promise<string | undefined>;
  timeoutMs?: number;
  execCodex?: CodexImagegenExec;
}

export class CodexImagegenProvider implements ImageProvider {
  readonly name = "codex-imagegen";
  readonly models = CODEX_IMAGEGEN_MODELS;
  private readonly codexPath: string;
  private readonly codexHome: string | undefined;
  private readonly agentModel: string | undefined;
  private readonly resolveAgentModel: () => Promise<string | undefined>;
  private readonly timeoutMs: number;
  private readonly execCodex: CodexImagegenExec;

  constructor(options: CodexImagegenProviderOptions = {}) {
    this.codexPath = options.codexPath ?? "codex";
    this.codexHome = options.codexHome;
    this.agentModel = options.agentModel;
    this.resolveAgentModel =
      options.resolveAgentModel ??
      (() => resolveCodexImagegenAgentModel(this.agentModel));
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
    if ((params.inputImages?.length ?? 0) > CODEX_IMAGEGEN_MAX_INPUT_IMAGES) {
      throw new GenerationError(
        this.name,
        "invalid_input",
        `Codex Imagegen supports at most ${CODEX_IMAGEGEN_MAX_INPUT_IMAGES} reference images.`,
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
      const referenceImages = await materializeReferenceImages(
        params.inputImages ?? [],
        runDir,
      );
      const instruction = buildCodexImagegenInstruction(params, {
        aspectRatio,
        outputPath,
        referenceImages,
      });
      const agentModel = await this.resolveAgentModel();
      const codexHome = await materializeCodexImagegenHome({
        runDir,
        sourceHome: this.codexHome ?? join(homedir(), ".codex"),
      });
      const env = {
        ...process.env,
        CODEX_HOME: codexHome,
      };
      const result = await this.execCodex(
        [
          "exec",
          "--ignore-user-config",
          ...(agentModel ? ["-m", agentModel] : []),
          "--sandbox",
          "workspace-write",
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
      const imageDimensions = parsePngDimensions(imageBuffer) ?? dimensions;
      return {
        url: `data:image/png;base64,${imageBuffer.toString("base64")}`,
        mimeType: "image/png",
        width: imageDimensions.width,
        height: imageDimensions.height,
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

async function materializeCodexImagegenHome(options: {
  runDir: string;
  sourceHome: string;
}) {
  const runHome = join(options.runDir, ".codex-home");
  await mkdir(runHome, { recursive: true });
  await copyFile(
    join(options.sourceHome, "auth.json"),
    join(runHome, "auth.json"),
  );
  await cp(
    join(options.sourceHome, "skills", ".system", "imagegen"),
    join(runHome, "skills", ".system", "imagegen"),
    { recursive: true },
  );
  return runHome;
}

function buildCodexImagegenInstruction(
  params: ImageGenerateParams,
  options: {
    aspectRatio: string;
    outputPath: string;
    referenceImages: readonly string[];
  },
) {
  const quality = params.quality ?? "hd";
  return [
    "Use the system imagegen skill to generate exactly one raster image.",
    "Do not call any AIMC tools. Do not write explanations.",
    `Prompt: ${params.prompt}`,
    ...(options.referenceImages.length > 0
      ? [
          "Reference images:",
          ...options.referenceImages.map(
            (imagePath, index) => `${index + 1}. ${imagePath}`,
          ),
          "Use the reference image(s) for subject, composition, or style according to the prompt.",
        ]
      : []),
    `Aspect ratio: ${options.aspectRatio}`,
    `Quality: ${quality}`,
    "Output format: PNG.",
    `Save the final image exactly at: ${options.outputPath}`,
    "After saving, print a final line in this exact format:",
    `SAVED: ${options.outputPath}`,
  ].join("\n");
}

async function materializeReferenceImages(
  inputImages: readonly string[],
  runDir: string,
) {
  if (inputImages.length === 0) return [];

  const referenceDir = join(runDir, "reference-images");
  await mkdir(referenceDir, { recursive: true });

  const paths: string[] = [];
  for (const [index, inputImage] of inputImages.entries()) {
    const materialized = await materializeReferenceImage(
      inputImage,
      referenceDir,
      index,
    );
    paths.push(materialized);
  }
  return paths;
}

async function materializeReferenceImage(
  inputImage: string,
  referenceDir: string,
  index: number,
) {
  if (inputImage.startsWith("data:")) {
    const parsed = parseDataUrl(inputImage);
    const outputPath = join(
      referenceDir,
      `reference-${index + 1}.${extensionForMimeType(parsed.mimeType)}`,
    );
    await writeFile(outputPath, parsed.buffer);
    return outputPath;
  }

  if (/^https?:\/\//i.test(inputImage)) {
    const response = await fetch(inputImage);
    if (!response.ok) {
      throw new GenerationError(
        "codex-imagegen",
        "invalid_input",
        `Unable to fetch reference image ${index + 1}: ${response.status}`,
      );
    }
    const mimeType =
      response.headers.get("content-type")?.split(";")[0]?.trim() ??
      "image/png";
    const outputPath = join(
      referenceDir,
      `reference-${index + 1}.${extensionForMimeType(mimeType)}`,
    );
    await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
    return outputPath;
  }

  if (isAbsolute(inputImage)) {
    const outputPath = join(referenceDir, `reference-${index + 1}.png`);
    await copyFile(inputImage, outputPath);
    return outputPath;
  }

  throw new GenerationError(
    "codex-imagegen",
    "invalid_input",
    `Unsupported reference image input ${index + 1}.`,
  );
}

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)(;base64)?,(.*)$/s);
  if (!match) {
    throw new GenerationError(
      "codex-imagegen",
      "invalid_input",
      "Invalid reference image data URL.",
    );
  }

  const mimeType = match[1] ?? "image/png";
  const body = match[3] ?? "";
  const buffer = match[2]
    ? Buffer.from(body, "base64")
    : Buffer.from(decodeURIComponent(body), "utf8");
  return { mimeType, buffer };
}

function extensionForMimeType(mimeType: string) {
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "png";
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

export function parsePngDimensions(buffer: Buffer) {
  const pngSignature = "89504e470d0a1a0a";
  if (
    buffer.length < 24 ||
    buffer.subarray(0, 8).toString("hex") !== pngSignature
  ) {
    return undefined;
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
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
