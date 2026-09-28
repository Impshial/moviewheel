# MOVIE WHEEL

> Approved update (September 28, 2026): movies qualify for the wheel with **two or more votes** and become ineligible below two. This supersedes the original three-vote threshold in the specification preserved below.

> Further approved updates: seven sort options and three saved movie views; sender-only chat deletion; clickable chat URLs; avatar profile cards in chat and Account Settings; wider settings and schedule details popups; a disabled empty wheel; and the requested header/caption removals. Current behavior is detailed in PLAN.md. These changes supersede conflicting details in the original specification below.

Build a polished multi-user web application called **Movie Wheel**.

This application is for exactly five people who use it from different physical locations.

It combines:

- A shared movie collection
- Movie voting
- A random movie wheel
- A shared Movie Night schedule
- Real-time group chat
- User accounts with 6-digit PINs
- User avatars
- Persistent user preferences

The application uses **Supabase** as its backend and persistent source of truth.

I will provide the Supabase project configuration and credentials.

Do NOT add GitHub setup or Vercel deployment work.

---

# Core Technology

Use:

- Next.js with App Router
- React
- TypeScript
- Supabase PostgreSQL
- Supabase Auth where appropriate
- Supabase Realtime
- Supabase Storage
- Modern responsive CSS

Keep the architecture clean and maintainable.

Do not create one enormous React component.

Separate:

- UI
- Domain models
- Database access
- Authentication
- Realtime
- Storage
- Movie logic
- Voting
- Schedule logic
- Chat
- User preferences

---

# Persistence Rule

All durable application data must be stored in Supabase.

Do NOT use localStorage as the authoritative source for application content or settings.

Persist things such as:

- Users
- Authentication identity
- User settings
- PIN/account configuration
- Avatar selections
- Uploaded avatars
- Chat name colors
- Movie collection
- Movie metadata
- Movie votes
- Schedule entries
- Schedule hosts
- Scheduled movies
- Chat messages
- Chat image attachments
- Uploaded chat images
- Relevant user preferences
- Last-seen timestamps

Uploaded files should use **Supabase Storage**, with their metadata and ownership recorded in PostgreSQL.

Transient Realtime signals such as:

- Currently online
- Currently typing

should use Supabase Realtime Presence/Broadcast rather than generating permanent database records for every state change.

Store `last_seen_at` for users so durable information about their last activity exists.

---

# USERS

There are exactly five users:

- Abby
- Darren
- Elisabeth
- Hannah
- Paul

There is no public registration.

There is no guest mode.

Users cannot create additional accounts.

The application must always display these five names in alphabetical order where user selection is required.

---

# LOGIN SCREEN

When the application loads without an authenticated session, display only:

# Who are you?

Underneath, show five large user buttons:

**Abby**

**Darren**

**Elisabeth**

**Hannah**

**Paul**

Do not initially show:

- Username box
- Email address
- Password box
- Registration
- Guest access
- Other user

The user first selects their name.

---

# FIRST-TIME PIN SETUP

Each user creates a personal **6-digit numeric PIN** the first time they log in.

If the selected user has never created a PIN, display:

# Hi, Paul!

**Create your 6-digit PIN**

Fields:

**PIN**

**Confirm PIN**

Requirements:

- Exactly six digits
- Numeric only
- Mask the entered value
- Bring up the numeric keyboard on mobile
- Both PIN entries must match

Button:

**Set PIN**

After the PIN is successfully created:

1. Store it securely through the chosen authentication architecture.
2. Never store a plaintext PIN.
3. Authenticate the user.
4. Enter the main application.

Do not make them re-enter the PIN immediately after setup.

---

# RETURNING LOGIN

After clicking a user who already has a PIN:

# Hi, Paul!

**Enter your PIN**

Show a six-digit PIN field.

Buttons:

**Enter**

**Back**

Back returns to the Who Are You page.

A correct PIN logs the user in.

An incorrect PIN displays:

**Incorrect PIN. Try again.**

Do not expose PIN hashes or authentication secrets to browser code.

---

# LOGIN SESSION

Once logged in:

- Refreshing the browser should keep the current session active.
- The user's PIN should not remain in UI state after authentication.
- Closing the browser session may require login again next time.
- The authenticated user's stable UUID is their identity throughout the application.

