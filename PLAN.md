# Movie Wheel — approved implementation plan

This plan supplements [the master specification](docs/master-specification.md). The user's revisions take precedence over conflicting original details. Implementation was authorized after the planning stage; production deployment remains a later step.

## Architecture and hosting

- Continue in `Impshial/moviewheel`. Next.js App Router, React, TypeScript and responsive CSS; prepare for Vercel using a supported Node.js runtime (Node 24). Authentication and OMDb use Node routes. No Edge Function is required.
- Authenticated browsers access Supabase PostgreSQL APIs, Realtime and Storage directly. Use transactional database functions for atomic shared operations. No permanent application server, runtime files or process memory holds shared content or sessions.
- Separate authentication, domain logic, database clients, movie search, movies/votes, schedule, wheel, chat/uploads, account settings and reusable UI.
- All schedule input/display uses `America/New_York`, with a visible timezone label and DST-aware conversion to/from `timestamptz`. Reject nonexistent spring-forward times; consistently select and label the earlier repeated fall-back time.

## Lightweight authentication and sessions

- The unauthenticated screen contains only “Who are you?” and Abby, Darren, Elisabeth, Hannah and Paul in alphabetical order. No movie, chat or schedule content is rendered before login.
- Selecting an unclaimed name opens masked Create PIN/Confirm PIN controls. The first successful atomic claim enters immediately. A competing claim cannot overwrite it. Configured names open masked PIN, Enter and Back controls. PINs are exactly six numeric characters, preserve leading zeroes and use a mobile numeric keyboard.
- Server routes derive an internal password using an HMAC and a fixed hidden identifier; Supabase Auth performs verification and stores password hashes. An Auth trigger atomically binds each account to its seeded member. There is no public registration or second authentication service. No custom login/IP throttling, failed-attempt table, artificial delay, lockout, CAPTCHA or MFA is added.
- Generate `PIN_AUTH_SECRET` once with the setup script, keep it server-only, and preserve it across deployments using the same accounts. Never log credentials or store plaintext PINs.
- **Session mechanism:** Supabase access/refresh tokens in browser-session cookies, with `SameSite=Lax`, HTTPS `Secure` in production, and no persistent `Expires`/`Max-Age`. Cookies are available to the browser Supabase client for direct authenticated APIs; tokens are not stored in localStorage. Refresh/navigation keep the session. Browsers may restore session cookies when restoring a previous session; reliable browser-close detection is not promised.
- Log Out revokes the current Supabase session, clears its cookies and local user state, removes subscriptions and returns to Who are you. Shared content stays intact. Change PIN requires current PIN and matching new entries. Recovery remains a maintenance script.

## Schema, permissions and durable media

- Seed exactly five profiles with distinct readable chat colors. Store profiles/settings, avatar options, movies, unique `(movie_id,user_id)` votes, movie nights/hosts/movie snapshots, chat messages/attachments and upload staging records in PostgreSQL.
- RLS recognizes only Auth identities bound to those five members. All members may add/delete any movie and add/edit/delete any schedule entry, regardless of creator. Only owners may change their votes, PIN, avatar, color and preferences. Authors/owners derive from `auth.uid()`, never a client-selected identity.
- Use private `chat-images`, `avatars` and `avatar-presets` Storage buckets. All five members may view shared images/avatars; only the authenticated owner may upload to their registered object path. Preset files can be supplied later, with initials until then.
- Store permanent bucket/path and MIME/size/dimension metadata, never just a signed/blob URL. Renew viewing URLs on later sessions and expiry. Replace avatars using new object names so connected clients avoid stale cached files. Current profiles determine appearance in historical messages.
- Save movie metadata and OMDb poster URLs. **Posters remain externally hosted; they are not archived in Storage.** Upstream poster loss is a real limitation, handled with a fallback. Schedule snapshots preserve understandable movie title/year/poster URL after deletion.
- Sorting, selected avatar and chat-name color follow the user across devices. Presence, typing, wheel animation and spin results are transient.

## Movies, OMDb and schedule

- The homepage contains every movie in a responsive poster grid, fetching beyond API page limits. Each card has title/year/adder/vote count, vote toggle, eligibility and deletion with confirmation. Movie details remain available.
- Persist all four sorting modes: Most Votes, Alphabetical, By Year (unknown last), My Votes.
- Debounce OMDb search, cancel stale results, paginate and request only movie results. Cache search/detail enrichment in Supabase and save normalized metadata. Respect the configured free-key daily allowance. Missing director/poster information uses a fallback and does not block valid movies.
- `add_movie` serializes by IMDb ID and atomically creates a new movie plus the adding member's vote. Return distinct visible outcomes: new movie added; existing movie and vote added; existing movie and already voted. Unique constraints prevent duplicates under concurrency.
- Each member may vote for multiple movies, once per movie, and remove only their own vote. Deleting a movie cascades votes and preserves schedule snapshots.
- Schedule dialogs support title, Eastern date/time, one or more hosts and zero/multiple selected movies; no selected movie displays TBD. Any member can edit/delete any entry. Realtime refreshes shared changes.

