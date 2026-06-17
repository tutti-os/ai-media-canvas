import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(scriptPath), "..");
const defaultOutputDir = path.join(rootDir, "output");
const outputZipPattern = /^ai-media-canvas-.+\.zip$/;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: "inherit",
      shell: false,
      ...options,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(`${command} ${args.join(" ")} exited with code ${code}`),
      );
    });
  });
}

export async function readPackageVersion() {
  const manifest = JSON.parse(
    await readFile(path.join(rootDir, "tutti.app.json"), "utf8"),
  );
  return manifest.version ?? "0.0.0";
}

export function resolveCloudZipPaths({
  outputDir = defaultOutputDir,
  version,
} = {}) {
  if (!version) {
    throw new Error("version is required.");
  }
  const fileName = `ai-media-canvas-${version}.zip`;
  return {
    buildZipPath: path.join(rootDir, "build", "tutti-app", fileName),
    outputZipPath: path.join(outputDir, fileName),
  };
}

export async function cleanPreviousCloudZips(outputDir = defaultOutputDir) {
  let entries;
  try {
    entries = await readdir(outputDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return;
    }
    throw error;
  }

  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && outputZipPattern.test(entry.name))
      .map((entry) => rm(path.join(outputDir, entry.name), { force: true })),
  );
}

export async function copyCloudZipToOutput({
  outputDir = defaultOutputDir,
  sourceZipPath,
} = {}) {
  if (!sourceZipPath) {
    throw new Error("sourceZipPath is required.");
  }

  await stat(sourceZipPath);
  await mkdir(outputDir, { recursive: true });
  await cleanPreviousCloudZips(outputDir);

  const outputZipPath = path.join(outputDir, path.basename(sourceZipPath));
  await copyFile(sourceZipPath, outputZipPath);
  return outputZipPath;
}

export async function packageCloudZip({ outputDir = defaultOutputDir } = {}) {
  const version = await readPackageVersion();
  const { buildZipPath } = resolveCloudZipPaths({ version });

  await run("pnpm", ["package:tutti"]);
  const outputZipPath = await copyCloudZipToOutput({
    outputDir,
    sourceZipPath: buildZipPath,
  });

  console.log(`Created ${outputZipPath}`);
  return outputZipPath;
}

if (process.argv[1] === scriptPath) {
  packageCloudZip().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