Use an appropriate secure session architecture.

Prefer Supabase Auth underneath the simplified name/PIN UI if practical.

The user should never see email-based authentication UI.

---

# USER MENU

At the upper-right of the application display the user's circular avatar.

Clicking it opens:

**Paul**

**Account Settings**

separator

**Log Out**

The logged-in name is informational.

Log Out ends the session and returns to:

**Who are you?**

---

# ACCOUNT SETTINGS

Account Settings opens a modal.

It should support:

## Change PIN

Require:

- Current PIN
- New 6-digit PIN
- Confirm new PIN

## Avatar

All avatars are displayed in circles.

Users may:

- Choose from a predefined avatar library
- Upload their own image

I will provide the predefined avatar images later.

Build the system so those avatar choices can be added without redesigning the account system.

Uploaded avatar images should:

- Be stored in Supabase Storage
- Be associated with the user's account
- Be displayed cropped appropriately inside a circle

Allow replacing the user's current avatar.

## Chat Name Color

Allow the user to choose the color used for their name in chat.

Save this color to their account settings in Supabase.

Each user should initially have a different default chat-name color.

Ensure chosen colors remain readable against the white chat background.

---

# MAIN APPLICATION LAYOUT

Desktop layout consists of three main columns.

## LEFT

Schedule

## CENTER

Current Movie List

## RIGHT

Live Chat

The header remains across the top.

Approximate layout:

```text
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [LOGO] MOVIE WHEEL                [Add a Movie] [Spin the Wheel] [Avatar ▼]     │
├───────────────────────┬───────────────────────────────────────┬──────────────────┤
│ SCHEDULE              │ MOVIES TO WATCH                       │ CHAT             │
│ [+ Add Entry]         │                                       │                  │
│                       │ Movie poster grid                     │ Live messages    │
│ Schedule entries      │                                       │                  │
│                       │                                       │                  │
│                       │                                       │                  │
│                       │                                       │                  │
│                       │                                       │ [Message input]  │
└───────────────────────┴───────────────────────────────────────┴──────────────────┘
```

The center should receive the largest portion of the screen.

---

# HEADER

Left side:

- Application logo
- Title: **Movie Wheel**

Right side:

**Add a Movie**

**Spin the Wheel**

**Current user's circular avatar**

The header should remain clean and compact.

---

# SCHEDULE

The left column contains a shared schedule.

At the top:

# Schedule

**Add Entry**

Any logged-in user may:

- Add schedule entries
- Edit schedule entries
- Delete schedule entries

There are no administrator-only schedule controls.

---

# SCHEDULE ENTRY DISPLAY

Typical entry:

**Movie Night!**

**Monday, Oct 5th**

**Time: 7:30 PM**

**Host: Elisabeth**

**Movie(s):**

- Inception
- Arrival

Then a separator.

Another example:

**Movie Night!**

**Thursday, October 15th**

**Time: 7:00 PM**

**Host: Hannah / Darren**

**Movie(s):**

- TBD

Every schedule entry should include visible controls for:

**Edit**

**Delete**

Keep these controls compact.

---

# ADD SCHEDULE ENTRY

Clicking **Add Entry** opens a modal.

Fields:

## Title

Default:

**Movie Night!**

## Date

Date picker.

## Time

Time picker.

## Hosts

Allow one or more of the five users:

- Abby
- Darren
- Elisabeth
- Hannah
- Paul

## Movies

Allow movies from the shared movie database to be associated with the schedule entry.

More than one movie may be attached.

Movies are optional.

If no movie is selected, display:

**TBD**

Buttons:

**Cancel**

**Add Entry**

---

# EDIT SCHEDULE ENTRY

Clicking Edit opens the same form populated with the current values.

Allow changing:

- Title
- Date
- Time
- Hosts
- Movies

Buttons:

**Cancel**

**Save Changes**

Changes must synchronize to other connected users through Realtime.

---

# DELETE SCHEDULE ENTRY

Clicking Delete asks for confirmation.

Example:

**Delete Schedule Entry?**

**Movie Night!**

**Monday, October 5th at 7:30 PM**

Buttons:

**Cancel**

**Delete**

