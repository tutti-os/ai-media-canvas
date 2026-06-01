# Loomic Standalone Web App Design

## Goal

Build a new local-only Web app derived from Loomic with these constraints:

- single-user only
- no account system
- no login or registration
- no landing page or pricing page
- open directly into the working project experience
- no Supabase
- no payments or credits
- SQLite for application data
- local filesystem for generated assets and uploads

This document is an analysis and implementation design, not a finished code scaffold.

## Recommendation

Do not try to convert the current `Loomic` repo in place by swapping Postgres for SQLite.

Recommended approach:

1. Create a new project folder for the standalone app.
2. Reuse the current UI and selected business logic selectively.
3. Replace the backend foundation completely:
   - Supabase Auth -> local anonymous single-user context
   - Supabase Postgres tables/RPC/RLS -> SQLite repository layer
   - Supabase Storage -> local file storage
   - PGMQ worker queue -> in-process job runner or lightweight local queue
   - LemonSqueezy + credits -> remove entirely

This is still a meaningful project, but it is much safer than trying to surgically unpick multi-tenant cloud assumptions from the existing app in place.

## Current Loomic Dependency Map

### 1. Frontend

Current frontend stack:

- `Next.js 15`
- `React 19`
- Excalidraw-based canvas editor
- WebSocket client for live agent/job updates
- Supabase browser auth client

Main frontend route groups today:

- landing page: `/`
- auth pages: `/login`, `/register`, `/auth/callback`
- pricing page: `/pricing`
- workspace pages: `/home`, `/projects`, `/settings`, `/skills`, `/brand-kit`
- canvas page: `/canvas?id=...`

Important frontend coupling points:

- `apps/web/src/lib/auth-context.tsx`
  - global session source is Supabase auth
