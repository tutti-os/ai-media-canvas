#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const supportedLocales = ["zh-CN", "en"];
const defaultLocalesRoot = path.join(
  process.cwd(),
  "apps/web/src/i18n/locales",
);

const localesRoot = resolveArg("--locales-root") ?? defaultLocalesRoot;
const baseRef = process.env.AIMC_I18N_BASE_REF ?? "HEAD";
const errors = [];

main();

function main() {
  if (!existsSync(localesRoot)) {
    fail(`locales-root-missing ${localesRoot}`);
  }

  const resources = readResources(localesRoot);
  checkResourceShape(resources);
  checkPairedChanges(localesRoot, resources);

  if (errors.length > 0) {
    fail(errors.join("\n"));
  }

  process.stdout.write("i18n resource check passed\n");
}

function resolveArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function readResources(root) {
  const resources = {};
  for (const locale of supportedLocales) {
    const localeDir = path.join(root, locale);
    resources[locale] = {};
    if (!existsSync(localeDir)) {
      errors.push(`locale-directory-missing ${locale}`);
      continue;
    }
    for (const file of readdirSync(localeDir).filter((entry) =>
      entry.endsWith(".json"),
    )) {
      const namespace = path.basename(file, ".json");
      const fullPath = path.join(localeDir, file);
      try {
        resources[locale][namespace] = JSON.parse(
          readFileSync(fullPath, "utf8"),
        );
      } catch (error) {
        errors.push(`locale-json-invalid ${locale}/${file}: ${error.message}`);
      }
    }
  }
  return resources;
}

function checkResourceShape(resources) {
  const allNamespaces = new Set();
  for (const locale of supportedLocales) {
    for (const namespace of Object.keys(resources[locale] ?? {})) {
      allNamespaces.add(namespace);
    }
  }

  for (const namespace of allNamespaces) {
    const keyMap = new Map();
    for (const locale of supportedLocales) {
      const flat = flattenDictionary(resources[locale]?.[namespace] ?? {});
      keyMap.set(locale, flat);
      for (const [key, value] of flat) {
        if (typeof value !== "string" || value.trim() === "") {
          errors.push(`locale-value-empty ${locale}/${namespace}.${key}`);
        }
      }
    }

    const allKeys = new Set(
      [...keyMap.values()].flatMap((flat) => [...flat.keys()]),
    );
    for (const key of allKeys) {
      for (const locale of supportedLocales) {
        if (!keyMap.get(locale)?.has(key)) {
          errors.push(`locale-key-missing ${locale}/${namespace}.${key}`);
        }
      }

      const placeholderSignatures = supportedLocales.map((locale) => [
        locale,
        placeholderSignature(keyMap.get(locale)?.get(key) ?? ""),
      ]);
      const [, expected] = placeholderSignatures[0] ?? ["", ""];
      for (const [locale, signature] of placeholderSignatures.slice(1)) {
        if (signature !== expected) {
          errors.push(`locale-placeholder ${locale}/${namespace}.${key}`);
        }
      }
    }
  }
}

function checkPairedChanges(root, resources) {
  if (!isInsideGitWorkTree(root)) return;

  const changed = new Map();
  for (const locale of supportedLocales) {
    for (const namespace of Object.keys(resources[locale] ?? {})) {
      const filePath = path.join(root, locale, `${namespace}.json`);
      const previous = readJsonFromGit(filePath);
      if (!previous) continue;
      const before = flattenDictionary(previous);
      const after = flattenDictionary(resources[locale][namespace]);
      for (const key of new Set([...before.keys(), ...after.keys()])) {
        if (before.get(key) !== after.get(key)) {
          const id = `${namespace}.${key}`;
          const locales = changed.get(id) ?? new Set();
          locales.add(locale);
          changed.set(id, locales);
        }
      }
    }
  }

  for (const [key, locales] of changed) {
    const missing = supportedLocales.filter((locale) => !locales.has(locale));
    if (missing.length > 0) {
      errors.push(`locale-change-unpaired ${key} missing ${missing.join(",")}`);
    }
  }
}

function flattenDictionary(value, prefix = "", output = new Map()) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return output;
  }

  for (const [key, child] of Object.entries(value)) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") {
      output.set(nextPrefix, child);
    } else {
      flattenDictionary(child, nextPrefix, output);
    }
  }
  return output;
}

function placeholderSignature(value) {
  return [...value.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)]
    .map((match) => match[1])
    .sort()
    .join(",");
}

function isInsideGitWorkTree(cwd) {
  const result = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd,
    encoding: "utf8",
  });
  return result.status === 0 && result.stdout.trim() === "true";
}

function readJsonFromGit(filePath) {
  try {
    const relativePath = execFileSync(
      "git",
      ["ls-files", "--full-name", filePath],
      {
        cwd: path.dirname(filePath),
        encoding: "utf8",
      },
    )
      .split("\n")
      .find(Boolean);
    if (!relativePath) return null;

    const contents = execFileSync(
      "git",
      ["show", `${baseRef}:${relativePath}`],
      {
        cwd: path.dirname(filePath),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    return JSON.parse(contents);
  } catch {
    return null;
  }
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