Any logged-in user may delete any schedule entry.

Deleting a schedule entry must not delete movies from the main movie collection.

---

# SCHEDULE DATABASE DESIGN

Use normalized relational data.

Suggested tables:

`movie_nights`

Fields should include:

- id
- title
- scheduled_date
- scheduled_time
- created_by_user_id
- created_at
- updated_at

`movie_night_hosts`

- movie_night_id
- user_id

`movie_night_movies`

- id
- movie_night_id
- movie_id nullable
- movie_title_snapshot
- movie_year_snapshot
- movie_poster_snapshot
- created_at

Use movie snapshots so that deleting a movie from the active movie collection does not make an old or future schedule entry meaningless.

If the corresponding movie is deleted, preserve the schedule entry's title/year/poster snapshot.

---

# CENTER MOVIE LIST

The center of the normal homepage displays the current shared movie collection.

Heading:

# Movies to Watch

Also show the total number of movies.

Movies should appear in a responsive poster grid.

Each movie card should normally show:

- Poster
- Title
- Release year
- Who added it
- Vote control
- Vote count
- Wheel eligibility status

Example:

```text
┌────────────────────┐
│                    │
│       POSTER       │
│                    │
└────────────────────┘

The Thing
1982
Added by Darren

♥ Voted     4 votes
On Wheel
```

---

# MOVIE CARD DELETE

Any logged-in user may delete any movie.

On desktop:

Show a small Delete/trash control when hovering over the movie poster.

Do not permanently clutter the card with the delete control.

On touch devices:

Make the Delete control accessible without hover.

Clicking Delete asks:

**Remove Movie?**

**Remove "The Thing" from Movies to Watch?**

**Its votes will also be removed.**

Buttons:

**Cancel**

**Delete**

Deleting a movie removes:

- The movie from the active list
- All votes for that movie
- Its eligibility for the wheel

It must not destroy schedule snapshots.

---

# MOVIE DETAILS

Clicking the body of a movie card should open a movie details modal.

Show stored metadata such as:

- Poster
- Title
- Year
- Director
- Runtime
- Genre
- Rating
- Plot/overview
- IMDb ID
- Who added the movie
- Vote count

Do not trigger movie deletion when the card itself is clicked.

---

# ADD A MOVIE

Clicking the header button:

**Add a Movie**

opens a large modal.

At the top:

# Add a Movie

Label:

**Enter Movie Title**

Text input underneath.

Typing in this field queries **OMDb**.

Use a debounce so the API is not called on every individual keystroke immediately.

A reasonable delay is approximately 300 to 500 ms.

Do not search on an empty string.

Handle stale/out-of-order API responses correctly.

---

# OMDB API SECURITY

The OMDb API key must not be hardcoded into browser code.

Use a server-side environment variable.

Proxy OMDb calls through an appropriate Next.js server route/action.

Do not expose private API configuration in the repository or browser bundle.

---

# OMDB SEARCH RESULTS

Search results appear underneath the search box.

Each result should show:

- Poster
- Title
- Year
- Director

OMDb's normal search endpoint may not return the Director field.

If necessary, fetch details for displayed results using their IMDb IDs.

Avoid excessive duplicate API requests.

Cancel or ignore stale searches when the user continues typing.

---

# MOVIE SELECTION

Clicking a search result loads the selected movie into a larger movie-detail container.

Show:

- Poster
- Title
- Year
- Director
- Runtime
- Genre
- Rated
- Plot
- Other useful OMDb metadata

At the bottom:

**Add to Movie List**

---

# ADDING A MOVIE AUTOMATICALLY CASTS A VOTE

This is an important rule.

When a user successfully adds a movie to the shared list, that user automatically casts their vote for that movie.

Example:

Paul adds **Alien**.

The database should atomically:

1. Add Alien to the movie collection.
2. Add Paul's vote for Alien.

The movie therefore begins with:

**1 vote**

Do not require Paul to click Vote separately after adding it.

---

# DUPLICATE MOVIES AND USER NOTIFICATION

Use the IMDb ID from OMDb as the primary external movie identity.

Add a unique constraint preventing multiple active movie records with the same IMDb ID.

If a user attempts to add a movie that already exists, do NOT silently create a duplicate and do NOT silently change their vote state.