- `apps/web/src/lib/supabase-browser.ts`
  - hard dependency on `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `apps/web/src/lib/server-api.ts`
  - most API calls require bearer token
- `apps/web/src/app/page.tsx`
  - current root route is a marketing landing page
- `apps/web/src/app/canvas/page.tsx`
  - current working surface depends on authenticated user/session state

### 2. Backend

Current backend stack:

- `Fastify`
- `@fastify/websocket`
- LangGraph/LangChain runtime
- Supabase JS client
- Postgres-backed agent persistence
- PGMQ-based worker queue

Backend route surface today includes:

- viewer bootstrap
- projects
- canvases
- chat
- runs
- uploads
- models
- image/video generation
- jobs
- workspace settings
- skills marketplace
- credits
- payments

The server wiring in `apps/server/src/app.ts` shows the depth of the current coupling:

- auth is created from Supabase
- user-scoped clients are created from bearer tokens
- viewer bootstrap uses Supabase RPC/table data
- uploads use Supabase Storage
- jobs use PGMQ through Postgres
- credits and payment routes are always part of the app surface when configured

### 3. Database / BaaS

Current persistence is not just "a database". It is a bundle of platform features:

- Supabase Auth
- Postgres relational data
- Supabase Storage buckets
- RLS policies
- RPC functions
- PGMQ

Observed table/function families from migrations:

- user/workspace foundation
  - `profiles`
  - `workspaces`
  - `workspace_members`
  - bootstrap functions and triggers on `auth.users`
- content
  - `projects`
  - `canvases`
  - `asset_objects`
  - chat/thread/session persistence
  - workspace settings
  - brand kits
  - skills management
- async runtime
  - `background_jobs`
  - `image_generation_jobs`
  - `video_generation_jobs`
  - `code_execution_jobs`
- monetization
  - credits tables/functions
  - payment integration tables/functions

### 4. Storage

Current file handling depends on Supabase Storage:

- project assets bucket
- canvas screenshots bucket
- brand kit storage bucket
- thumbnail URLs and signed/public URL generation

The upload service does both:

- binary object storage
- relational metadata in `asset_objects`

### 5. Async job execution

Current worker architecture:

- API creates job rows in `background_jobs`
- API enqueues queue messages via PGMQ
- worker polls queue tables from Postgres
- worker marks running/succeeded/failed/dead-letter states
- frontend listens by WebSocket and polls jobs as fallback

This exists because image/video generation is slow and failure-prone.

### 6. Monetization / gating

Current product logic includes:

- pricing page
- LemonSqueezy checkout
- subscription state
- plan limits
- credit deduction/refund/grant
- model gating and watermark behavior

This is spread across both frontend and backend and must be removed for standalone mode.

## Why In-Place Conversion Is a Bad Fit

Changing only the database driver is not enough because the current app assumes:

- authenticated users exist
- every data record belongs to a workspace/member model
- file storage is a Supabase bucket
- async jobs are coordinated through Postgres queue primitives
- agent persistence can use a Postgres checkpoint/store backend
- credits and payments affect generation behavior

If we change those pieces one by one in the existing repo, we will spend more time disabling cloud assumptions than building the local product.

For a local single-user app, the better design is:

- one built-in local identity
- one local workspace
- one local storage root
- one SQLite database file
- no pricing state
- no RLS
- no token handling

## Standalone Target Architecture

### Product shape

Target usage flow:

1. start the local app
2. open browser on local address
3. app auto-loads the last project, or creates a default project if none exists
4. user lands directly in canvas/project workspace

No first-run login, no landing funnel, no billing path.

### Recommended technical shape

Keep:

- `Next.js` frontend
- `Fastify` backend
- current canvas/chat/generation UI where practical
- WebSocket event stream if needed for long-running generations

Replace:

- Supabase auth/session model -> local sessionless API
- Supabase data access -> SQLite repositories
- Supabase storage -> local files
- PGMQ worker -> local job runner
- payment/credits/tier enforcement -> remove

### Suggested project layout

Recommended new folder:

- `/Users/wwcome/work/demo/Loomic-standalone`

Suggested internal structure:

- `apps/web`
- `apps/server`
- `packages/shared`
- `data/app.db`
- `data/assets/`

If speed matters more than preserving the monorepo shape, an even simpler alternative is:

- one `web` app
- one `server` app
- optional shared types package

## What Should Be Removed

These features should be cut entirely in the standalone version:

- login page
- register page
- auth callback page
- pricing page
- billing section
- credit balance widgets
- daily credit claim
- subscription management
- LemonSqueezy integration
- model tier locks
- watermark behavior tied to free plan
- skills marketplace if it depends on user/workspace cloud ownership

Routes to remove or bypass:

- `/`
  - replace with redirect into local workspace/project
- `/login`
- `/register`
- `/auth/callback`
- `/pricing`

Backend modules to remove from the standalone surface:

- Supabase auth adapters
- payment routes/services
- credit routes/services
- tier guard
- viewer bootstrap based on auth users

## What Can Be Kept

These areas are still valuable and mostly product-oriented rather than cloud-oriented:

- canvas editor UI
- chat sidebar UI
- model picker UI
- generation provider adapters
- canvas element insertion logic
- project and canvas concepts
- WebSocket event UI if we keep background jobs

These will still need adaptation, but they are good reuse candidates.

## Required Replacements

### 1. Auth replacement

Current model:

- browser obtains Supabase session
- frontend sends bearer token
- backend resolves authenticated user from token

Standalone model:

- no external auth provider
- backend treats every request as coming from the local owner
- frontend has no auth context
- API helpers remove bearer token requirement

Recommended replacement:

- remove `AuthProvider`
- replace with `LocalAppProvider` or no provider at all
- remove `/api/viewer` auth bootstrap
- add `/api/app/bootstrap` that returns:
  - app info
  - local workspace info
  - last project / default project
  - local settings

### 2. Workspace/user model replacement

Current model is multi-tenant:

- users
- workspaces
- members
- ownership
- role-based access

Standalone model:

- one fixed local workspace
- one fixed local profile

Recommended simplification:

- keep a `profile` table only if settings UI needs it
- optionally keep `workspace` table with a single row
- remove `workspace_members`
- remove permission logic entirely

### 3. Database replacement

Recommended SQLite tables for v1:

- `app_profile`
  - `id`
  - `display_name`
  - `avatar_path`
- `projects`
  - `id`
  - `name`
  - `slug`
  - `description`
  - `thumbnail_path`
  - `created_at`
  - `updated_at`
  - `archived_at`
- `canvases`
  - `id`
  - `project_id`
  - `name`
  - `is_primary`
  - `content_json`
  - `created_at`
  - `updated_at`
- `chat_threads`
  - `id`
  - `project_id`
  - `canvas_id`
  - `title`
  - `created_at`
  - `updated_at`
- `chat_messages`
  - `id`
  - `thread_id`
  - `role`
  - `content_json`
  - `created_at`
- `brand_kits`
  - `id`
  - `name`
  - `data_json`
  - `created_at`
  - `updated_at`
- `asset_objects`
  - `id`
  - `project_id`
  - `bucket`
  - `object_path`
  - `mime_type`
  - `byte_size`
  - `created_at`
- `workspace_settings`
  - `id`
  - `default_model`
  - `created_at`
  - `updated_at`
- `background_jobs`
  - `id`
  - `job_type`
  - `status`
  - `project_id`
  - `canvas_id`
  - `thread_id`
  - `payload_json`
  - `result_json`
  - `error_code`
  - `error_message`
  - `attempt_count`
  - `max_attempts`
  - `created_at`
  - `updated_at`
  - `started_at`
  - `completed_at`

### 4. Storage replacement

Recommended local storage layout:

- `data/assets/projects/<projectId>/...`
- `data/assets/brand-kits/...`
- `data/assets/screenshots/...`
- `data/assets/uploads/...`

Replace current storage service behavior with:

- save files directly to disk
- save metadata rows in SQLite
- serve files through local Fastify static/file routes

Recommended URL pattern:

- `/local-assets/<path>`

### 5. Agent persistence replacement

Current LangGraph persistence uses a Postgres checkpointer/store.

Standalone options:

1. simplest for v1
   - disable durable graph persistence
   - keep only chat history and project state in SQLite
2. medium complexity
   - implement SQLite-backed checkpoint/store adapter
3. fast fallback
   - filesystem-backed persistence for agent threads/checkpoints

Recommendation:

Use filesystem or simplified SQLite persistence in v1. Do not block the standalone project on reproducing the current Postgres persistence behavior exactly.

### 6. Worker/queue replacement

There are two viable local patterns.

Option A: synchronous generation for first version

- API call performs generation directly
- returns result when complete
- no separate worker process

Pros:

- smallest architecture
- easiest to debug locally

Cons:

- long API requests
- weaker resilience for slow video jobs

Option B: local background job runner

- API inserts job into SQLite
- in-process runner picks queued jobs
- WebSocket pushes status updates to frontend

Pros:

- preserves current product feel
- better for slow image/video jobs

Cons:

- more moving parts

Recommendation:

- image generation: can be synchronous in v1
- video generation: consider background jobs if retained

If the goal is fastest usable standalone release, start with synchronous generation and add a local queue only if needed.

### 7. Payments/credits replacement

Recommended handling:

- delete the entire pricing/billing/credits feature set
- every model available locally is controlled only by provider keys and local settings
- if desired later, add simple local safeguards such as max image size or confirmation prompts, not credits

This removes substantial complexity across both UI and backend.

## Route Design For Standalone

Recommended frontend routes:

- `/`
  - redirect to `/project/<defaultProjectId>` or create one and redirect
- `/project/[projectId]`
  - primary working page
- `/settings`
  - optional local settings
- `/brand-kit`
  - optional if kept

Recommended simplification:

- stop centering the app on `/canvas?id=...`
- introduce project-first routing
- resolve primary canvas automatically for the project

Possible behavior:

- first launch creates:
  - one default project
  - one primary canvas
- app stores `last_open_project_id`
- root route opens that project directly

## API Design For Standalone

Recommended API surface:

- `GET /api/app/bootstrap`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:projectId`
- `PATCH /api/projects/:projectId`
- `DELETE /api/projects/:projectId`
- `GET /api/projects/:projectId/primary-canvas`
- `GET /api/canvases/:canvasId`
- `PUT /api/canvases/:canvasId`
- `POST /api/uploads`
- `POST /api/generate/image`
- `POST /api/generate/video`
- `GET /api/jobs/:jobId`
- `GET /api/workspace/settings`
- `PUT /api/workspace/settings`

