# AI Media Canvas Agent Overrides

## Web I18n Enforcement

- `apps/web` uses `i18next + react-i18next + i18next-cli` with supported locales `zh-CN` and `en`.
- Any new or changed user-visible web copy must use `t(...)`, `i18n.t(...)`, or an existing translated data source. This includes page text, buttons, placeholders, aria labels, titles, dialogs, empty states, toast messages, prompts, menus, and seed/template copy.
- When changing a translation value in one locale, update the same namespace/key in every supported locale in `apps/web/src/i18n/locales`.
- Run `pnpm check:i18n` before finishing any change that touches web UI copy or translation resources.
- Do not bypass i18n checks with ignore comments unless the string is a product name, technical identifier, provider/model label, API identifier, file extension, keyboard shortcut, route name, or user-generated content.
- Keep static export compatibility: do not introduce locale-prefixed routes or server-cookie rendering dependencies for language switching.