The user must receive a clear notification explaining exactly what happened.

## Existing movie, current user has NOT voted for it

If the movie is already in the shared list and the current user has not voted for it:

1. Do not create a second movie record.
2. Add the current user's vote to the existing movie.
3. Show a visible success notification such as:

**"Alien is already in the movie list. Your vote has been added."**

The notification should remain visible long enough to read and should not require the user to guess what happened.

## Existing movie, current user HAS already voted for it

If the movie is already in the shared list and the current user already voted for it:

1. Do not create another movie record.
2. Do not create another vote.
3. Show a visible informational notification such as:

**"Alien is already in the movie list, and you've already voted for it."**

Do not treat this as an application error.

## New movie

If the movie does not already exist:

1. Add the movie.
2. Automatically add the current user's vote.
3. Show a normal success notification such as:

**"Alien was added to the movie list. Your vote was added automatically."**

Use a toast, banner, or equivalent notification system that is visually obvious but does not unnecessarily interrupt the workflow.

The duplicate check and add-movie/add-vote operation should be atomic where practical so simultaneous users cannot create duplicate movie records or duplicate votes.

---

# MOVIE DATABASE

Suggested `movies` fields:

- id UUID
- imdb_id unique
- title
- release_year
- poster_url
- director
- runtime_minutes
- genre
- rated
- plot
- imdb_rating if available
- raw_metadata JSONB if useful
- added_by_user_id
- created_at
- updated_at

Persist the useful OMDb movie metadata when the movie is added.

Do not require OMDb to be called every time the homepage renders.

---

# MOVIE VOTING

Every user may vote for more than one movie.

A user can have only one vote per movie.

There are no downvotes.

Clicking:

**Vote**

casts the user's vote.

It becomes:

**Voted**

Clicking **Voted** again removes the vote.

No confirmation is required.

---

# MOVIE VOTES DATABASE

Create:

`movie_votes`

Suggested fields:

- id
- movie_id
- user_id
- created_at

Add a unique constraint on:

`movie_id + user_id`

This ensures one vote per user per movie.

Deleting a movie should cascade-delete its votes.

---

# VOTE DISPLAY

Every movie card must display:

- Total vote count
- Whether the current user voted
- Whether it currently qualifies for the wheel

Examples:

**♡ Vote   0 votes   Not on Wheel**

**♥ Voted   2 votes   Needs 1 more vote**

**♥ Voted   3 votes   On Wheel**

Since there are five users, display vote counts naturally as values from 0 through 5.

---

# WHEEL ELIGIBILITY

A movie must have **at least 3 votes** to appear on the wheel.

The threshold is:

`3 votes`

Movies with:

- 0 votes: not eligible
- 1 vote: not eligible
- 2 votes: not eligible
- 3 votes: eligible
- 4 votes: eligible
- 5 votes: eligible

If the third vote is added, the movie immediately becomes eligible.

If votes drop from 3 to 2, the movie immediately becomes ineligible.

Use Realtime so connected clients see this state update.

---

# VOTE COUNT DOES NOT WEIGHT THE WHEEL

Votes determine eligibility only.

Once a movie reaches the three-vote threshold, every eligible movie has an equal probability of winning.

Example:

Alien: 5 votes  
Arrival: 3 votes  
The Thing: 4 votes

Each movie receives exactly one wheel segment.

Each has a 1-in-3 chance of being selected.

Do not make a five-vote movie more likely to win than a three-vote movie.

---

# MOVIE LIST SORTING

At the top of Movies to Watch, provide:

**Sort**

Options:

- Most Votes
- Alphabetical
- By Year
- My Votes

Default:

**Most Votes**

Save the current user's preferred sort mode to their user settings in Supabase.

This preference should follow them when they log in from another device.

---

# MOST VOTES SORT

Highest vote count first.

Tie breaker:

Alphabetical by title.

---

# ALPHABETICAL SORT

Sort A-Z by movie title.

---

# BY YEAR SORT

Sort newest to oldest.

Movies with an unknown year should appear last.

---

# MY VOTES SORT

Movies the current logged-in user has personally voted for appear first.

Within the user's voted group:

1. Total votes descending
2. Alphabetical title