Differences from current API:

- no bearer token
- no user-scoped client creation
- no viewer bootstrap from auth
- no credits/billing endpoints

## Dependency Decision Matrix

### Keep with adaptation

- Next.js
- Fastify
- shared schemas/types where still relevant
- generation provider integrations
- Excalidraw canvas UI
- project/canvas/chat concepts

### Replace

- Supabase JS clients
- Supabase migrations
- Supabase Storage access
- Postgres checkpoint persistence
- PGMQ queue client
- auth context/session handling

### Remove

- login/register/auth callback
- pricing
- billing
- LemonSqueezy
- credits
- tier gating
- free-plan watermark behavior

## Implementation Strategy

### Phase 0: fork the product shape, not the infrastructure

Create the new standalone project folder and copy only the parts we intend to keep:

- canvas UI
- chat UI
- server HTTP structure
- generation provider code
- selected shared types

Do not copy:

- Supabase migrations as the new source of truth
- billing/payment modules
- auth modules as-is

### Phase 1: establish local foundations

Build:

- SQLite schema
- repository layer
- local file storage service
- bootstrap endpoint
- default project creation flow

Success check:

- app can launch with an empty `app.db`
- first run auto-creates a usable project/canvas

### Phase 2: remove auth and landing funnel

Change frontend to:

