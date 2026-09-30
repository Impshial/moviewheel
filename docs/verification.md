# Implementation verification

## Implemented

- Five-name, six-digit PIN setup/login through Supabase Auth; atomic member binding, current-PIN changes, browser-session cookies, logout and maintenance-only recovery.
- Responsive three-column application with persistent schedule/chat, account settings, avatars/colors/preferences and a centered `/wheel` page.
- OMDb movie search with debounce, stale-request cancellation, pagination, cached details, saved metadata and missing-metadata fallbacks.
- Cards, Card List and single-line List movie views, eight persisted sorts including Recently Added (original added timestamp, newest first), atomic add-and-vote, three distinct duplicate outcomes, own-vote toggles and movie deletion restricted to the original adding member. View and sort preferences follow each member across devices.
- Eastern-time schedule CRUD with multiple hosts/movies, TBD, durable deleted-movie snapshots and clickable details popups.
- Equal-probability local wheel using an eligibility snapshot; no spin writes or post-spin actions. An empty wheel stays visible with Spin disabled.
- Temporary include/exclude checkboxes below the wheel affect only that page visit. Unchecked movies remain available, leaving resets selections, and controls lock during a spin. Excluding every movie keeps the empty wheel and options visible with Spin disabled.
- Local spin audio: a bundled 4.486-second small-group applause recording at the start and synthesized clicks scheduled for every segment crossing using the visual easing curve. Applause retains stereo channels at 44,100 Hz. Audio stops on navigation/page hiding; unsupported audio never prevents a spin. Reduced motion plays applause without artificial ticks. Source credits accompany the bundled clip.
- Persistent chat with history pagination, scroll retention, current profile appearance, multiple-connection presence, transient typing, clickable URLs and image lightboxes. Sender-only deletion clears content and detaches images atomically, with empty retry markers preventing resurrection.
- Profile hover cards in the chat member strip/history, plus a larger avatar preview in widened Account Settings. Requested decorative captions, empty-chat greeting and header period removed.
- Direct browser-to-Storage image selection/paste, queued uploads, configured provider limits, standard/TUS transport, retry and atomic idempotent message publication.
- Versioned SQL for tables, constraints, member seeds, RLS, transactional functions, private buckets and Realtime publication; environment/setup/cleanup scripts and future Vercel Node configuration guidance.

## Local evidence

The local validation commands are in the README. Automated coverage includes:

- 66 unit/PostgreSQL checks passed: PIN strings and cookies, eight sort modes including newest-first added dates and alphabetical ties, persisted view permissions, URL parsing, sender-only deletion/attachment cleanup/retry safety, movie outcomes/votes, original-adder movie deletion, wheel probability/geometry/click timing, DST, image validation/queueing, request origins, collection pagination, shared schedule permissions and avatar replacement/presets. Setup rejects a copied `/rest/v1/` URL before hosted changes.
- 14 browser scenarios: the original nine auth/chat/movie/schedule regressions plus saved movie views; seven sorts and wider settings/avatar preview; empty-wheel rendering; chat profile cards/URLs/sender-only deletion across clients; and mobile schedule details. Twelve passed in the initial run; focused reruns passed the PIN and sorting checks after sorting controls were disabled until initial profile loading completes.
- The movie-deletion permission update passed three focused browser scenarios: all movie views, concurrent duplicate additions with the original adder retaining deletion rights, and owner-only controls plus deletion/error handling. A test locator was corrected to inspect the movie behind the open confirmation dialog; its focused rerun passed. Database checks reject all four other members and unrelated identities, reject forged ownership, and verify cascading votes and retained schedule snapshots.
- The sorting browser scenario passed with all eight options, confirming Recently Added orders by the original added date, survives refresh and appears as the selected preference in Account Settings.
- Three audio browser scenarios passed with real Web Audio buffers: scheduled click count/deceleration, one applause clip per spin and cancellation on navigation; reduced-motion applause with no ticks; and successful spins with unavailable audio. The initial transition-event trigger missed normal-spin audio; starting from the committed transform resolved it and the normal-spin rerun passed.
- The replacement applause passed all three audio browser scenarios, including checks for the full 4.486-second recording, stereo channels and 44,100 Hz decoding. Source analysis found no clipped samples. Its new asset filename avoids reuse of the previous applause recording. Lint and TypeScript checks passed.
- Three wheel-selection browser scenarios passed: exclusions update segments and winners without database mutations; all-excluded recovery and mobile layout; independent tabs, navigation/history/refresh resets with the shared chat draft retained on navigation; and frozen spin entries while a new movie becomes eligible. Test locators and navigation waits were corrected before the focused reruns. The three audio regressions also passed, and desktop/mobile selection screenshots were inspected.
- Lint, TypeScript checking and the production build.
- Desktop, wheel and mobile screenshots inspected. Test screenshots use fixture poster artwork, not live OMDb results.
- Card List, mobile single-line List, chat hover card, large account avatar preview, empty wheel and mobile schedule popup screenshots inspected. The test app uses a separate build directory so the real local app can remain running.
- Chat resizing was checked in Chromium: pointer dragging, arrow/Home/End keys, minimum/maximum widths, viewport clamping, double-click reset, unchanged draft/width through wheel navigation, and the full-width mobile chat panel.

## Hosted setup and remaining verification

The user applied the initial migration successfully. Setup then encountered a copied Data API URL ending in `/rest/v1/`. Correcting only the configured URL to the project origin allowed setup to finish; rerunning the migration step reported the remote database was already up to date. No database reset or user PIN assignment was performed, and no Vercel deployment has been made.

The ignored `.env.local` now has the supplied service configuration. The original PIN secret was preserved. Hosted setup verified five seeded member profiles and configured private `chat-images`, `avatars`, and `avatar-presets` buckets with the project's effective 52,428,800-byte limit (50 MiB). The Supabase project region is `us-east-1`. The setup script now rejects API-path URLs and checks Storage access before applying migrations.

On September 28, the linked project received three tested migrations: expanded sort options (resolving the reported sort constraint error), sender-only chat deletion, and persisted movie views. Existing account identities, PINs and shared content were preserved.

The linked project subsequently received `202609280004_movie_owner_deletion.sql`, restricting the movies DELETE policy to the authenticated original adding member. The dry run confirmed it was the only pending migration, and the CLI reported successful application. This changed permissions without deleting movie data or changing schedule permissions.

The linked project also received `202609280005_recently_added_sort.sql`, allowing the new Recently Added preference while keeping all existing saved preferences valid. The dry run identified only that migration, and application succeeded.

Local automated tests use isolated PGlite and a Supabase protocol fixture. Their concurrency exercises use overlapping HTTP requests against serialized local PostgreSQL transactions; independent-connection races still need verification against the hosted project. Authenticated hosted checks remain: first PIN claims, direct API permissions, session refresh/logout, cross-device Realtime, standard/resumable interrupted uploads, renewed signed URLs and real OMDb search/detail/quota behavior. Preserve the original PIN secret when deploying.

Preset avatar files are pending. Movie posters remain external URLs; upstream availability is not guaranteed. Browser restoration can restore session cookies. Abandoned-upload cleanup needs periodic execution of the maintenance command when the app is in use.