Remaining movies follow afterward.

---

# SPIN THE WHEEL BUTTON

The header contains:

**Spin the Wheel**

Clicking it opens the spinner in the center workspace.

The schedule remains on the left.

The chat remains on the right.

The spinner replaces the normal movie grid until closed.

Provide a clear way to return to Movies to Watch.

---

# WHEEL VISUAL DESIGN

The spinner should resemble a traditional colorful segmented prize wheel.

Design direction:

- Large circular wheel
- Equal-size wedges
- One movie title per wedge
- Alternating/distinct segment colors
- Fixed pointer outside the wheel
- Large central **SPIN** button
- Smooth acceleration
- Multiple rotations
- Smooth deceleration
- Precise final landing position
- Dark or neutral surrounding interface so the wheel stands out

If a visual wheel reference image is supplied, use it as visual direction.

Do not blindly copy branding or text from another application.

---

# WHEEL CONTENT

The wheel contains only movies with:

`vote_count >= 3`

Every eligible movie appears once.

The wheel should be created from the current shared movie state when opened.

---

# WHEEL SPIN LOGIC

When SPIN is pressed:

1. Capture a snapshot of currently eligible movies.
2. Randomly select one of those movies.
3. Calculate the exact target wheel rotation.
4. Animate several full rotations.
5. Decelerate.
6. Stop with the selected movie under the pointer.

The calculated winner and visual result must always match.

Use secure browser randomness such as:

`crypto.getRandomValues()`

where practical.

---

# SPINNING DOES NOTHING ELSE

This rule is important.

Spinning the wheel does **not** modify any shared data.

It does NOT:

- Delete the winner
- Mark it watched
- Add it to the schedule
- Modify votes
- Record a spin history
- Remove it from the wheel
- Notify other clients
- Start a shared synchronized spin

The wheel simply spins and displays the selected movie.

The selected movie remains in the movie list afterward.

The user can spin again.

---

# WHEEL IS LOCAL

Opening or spinning the wheel is a local UI action.

If Paul opens and spins the wheel:

- Abby's screen does not automatically open the spinner.
- Hannah's wheel does not start spinning.
- No shared database record is created.

Shared movie additions, deletions, and votes still affect future spins.

---

# WHEEL EDGE CASES

If zero movies have at least three votes:

Do not show a meaningless empty wheel.

Display:

**No movies have enough votes yet.**

**A movie needs at least 3 votes to appear on the wheel.**

If exactly one movie qualifies, allow the wheel to work gracefully even though that movie will necessarily win.

During an active spin, use the captured movie snapshot even if Realtime changes arrive.

Apply visual collection updates after the animation completes.

---

# CHAT SIDEBAR

The right side of the application is a persistent live chat.

It should visually resemble the compact flow of a standard Twitch-style chat stream, but do not copy Twitch branding.

The chat background should be **white**.

There are **no chat bubbles**.

Messages should form a continuous vertical stream.

---

# CHAT MESSAGE APPEARANCE

A chat line contains:

- Small circular user avatar
- Online status indicator where appropriate
- Colored username
- Message text

Example:

```text
(avatar) ● Abby: Has anyone watched this?
(avatar) ● Paul: Nope.
(avatar)   Hannah: I added it yesterday.
```

Usernames use each person's configured chat-name color.

Message text should remain highly readable and mostly neutral/dark against the white background.

Do not put individual messages inside cards or speech bubbles.

---

# CHAT AVATARS

Show a small circular avatar beside every chat message.

Use the user's current avatar.

Changing an avatar should affect subsequent rendering of that user's chat identity throughout the app.

Historical messages should reference the user record rather than permanently storing an old avatar URL into each text message.

---

# ONLINE STATUS

The system should know which users currently have the application open and authenticated.

Use Supabase Realtime Presence.

If a user is currently online, display a small **green dot** beside their identity in chat.

The dot should update as users connect and disconnect.

Store `last_seen_at` durably in the database.

Do not rely on a permanently stored `online = true` flag that can become stale after a browser crash.

---

# TYPING INDICATOR

When someone is actively typing in chat, show an indicator underneath the message stream.

Example:

**Abby.**

then:

**Abby..**

then:

**Abby...**

then repeat.