## Wheel and shared navigation

- `/wheel` occupies the central page within the persistent layout, with schedule left and chat right. Navigation preserves the chat text, selected/uploading images, scroll position and subscriptions. Mobile panels stay mounted.
- Show one equal-size colorful segment per movie with at least two votes, a pale rim, radial labels, fixed pointer and center Spin control. Votes never weight the probability.
- Capture eligibility at spin start; select with unbiased browser randomness and animate to the exact corresponding segment. Finish against the snapshot, then apply subsequent collection changes. Support zero/one eligible movie and reduced motion.
- Spins create no database/history records, notifications, synchronized animation, scheduling, deletion or watched-state changes. Display the local selected movie with no post-spin actions.

## Chat, uploads and transient signals

- White background, compact continuous messages, circular avatars and readable colored names; no speech bubbles. Load the latest 100 messages with older pagination, stable ordering, reconnect catch-up and duplicate suppression. Preserve upward scroll and show a new-message indicator instead of forcing scrolling.
- Aggregate Presence connections by authenticated member across tabs/devices. Closing one connection leaves the member online if another survives. Realtime expires disconnected connections; stale typing metadata also expires locally.
- Typing shows only other users. Send changes/occasional activity updates, animate `.`, `..`, `...` locally and clear on inactivity, send, blur, logout or disconnect.
- Accept computer file selection and clipboard paste; text-only, image-only and mixed messages with multiple JPEG/PNG/WebP/GIF images. **No fixed application attachment-count cap and no arbitrary 5 MB cap.** Use a two-worker queue; keep every selected item visible/removable with useful errors and retry.
- **Upload architecture:** image bytes go directly browser → authenticated Supabase Storage. Use standard uploads for small images and resumable TUS for larger/interrupted uploads according to provider guidance. Vercel routes carry authorization/configuration/cleanup metadata, not image payloads. Inspect actual project/bucket constraints during setup and align validation with them.
- Finish all required uploads before a transactional RPC publishes message + attachment records together. Retain the draft on failure. Stable per-submission IDs prevent duplicate messages on retries, including a lost success response.
- Registered staging objects and transaction locks separate pending/attached/deleting states. Cleanup claims only abandoned, unreferenced uploads; it cannot remove committed message files. Active drafts renew their lease. A bounded maintenance command removes abandoned objects through the Storage API.

## Acceptance checks

- First claim, configured login, incorrect PIN, leading zeroes, numeric validation, refresh, logout/current-session behavior and Change PIN; simultaneous claims leave exactly one successful account/password.
- Another member can delete the creator's movie or edit the creator's schedule, while cross-member votes/settings/PIN changes fail. Unrelated authenticated accounts cannot access shared content.
- Concurrent duplicate movie additions yield one movie and exactly the expected votes and notification for each request. Verify all four sorts and persisted preferences.
- More than four images and an image larger than 5 MB succeed when the provider limits allow; unsupported formats/provider oversize produce clear errors. Verify paste, image-only/mixed messages, failed upload, safe retry after ambiguous finalization, refreshed old media URLs and new-device reads.
- Multiple-tab presence, disconnect/typing cleanup, current avatar/color in older messages, pagination/scroll behavior and uninterrupted chat state across wheel navigation.
- At least two votes controls eligibility, including a drop to one; one entry per movie and equal probability; selected movie matches final pointer; zero spin-related database writes.
- Run lint, typecheck, meaningful unit/PostgreSQL/browser tests and production build; inspect desktop/mobile views. Distinguish isolated fixture tests from hosted Supabase/OMDb integration checks.

## Configuration still required before live verification

Provide the existing Supabase URL, public/publishable key, server-only secret/service-role key and OMDb key in the ignored `.env.local`. Automated project setup additionally uses the Supabase management access token and database password. Inspect the existing project before applying the migration; the implementation contains the migration, not proof that hosted schema/buckets exist.

The actual project region, Storage limits/quota, account/session settings and live Auth/Realtime/TUS behavior require inspection with those credentials. Preset avatar files are pending. Preserve the generated PIN secret. Actual Vercel deployment/domain configuration remains a later step.
