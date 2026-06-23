# Contributing to AI Canvas

Thanks for your interest in contributing to AI Canvas.

This project is a local-first, single-user AI media canvas. Please keep changes focused, practical, and aligned with the existing app architecture.

## Development Setup

```bash
corepack enable
pnpm install
cp .env.example .env.local
./scripts/start-aimc-dev.sh
```

## Before Opening a Pull Request

Run the checks that match your change:

```bash
pnpm run lint
pnpm run typecheck
pnpm run test
```

For focused package checks:

```bash
pnpm --filter @aimc/web test
pnpm --filter @aimc/server test
```

## Web Copy and i18n

`apps/web` uses `i18next`, `react-i18next`, and `i18next-cli`.

Any new or changed user-visible web copy must use translated keys through `t(...)`, `i18n.t(...)`, or an existing translated data source. Update every supported locale in `apps/web/src/i18n/locales`.

Before submitting UI copy changes, run:

```bash
pnpm check:i18n
```

## Coding Guidelines

- Prefer existing patterns over new abstractions.
- Keep changes scoped to the behavior being changed.
- Avoid speculative features and unrelated refactors.
- Add or update tests when behavior changes.
- Do not commit secrets, local data, generated databases, or provider API keys.

## Pull Request Notes

Please include:

- what changed
- why it changed
- how you verified it
- screenshots or short recordings for visible UI changes

## License

By contributing, you agree that your contributions are licensed under the Apache License 2.0.