The animation should continue while Abby is typing.

Use Realtime Broadcast or Presence metadata for typing state.

Typing should automatically clear shortly after the user stops typing, loses focus, sends the message, disconnects, or closes the chat.

If multiple people are typing, support a sensible compact display.

Examples:

**Abby and Paul...**

or:

**Abby, Paul...**

Do not save thousands of historical typing-state events to PostgreSQL.

---

# CHAT INPUT

At the bottom of chat, keep a fixed message input area.

Include:

- Message text box
- Image attachment control if useful
- Send button

Pressing Enter sends the message.

If the field is multiline:

Shift + Enter inserts a newline.

After a successful send:

- Clear the composer
- Keep focus in the input
- Allow another message immediately

Do not allow whitespace-only text messages.

---

# CHAT HISTORY

All actual chat messages must persist in Supabase.

When chat opens, load approximately the latest 100 messages.

Display them in chronological order.

Do not load the entire history at once.

Architect older-message pagination so scrolling upward can retrieve earlier history.

---

# CHAT AUTOSCROLL

If the user is currently near the bottom of the message list:

Automatically scroll when a new message arrives.

If the user intentionally scrolled upward:

Do not force them back to the bottom.

Instead display:

**New messages ↓**

Clicking it scrolls to the newest message.

---

# CHAT IMAGES

Users can add images to chat in two ways:

## File upload

Choose an image from the computer.

## Clipboard paste

If the user copies an image and pastes it into the chat composer, detect the pasted image and prepare it as a chat attachment.

Support a message containing:

- Text only
- Image only
- Text and one or more images

Store uploaded image files in Supabase Storage.

Store attachment metadata in PostgreSQL.

Do not store large image binaries directly in normal database text fields.

---

# CHAT IMAGE DISPLAY

Images in the chat stream should appear as compact thumbnails.

They should not expand to full resolution inside the message stream.

Clicking a thumbnail opens a modal/lightbox showing the larger image.

The popup should:

- Center the image
- Fit within the viewport
- Maintain aspect ratio
- Provide an obvious close button
- Close with Escape
- Optionally close by clicking outside the image

---

# CHAT IMAGE STORAGE

Use a dedicated Supabase Storage bucket for chat uploads.

Record metadata such as:

- attachment ID
- message ID
- storage path
- MIME type
- width/height if available
- file size
- uploaded_by_user_id
- created_at

Use unique generated object names.

Do not depend on original file names for identity.

---

# CHAT DATABASE

Suggested `chat_messages` table:

- id
- user_id
- message_text nullable
- created_at
- updated_at if editing is ever added

A message is valid if it contains either:

- Text
- At least one image

Create:

`chat_attachments`

Fields:

- id
- message_id
- uploaded_by_user_id
- storage_path
- mime_type
- file_size
- width
- height
- created_at

---

# CHAT REALTIME

Use Supabase Realtime so connected users receive new chat messages immediately.

Also use Realtime for:

- Online presence
- Typing state

Do not poll the database unnecessarily.

Clean up subscriptions correctly.

Avoid duplicate listeners when React components remount.

Handle reconnects gracefully.

---

# USER PROFILE DATA

Create a durable user profile/settings system.

Suggested profile fields:

- id
- display_name
- auth_user_id where applicable
- avatar_type
- avatar_reference
- chat_name_color
- preferred_movie_sort
- last_seen_at
- created_at
- updated_at

Keep sensitive authentication credential information separate from normal profile data where appropriate.

---

# AVATAR LIBRARY

Prepare for a predefined avatar library.

I will provide the avatar images later.

Create an architecture such as:

`avatar_options`

with fields like:

- id
- name
- storage_path
- enabled
- sort_order

Users may select one of these avatars.

Also support custom uploaded avatars.

---

# REALTIME MOVIE SYNCHRONIZATION

Changes to movies and votes should appear for all connected users automatically.

Realtime changes include:

- New movie
- Deleted movie
- New vote
- Removed vote
- Updated movie metadata if editing is later supported

If Paul adds a movie, everyone else's movie grid should update.

If Hannah casts the third vote, everyone should see that movie become:

**On Wheel**

without refreshing.

---

# REALTIME SCHEDULE SYNCHRONIZATION

