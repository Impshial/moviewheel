# Implementation verification

## Implemented

- Five-name, six-digit PIN setup/login through Supabase Auth; atomic member binding, current-PIN changes, browser-session cookies, logout and maintenance-only recovery.
- Responsive three-column application with persistent schedule/chat, account settings, avatars/colors/preferences and a centered `/wheel` page.
- OMDb movie search with debounce, stale-request cancellation, pagination, cached details, saved metadata and missing-metadata fallbacks.
- Shared movie grid, four persisted sorts, atomic add-and-vote, three distinct duplicate outcomes, own-vote toggles and shared deletion.
- Eastern-time schedule CRUD with multiple hosts/movies, TBD and durable deleted-movie snapshots.
- Equal-probability local wheel using an eligibility snapshot; no spin writes or post-spin actions.
- Persistent chat with history pagination, scroll retention, current profile appearance, multiple-connection presence, transient typing and image lightboxes.
- Direct browser-to-Storage image selection/paste, queued uploads, configured provider limits, standard/TUS transport, retry and atomic idempotent message publication.
- Versioned SQL for tables, constraints, member seeds, RLS, transactional functions, private buckets and Realtime publication; environment/setup/cleanup scripts and future Vercel Node configuration guidance.

## Local evidence

The local validation commands are in the README. Automated coverage includes:

- 36 unit/PostgreSQL checks: PIN strings and cookies, movie outcomes/sorts/votes, wheel probability/geometry, DST, image validation/queueing, public-host request-origin checks, complete collection pagination, shared permissions, upload ownership/finalization/cleanup and avatar replacement/presets. A subsequent setup regression check also verifies that a copied `/rest/v1/` URL is rejected before hosted changes.
- 9 browser scenarios: competing first claims; clipboard upload failure and lost-response retry; concurrent movie additions and live vote thresholds; PIN setup/login/change/logout/refresh; wheel/chat preservation with no spin mutations; six images with one over 5 MB and URL renewal; multi-user presence/typing and current avatars/colors/settings across sessions; old-chat pagination/scroll retention; mobile schedule/navigation.
- Lint, TypeScript checking and the production build.
- Desktop, wheel and mobile screenshots inspected. Test screenshots use fixture poster artwork, not live OMDb results.
- Chat resizing was checked in Chromium: pointer dragging, arrow/Home/End keys, minimum/maximum widths, viewport clamping, double-click reset, unchanged draft/width through wheel navigation, and the full-width mobile chat panel.

## Hosted setup and remaining verification

The user applied the initial migration successfully. Setup then encountered a copied Data API URL ending in `/rest/v1/`. Correcting only the configured URL to the project origin allowed setup to finish; rerunning the migration step reported the remote database was already up to date. No database reset or user PIN assignment was performed, and no Vercel deployment has been made.

The ignored `.env.local` now has the supplied service configuration. The original PIN secret was preserved. Hosted setup verified five seeded member profiles and configured private `chat-images`, `avatars`, and `avatar-presets` buckets with the project's effective 52,428,800-byte limit (50 MiB). The Supabase project region is `us-east-1`. The setup script now rejects API-path URLs and checks Storage access before applying migrations.

Local automated tests use isolated PGlite and a Supabase protocol fixture. Their concurrency exercises use overlapping HTTP requests against serialized local PostgreSQL transactions; independent-connection races still need verification against the hosted project. Authenticated hosted checks remain: first PIN claims, direct API permissions, session refresh/logout, cross-device Realtime, standard/resumable interrupted uploads, renewed signed URLs and real OMDb search/detail/quota behavior. Preserve the original PIN secret when deploying.

Preset avatar files are pending. Movie posters remain external URLs; upstream availability is not guaranteed. Browser restoration can restore session cookies. Abandoned-upload cleanup needs periodic execution of the maintenance command when the app is in use.
