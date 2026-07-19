import { mkdir, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { resolve } from "node:path";

import { CodexImagegenProvider } from "../apps/server/src/generation/providers/codex-imagegen.js";

type BenchmarkOptions = {
  agentModel: string;
  aspectRatio: string;
  codexHome: string;
  codexPath: string;
  iterations: number;
  outputDir: string;
  prompt: string;
  quality: "standard" | "hd" | "ultra";
  referenceImages: string[];
  timeoutMs: number;
};

type IterationResult = {
  height: number;
  iteration: number;
  outputPath: string;
  outputSizeBytes: number;
  totalMs: number;
  width: number;
};

const options = parseArgs(process.argv.slice(2));

async function main() {
  await mkdir(options.outputDir, { recursive: true });
  const provider = new CodexImagegenProvider({
    agentModel: options.agentModel,
    codexHome: options.codexHome,
    codexPath: options.codexPath,
    timeoutMs: options.timeoutMs,
  });
  const results: IterationResult[] = [];

  console.log(JSON.stringify({ event: "benchmark.start", options }, null, 2));
  for (let index = 0; index < options.iterations; index += 1) {
    const iteration = index + 1;
    const startedAt = performance.now();
    const generated = await provider.generate({
      model: "codex/gpt-image-2",
      prompt: options.prompt,
      aspectRatio: options.aspectRatio,
      quality: options.quality,
      ...(options.referenceImages.length > 0
        ? { inputImages: options.referenceImages }
        : {}),
      metadata: { attempt: iteration, jobId: `benchmark-${iteration}` },
    });
    const image = dataUrlToBuffer(generated.url);
    const outputPath = resolve(
      options.outputDir,
      `iteration-${iteration}-${generated.width}x${generated.height}.png`,
    );
    await writeFile(outputPath, image);
    const result = {
      height: generated.height,
      iteration,
      outputPath,
      outputSizeBytes: image.length,
      totalMs: Math.round(performance.now() - startedAt),
      width: generated.width,
    };
    results.push(result);
    console.log(
      JSON.stringify({ event: "iteration.done", ...result }, null, 2),
    );
  }

  const totals = results.map((result) => result.totalMs);
  const report = {
    event: "benchmark.done",
    generatedAt: new Date().toISOString(),
    options,
    results,
    summary: {
      averageMs: Math.round(
        totals.reduce((sum, duration) => sum + duration, 0) / totals.length,
      ),
      maxMs: Math.max(...totals),
      minMs: Math.min(...totals),
    },
  };
  const reportPath = resolve(options.outputDir, "report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
}

function parseArgs(args: string[]): BenchmarkOptions {
  const values = new Map<string, string>();
  const referenceImages: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (!arg?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg ?? ""}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${arg}`);
    }
    if (arg === "--reference-image") referenceImages.push(resolve(value));
    else values.set(arg.slice(2), value);
    index += 1;
  }

  const quality = values.get("quality") ?? "standard";
  if (quality !== "standard" && quality !== "hd" && quality !== "ultra") {
    throw new Error(`Unsupported quality: ${quality}`);
  }

  return {
    agentModel: values.get("agent-model") ?? "gpt-5.5",
    aspectRatio: values.get("aspect-ratio") ?? "1:1",
    codexHome: resolve(values.get("codex-home") ?? `${homedir()}/.codex`),
    codexPath: values.get("codex-path") ?? "codex",
    iterations: positiveInteger(values.get("iterations") ?? "1", "iterations"),
    outputDir: resolve(
      values.get("output-dir") ??
        `${tmpdir()}/aimc-imagegen-benchmark-${Date.now()}`,
    ),
    prompt:
      values.get("prompt") ??
      "A single red apple centered on a plain warm gray background, studio product photo, no text",
    quality,
    referenceImages,
    timeoutMs: positiveInteger(
      values.get("timeout-ms") ?? "600000",
      "timeout-ms",
    ),
  };
}

function positiveInteger(value: string, name: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function dataUrlToBuffer(dataUrl: string) {
  const match = dataUrl.match(/^data:[^;,]+;base64,(.*)$/s);
  if (!match?.[1]) {
    throw new Error("Image provider did not return a base64 data URL.");
  }
  return Buffer.from(match[1], "base64");
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
