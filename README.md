# Movie Wheel

A private movie-night app for Abby, Darren, Elisabeth, Hannah, and Paul. Next.js App Router, React, TypeScript, and Supabase; prepared for Vercel's Node.js runtime.

The [master specification](docs/master-specification.md) and [approved plan](PLAN.md) define the product. Application code is separated into authentication, workspace, movies, schedule, wheel, chat, account settings, and reusable UI modules.

## Local setup

Use Node.js 22.13 or newer and pnpm 11 or newer.

```sh
pnpm install
pnpm setup:env
```

Edit `.env.local` with the values described in `.env.example`. `setup:env` generates `PIN_AUTH_SECRET` only if it is missing. It never prints it. Preserve this same secret for the same accounts across restarts and deployments; changing it makes existing PIN-derived credentials unusable.

Required application settings:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`)
- `OMDB_API_KEY`
- `PIN_AUTH_SECRET`

For automated setup, additionally set `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` in the ignored local environment file. The access token configures project settings, while the CLI links the existing project and applies versioned migrations. A CLI login alone can apply migrations, but automated Auth/Storage inspection needs the management token.

```sh
pnpm setup:supabase
pnpm dev
```

Setup targets the existing project, discovers its region and Storage file limit, applies migrations, disables public signup, configures current-password verification, and sets private image buckets to the effective provider limit. It does not assign PINs, create invitations, or deploy to Vercel. No application-specific attachment count or size cap is added. The setup command downloads the pinned Supabase CLI on demand.

Without credentials, the app still builds and displays the five-name login screen. Selecting a name explains that configuration is missing; shared application content is not available without authentication.

## Authentication and permissions

Name selection and six-digit PINs are the entire user-facing authentication flow. PINs are strings, including leading zeroes. Server routes derive internal credentials with HMAC-SHA256; Supabase Auth stores their password hashes. Fixed internal identifiers and an atomic Auth trigger bind each identity to exactly one of five seeded profiles. Concurrent setup cannot overwrite a claim. There is no custom login throttling, CAPTCHA, or secondary auth service.

Session cookies have no `Expires` or `Max-Age` on login or refresh. They use `SameSite=Lax` and HTTPS `Secure` in production. The browser Supabase client reads these cookies to use authenticated database, Storage, and Realtime APIs; they are not HttpOnly. No Auth tokens are persisted in localStorage. Browser session restoration can preserve session cookies after a restart. Explicit logout ends the current Supabase session, clears browser state and subscriptions, and preserves shared content; separate devices remain signed in.

RLS recognizes only identities bound to the five profiles. All members can add movies and manage all schedule entries. Only the member who originally added a movie can delete it; adding an existing movie adds a vote without transferring ownership. Delete controls appear only on that member's movies in every homepage view, and database policies enforce the same restriction. Only the authenticated owner can change their votes and settings. Authorship derives from the session, not client-supplied author identities. Privileged keys are server-only.

## Persistence and Realtime

- PostgreSQL stores movie metadata, votes, schedule snapshots, messages, attachment identities, and profile settings. Avatar and chat file contents live in private Storage buckets.
- Saved attachments reference permanent bucket/object paths. Viewing URLs are generated and refreshed; old messages remain readable across sessions/devices. New avatar paths avoid stale overwritten-object caches.
- Movie posters are external OMDb-supplied URLs, not archived files in Storage. A poster can disappear upstream; the app shows a fallback. Schedule snapshots retain title/year/URL even after movie deletion.
- Database changes invalidate client snapshots. Reconnect catches up chat history using a stable `(created_at, id)` cursor. Profile changes update historic message appearance.
- Presence uses a separate authenticated writer channel per member, tracks all connections, and aggregates by member. Typing state expires per connection; dot animation is local.
- Chat stays mounted above `/` and `/wheel`, preserving its composer, uploads, and scroll position during navigation.
- On desktop, drag chat's left divider to resize it. The focused divider also supports Left/Right arrow keys; double-click resets its width. The layout keeps the movie column usable as the window shrinks. The selected width stays through movie/wheel navigation; mobile uses the full-width Chat panel.
- All movie-night times are America/New_York. Skipped spring-forward times are rejected. Repeated fall-back times consistently choose the earlier occurrence and display the resulting Eastern abbreviation.
- Wheel entries have at least two votes, appear once each, and have equal chances through rejection-sampled browser randomness. Spins hold a snapshot, generate no records or broadcasts, and offer no post-spin actions.
- Movie sorting offers Most Votes, Least Votes, A-Z, Z-A, By Year Oldest, By Year Newest and My Votes, with alphabetical ordering within vote groups. Cards, Card List and single-line List views follow each member across devices.
- Schedule entries open a details popup. Account Settings is wider and its avatar has an enlarged hover preview. Chat avatars show profile cards with current Online/Offline status, and chat URLs become clickable links.
- Senders may delete their own messages for everyone. The database clears their text and attachment records atomically, retains only an empty retry marker, and queues image objects for Storage cleanup. Existing saved messages remain protected. Deleted history is reconciled after reconnect.
- The empty wheel remains visible with Spin disabled. Decorative collection, schedule, wheel and empty-chat copy has been removed.

## Upload behavior and maintenance

Images travel directly from browser to Storage. The queue processes two uploads at a time with no fixed attachment-count cap. Standard uploads handle small files; files above the provider's 6 MB transport recommendation use resumable TUS. That threshold is not an acceptance limit. Validation uses actual signatures for JPEG, PNG, WebP, and GIF, plus configured bucket constraints.

Pending images show previews, status, removal, and retry. All selected images must finish before `send_message` atomically publishes the message and attachments. A unique author/client-message ID makes retries idempotent. When publishing is unconfirmed, the composer retains and retries that exact submission so edits cannot silently replace a possibly saved message.

Staging records protect committed attachments from cleanup. Active queues renew their leases. Explicitly removed images are cleaned promptly; interrupted cleanup, abandoned drafts inactive for 24 hours, and replaced custom avatars are handled by:

```sh
pnpm maintenance:uploads
```

This is a bounded, repeatable maintenance operation using the Storage API. Run it periodically through an owner-controlled job when deploying; it does not require an Edge Function or a persistent application server. No scheduled external service is created automatically.

Preset avatars can be added later by uploading files to `avatar-presets` and inserting `avatar_options` records. No account redesign is needed.

Owner-only PIN recovery preserves the existing member UUID:

```sh
pnpm maintenance:pin paul
```

The script asks for a masked PIN or accepts the dedicated `MOVIE_WHEEL_RECOVERY_PIN` environment variable. Do not pass a PIN in command arguments. This is maintenance, not an administrator UI.

## Verification

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

Unit tests cover domain logic, PIN strings, cookies, timezone conversion, wheel geometry, image constraints, and queue behavior. Database tests execute the real migration in isolated PGlite PostgreSQL with fixture Auth/Storage/Realtime schemas and real roles/RLS. They do not apply migrations to the hosted project. Hosted Auth, Storage, Realtime, and independent-connection concurrency still require integration verification with the actual project.

Browser tests start an isolated Supabase-protocol fixture on port 54329 and the actual Next.js application on port 3100. They exercise HTTP authentication, real migration/RLS logic, direct uploads and WebSocket events. Fixture authentication, Storage and Realtime are test implementations; passing these tests is not a hosted-service smoke test. Movie/poster samples exist only in the fixture. Playwright uses installed Chrome on Windows, or its Chromium installation elsewhere (`pnpm exec playwright install chromium`). Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to override the executable.

See [verification and remaining setup](docs/verification.md) for the implementation handoff.

## Vercel later

Import the existing repository as a Next.js project. Use Node.js 24, the committed pnpm lockfile, and `pnpm build`. Add only application environment variables, including the preserved PIN secret. Choose the function region nearest the discovered Supabase region in Vercel project settings. Browser connections go directly to Supabase over HTTPS/WebSockets. There are no application-hosted WebSocket servers, persistent processes, or runtime database TCP pools.

Keep preview/test credentials separate from production accounts. Set the production site URL in Supabase when the domain is known. Authenticated responses use `private, no-store`; do not CDN-cache session responses. Actual deployment is a separate step.

Provider references: [resumable Storage uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads), [Storage configuration API](https://supabase.com/docs/reference/api/v1-get-storage-config), and [Auth configuration API](https://supabase.com/docs/reference/api/v1-get-auth-service-config).
