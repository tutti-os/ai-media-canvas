# AI Media Canvas Agent Overrides

## Web I18n Enforcement

- `apps/web` uses `i18next + react-i18next + i18next-cli` with supported locales `zh-CN` and `en`.
- Any new or changed user-visible web copy must use `t(...)`, `i18n.t(...)`, or an existing translated data source. This includes page text, buttons, placeholders, aria labels, titles, dialogs, empty states, toast messages, prompts, menus, and seed/template copy.
- When changing a translation value in one locale, update the same namespace/key in every supported locale in `apps/web/src/i18n/locales`.
- Run `pnpm check:i18n` before finishing any change that touches web UI copy or translation resources.
- Do not bypass i18n checks with ignore comments unless the string is a product name, technical identifier, provider/model label, API identifier, file extension, keyboard shortcut, route name, or user-generated content.
- Keep static export compatibility: do not introduce locale-prefixed routes or server-cookie rendering dependencies for language switching.

## Agnes Asset Uploads

- When invoking Agnes with local files, data URLs, or private/local asset URLs that need a temporary public URL, prefer Uguu as the first temporary upload provider.
- For `agnes-ai-cli` or its JS client, use `temporaryMediaProviderOrder: ["uguu", "litterbox", "tmpfiles", "x0"]` when provider order is configurable, while preserving explicit caller overrides.
- If Uguu fails during a live request, allow the existing fallback providers to run instead of failing solely because Uguu was unavailable.<!-- subspace-session:start -->

<!-- subspace-session:end -->
