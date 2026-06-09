import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const scriptPath = path.join(repoRoot, "scripts/check-i18n-resources.mjs");

test("i18n resource check rejects missing locale keys", async () => {
  const fixture = await createLocaleFixture({
    "zh-CN": { common: { save: "保存", cancel: "取消" } },
    en: { common: { save: "Save" } },
  });

  const result = runCheck(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /locale-key-missing/);
  assert.match(result.stderr, /common\.cancel/);
});

test("i18n resource check rejects placeholder mismatches", async () => {
  const fixture = await createLocaleFixture({
    "zh-CN": { common: { ready: "已就绪 {{count}} 个" } },
    en: { common: { ready: "{{total}} ready" } },
  });

  const result = runCheck(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /locale-placeholder/);
  assert.match(result.stderr, /common\.ready/);
});

test("i18n resource check rejects empty values", async () => {
  const fixture = await createLocaleFixture({
    "zh-CN": { common: { save: "保存" } },
    en: { common: { save: "" } },
  });

  const result = runCheck(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /locale-value-empty/);
  assert.match(result.stderr, /common\.save/);
});

test("i18n resource check rejects changing only one locale value", async () => {
  const fixture = await createLocaleFixture({
    "zh-CN": { common: { save: "保存" } },
    en: { common: { save: "Save" } },
  });
  initGitFixture(fixture);
  await writeLocaleFile(fixture, "zh-CN", "common", { save: "保存项目" });

  const result = runCheck(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /locale-change-unpaired/);
  assert.match(result.stderr, /common\.save/);
});

test("i18n resource check accepts changing paired locale values", async () => {
  const fixture = await createLocaleFixture({
    "zh-CN": { common: { save: "保存" } },
    en: { common: { save: "Save" } },
  });
  initGitFixture(fixture);
  await writeLocaleFile(fixture, "zh-CN", "common", { save: "保存项目" });
  await writeLocaleFile(fixture, "en", "common", { save: "Save project" });

  const result = runCheck(fixture);

  assert.equal(result.status, 0, result.stderr || result.stdout);
});

async function createLocaleFixture(resources) {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "aimc-i18n-"));
  for (const [locale, namespaces] of Object.entries(resources)) {
    for (const [namespace, values] of Object.entries(namespaces)) {
      await writeLocaleFile(fixture, locale, namespace, values);
    }
  }
  return fixture;
}

async function writeLocaleFile(root, locale, namespace, values) {
  const dir = path.join(root, locale);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, `${namespace}.json`),
    `${JSON.stringify(values, null, 2)}\n`,
  );
}

function initGitFixture(cwd) {
  execFileSync("git", ["init"], { cwd, stdio: "ignore" });
  execFileSync("git", ["add", "."], { cwd, stdio: "ignore" });
  execFileSync(
    "git",
    [
      "-c",
      "user.email=codex@example.test",
      "-c",
      "user.name=Codex",
      "commit",
      "-m",
      "baseline",
    ],
    { cwd, stdio: "ignore" },
  );
}

function runCheck(localesRoot) {
  return spawnSync(
    process.execPath,
    [scriptPath, "--locales-root", localesRoot],
    {
      cwd: localesRoot,
      encoding: "utf8",
    },
  );
}
