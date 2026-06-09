#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const commands = [
  ["pnpm", ["exec", "i18next-cli", "lint"]],
  ["pnpm", ["exec", "i18next-cli", "status"]],
  ["pnpm", ["exec", "i18next-cli", "extract", "--ci", "--dry-run"]],
  ["pnpm", ["exec", "i18next-cli", "types", "--ci"]],
  ["node", ["scripts/check-i18n-resources.mjs"]],
];

for (const [command, args] of commands) {
  process.stdout.write(`\n> ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