Connected users should see:

- New schedule entries
- Edited schedule entries
- Deleted schedule entries

without refreshing.

---

# PERMISSIONS

All five logged-in users have equal application permissions.

Any logged-in user can:

- Add a movie
- Delete any movie
- Vote for any movie
- Remove their own vote
- Add schedule entries
- Edit any schedule entry
- Delete any schedule entry
- Send chat messages
- Upload chat images
- Spin the wheel
- Change their own account settings

Users should only be able to change:

- Their own PIN
- Their own avatar
- Their own chat-name color
- Their own settings

There is no administrator UI in this version.

---

# DATABASE DESIGN

Use proper relationships, constraints, indexes, and foreign keys.

Likely tables include:

- user_profiles
- avatar_options
- movies
- movie_votes
- movie_nights
- movie_night_hosts
- movie_night_movies
- chat_messages
- chat_attachments

Also use Supabase Auth or suitable server-side authentication/session structures.

Create migrations for everything.

Do not rely on manually clicking around in Supabase as the only way to reproduce the schema.

---

# ROW LEVEL SECURITY

Enable and intentionally configure Supabase Row Level Security where appropriate.

Use authenticated identity to protect user-specific settings.

Do not expose service-role credentials to the browser.

Never use the service-role key from client-side React code.

Document the policies created.

---

# ERROR HANDLING

Handle failures clearly.

Examples:

- Supabase unavailable
- Movie failed to add
- Vote failed
- Movie failed to delete
- Schedule failed to save
- Chat failed to send
- Image failed to upload
- Avatar failed to upload
- OMDb search failed
- Realtime disconnected

Do not silently pretend an operation succeeded.

Display useful but concise errors.

---

# RESPONSIVE DESIGN

Desktop is the primary design.

Also support tablets and phones.

On narrower screens:

- Do not shrink all three columns until unusable.
- Allow Schedule and Chat to become drawers, panels, tabs, or another sensible responsive interaction.
- Keep the movie collection as the primary content.
- Make chat usable on touch devices.
- Ensure Delete controls do not depend exclusively on hover.

---

# VISUAL DESIGN

Overall application:

- Clean
- Modern
- Movie-focused
- Dark main shell/header
- Poster-rich center section
- White Twitch-style chat area
- Clear typography
- Good contrast
- Subtle transitions
- Not a corporate dashboard

Movie posters should provide much of the visual richness.

Avoid excessive gradients, giant cards, and unnecessary decoration.

---

# ACCESSIBILITY

Implement:

- Keyboard navigation
- Semantic controls
- Visible focus states
- Labels
- Dialog focus trapping
- Escape-to-close for dialogs
- Screen-reader-friendly labels
- Sufficient contrast
- Reduced-motion support

Do not use color as the only indicator for:

- Voted state
- Online state
- Wheel eligibility
- Errors

---

# IMPORTANT DATA RULES

Remember these exact rules:

1. There are exactly five users.
2. All users have equal application permissions.
3. Every user has a 6-digit PIN.
4. Adding a new movie automatically casts the adding user's vote.
5. Attempting to add an existing movie must clearly notify the user what happened.
6. If an existing movie is selected and the user has not voted for it, add their vote and tell them that the movie already existed and their vote was added.
7. If an existing movie is selected and the user already voted for it, change nothing and tell them that the movie already exists and they already voted for it.
8. Every user may vote for as many movies as they want.
9. A user may only cast one vote per movie.
10. Clicking Voted removes that user's vote.
11. A movie needs at least 3 votes to appear on the wheel.
12. Vote totals do not weight the wheel.
13. Every qualifying movie has exactly one equal-probability wheel entry.
14. Spinning the wheel changes no database data.
15. Spins are local and not synchronized between users.
16. Any user may delete any movie.
17. Any user may add, edit, or delete schedule entries.
18. Chat messages and chat images persist.
19. User avatars and preferences persist.
20. All durable application data lives in Supabase.

---

# TESTING

Add meaningful automated tests.

At minimum test:

## Authentication

- First-time PIN creation
- Correct PIN login
- Incorrect PIN
- PIN validation
- Refresh while logged in
- Logout
- Change PIN

## Movies