- drop auth context
- stop using Supabase browser client
- remove login/register/pricing pages
- redirect `/` directly into the last/default project

Success check:

- fresh app opens directly into working editor

### Phase 3: migrate project/canvas/chat APIs

Replace current Supabase-backed services with SQLite-backed services:

- projects
- canvases
- threads/messages
- settings
- brand kits if retained

Success check:

- create/edit/save/reopen project locally

### Phase 4: local asset storage

Implement:

- upload-to-disk
- metadata rows
- local asset URLs
- thumbnail generation path

Success check:

- generated/uploaded images survive app restart

### Phase 5: generation execution model

Start with:

- synchronous local generation requests

Then optionally add:

- local background jobs
- WebSocket status updates

Success check:

- image generation works end-to-end without Supabase or worker dependency

### Phase 6: remove monetization paths

Delete or no-op:

- credit checks
- refunds
- subscription state
- payment webhook logic
- upgrade CTAs

Success check:

- no pricing references remain in working flow

## Suggested Tech Choices

For SQLite access:

- `better-sqlite3`
  - strong fit for local desktop/server-side use
  - simple for synchronous local repositories

For migrations:

- simple SQL migration runner
- or `drizzle` if you want typed schema management

For file serving:

- Fastify static route or explicit file streaming route

For local config:

- `.env.local`
- plus a `data/` folder created on first run

## Risks

### 1. Agent persistence parity

The current LangGraph persistence path is Postgres-centric. Exact parity may be expensive. We should avoid making it a blocker for v1.

### 2. Hidden workspace assumptions

Even after removing auth, some UI and API code will still assume:

- workspace IDs
- membership
- profile data
- bearer-token-based fetch helpers

Expect a fair amount of cleanup here.

### 3. Async generation complexity

If video generation must remain fully supported in v1, a local queue may become necessary sooner.

### 4. Asset URL assumptions

Some frontend code already assumes Supabase storage URL formats. Those parsing assumptions will need to be replaced.

## Practical Recommendation

If the goal is to ship a useful standalone version quickly, define v1 as:

- local web app
- single user
- one local workspace
- SQLite
- local file storage
- no auth
- no pricing
- no credits
- no payments
- direct open into last/default project
- image generation first
- optional video generation later

This gives a realistic path to a product that feels like Loomic but is operationally simple.

## Proposed First Build Scope

Standalone v1 should include:

- project list
- project creation
- primary canvas editing
- chat sidebar
- image generation
- local uploads
- local settings
- persistent local reopen

Standalone v1 should exclude:

- login/register
- landing page
- pricing
- payments
- subscriptions
- credits
- multi-user workspaces
- cloud storage
- remote queue dependency

## Recommended Next Step

Implement the standalone app as a new project under:

- `/Users/wwcome/work/demo/Loomic-standalone`

with this order:

1. bootstrap local DB + local storage
2. direct-open route flow
3. project/canvas persistence
4. image generation path
5. optional background jobs

Once this direction is confirmed, the next document should be a build plan that breaks the standalone work into concrete implementation tasks and file scaffolds.
