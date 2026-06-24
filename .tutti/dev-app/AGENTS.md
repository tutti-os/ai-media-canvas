# AI Media Canvas Tutti Local Debug App

This directory is the Tutti local debug wrapper for the source project at `../..`.
Keep it small: it contains only the Tutti host contract, launch script, and local
debug metadata. The source app remains owned by the repository root.

## Runtime

- Tutti Desktop may load either the project root or `.tutti/dev-app/`.
- `bootstrap.sh` is the runtime entrypoint and takes no arguments.
- The script requires host-injected `TUTTI_APP_PORT` and uses
  `TUTTI_APP_HOST`, defaulting only the host to `127.0.0.1`.
- The Web app is started on `TUTTI_APP_HOST:TUTTI_APP_PORT`.
- The server is started on `AIMC_SERVER_PORT` when provided, otherwise on a
  nearby available internal port derived from `TUTTI_APP_PORT`.
- The Web app receives `NEXT_PUBLIC_AIMC_SERVER_BASE_URL` and
  `AIMC_SERVER_BASE_URL` pointing to the internal server.
- The server receives `AIMC_WEB_ORIGIN` matching the Tutti Web origin.
- When the host provides a managed files root, the script normalizes it to
  `AIMC_TUTTI_MANAGED_FILES_ROOT` so the server can safely confine managed-file
  asset paths before serving them.

## Commands

The wrapper launches the existing workspace through the managed Tutti Node
runtime and Corepack:

- `@aimc/server`: `dev`
- `@aimc/web`: `exec next dev -H "$TUTTI_APP_HOST" -p "$TUTTI_APP_PORT"`

`@aimc/shared` must be built before either dev process starts because the
workspace packages resolve it through `packages/shared/dist`.

Do not replace the managed runtime variables with system `node`, `npm`, `pnpm`,
or `yarn` commands in this wrapper.

## Editing Rules

- Normal edits under `apps/`, `packages/`, and other project source directories
  hot-reload through the project dev servers.
- Edits to `.tutti/dev-app/tutti.app.json`, `.tutti/dev-app/bootstrap.sh`,
  `.tutti/dev-app/icon.svg`, or this file require App Center's local-dev Reload
  action so Tutti rereads the manifest and restarts the runtime.
- Do not copy the repository into `.tutti/dev-app/`.
- Future release packaging should remain self-contained under `package/` or the
  existing release packaging output, not under this local debug wrapper.