- Add new movie
- Automatic vote after add
- Existing movie with no current-user vote adds the vote and shows the correct notification
- Existing movie with an existing current-user vote changes nothing and shows the correct notification
- Duplicate IMDb ID prevention
- Movie deletion
- OMDb metadata mapping

## Voting

- Vote
- Un-vote
- Duplicate vote prevention
- 0 votes
- 1 vote
- 2 votes
- 3 votes becomes wheel eligible
- 3 votes drops to 2 and becomes ineligible
- Maximum 5 distinct votes

## Sorting

- Most Votes
- Alphabetical
- By Year
- My Votes

## Wheel

- Zero eligible movies
- One eligible movie
- Multiple eligible movies
- Equal probability model
- Winner matches final pointer position
- Database remains unchanged after spinning

## Schedule

- Add entry
- Multiple hosts
- Multiple movies
- TBD movie list
- Edit
- Delete
- Deleted active movie does not destroy schedule snapshot

## Chat

- Send text
- Receive Realtime messages
- Message ordering
- Typing presence
- Online presence
- Chat image upload
- Clipboard image paste
- Thumbnail rendering
- Image popup
- Autoscroll
- New-message indicator

## Account Settings

- Select preset avatar
- Upload custom avatar
- Change chat-name color
- Save preferred movie sorting
- Settings persist between sessions/devices

---

# FINAL QUALITY CHECK

Before saying the application is complete:

1. Run lint.
2. Run TypeScript type checking.
3. Run automated tests.
4. Run the production build.
5. Fix errors and meaningful warnings.
6. Test with multiple browser sessions using different users.
7. Verify Realtime chat.
8. Verify online presence.
9. Verify typing indicators.
10. Verify chat image upload and paste.
11. Verify Realtime movie updates.
12. Verify voting threshold behavior.
13. Verify duplicate-movie notifications.
14. Verify schedule Realtime updates.
15. Verify all durable settings persist in Supabase.
16. Verify wheel result matches the visual landing position.
17. Verify spinning creates no unwanted database state.
18. Verify desktop and mobile layouts.

Do not declare completion merely because the dev server starts.

---

# SUPABASE SETUP

I will provide the Supabase configuration.

Create any required:

- SQL migrations
- Storage buckets
- RLS policies
- Database functions
- Triggers
- Realtime publication configuration
- Seed records for the five users
- Seed/default user colors
- Environment variable documentation

Do not invent project credentials.

If configuration is missing, tell me exactly what values are required.

Likely environment variables include appropriate values for:

- Supabase project URL
- Supabase public/anon key
- Supabase service-role key for server-only operations if required
- OMDb API key

Never expose server-only values to browser code.

---

# DEVELOPMENT WORKFLOW

Work through the application in logical stages.

Recommended order:

1. Inspect existing project.
2. Establish application structure.
3. Create Supabase schema and migrations.
4. Create the five user profiles.
5. Implement PIN authentication.
6. Build application shell and responsive layout.
7. Implement Account Settings.
8. Implement Schedule.
9. Implement OMDb movie search.
10. Implement movie collection.
11. Implement automatic vote when adding.
12. Implement duplicate-movie handling and notifications.
13. Implement voting.
14. Implement movie sorting.
15. Implement wheel eligibility logic.
16. Implement the spinner.
17. Implement persistent chat.
18. Implement Realtime chat.
19. Implement Presence.
20. Implement typing indicators.
21. Implement chat image uploads and paste support.
22. Implement avatars.
23. Add automated tests.
24. Test using multiple simultaneous users.
25. Run production build and resolve remaining issues.

Work autonomously.

Investigate and fix implementation problems rather than immediately asking me to solve ordinary engineering decisions.

Do not silently simplify required features.

When you genuinely need missing Supabase or OMDb configuration, stop and tell me exactly what is required.

---

# COMPLETION REPORT

When finished, report:

- What was implemented
- Supabase schema created
- Storage buckets created
- Authentication implementation
- Movie and voting implementation
- Duplicate-movie notification behavior
- Schedule implementation
- Wheel implementation
- Chat implementation
- Presence and typing implementation
- Avatar implementation
- OMDb integration
- Test results
- Lint results
- Type-check results
- Production build result
- Any remaining limitations or unfinished items
