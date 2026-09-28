import { test, expect, type Page } from "@playwright/test";
const fixture = "http://127.0.0.1:54329";
async function login(page: Page, name = "Paul") {
  await page.goto("/login");
  await page.getByRole("button", { name, exact: true }).click();
  await page.getByLabel("PIN", { exact: true }).fill("001234");
  await page.getByRole("button", { name: "Enter", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Movies to Watch/ })).toBeVisible();
}
test.beforeEach(async ({ request }) => {
  await request.post(`${fixture}/__test/reset`, { data: { claimed: true, movies: true } });
});

test("all three movie views retain voting and details and remember the choice", async ({
  page,
}) => {
  await login(page);
  const controls = page.getByRole("group", { name: "Movie view" });
  await expect(controls.getByRole("button", { name: "Cards", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await controls.getByRole("button", { name: "Card List", exact: true }).click();
  await expect(page.locator(".movie-card-list .movie-card")).toHaveCount(6);
  const card = page
    .locator(".movie-card-list .movie-card")
    .filter({ has: page.getByRole("heading", { name: "Alien", exact: true }) });
  await expect(card.locator(".movie-card-facts dd")).toHaveText([
    "1979",
    "R",
    "Director name",
    "117 min",
    "8.5/10",
  ]);
  await expect(card.locator(".movie-card-description")).toBeVisible();
  await expect(card.locator(".movie-card-description")).toHaveCSS("-webkit-line-clamp", "2");
  const missingMetadata = page
    .locator(".movie-card-list .movie-card")
    .filter({ has: page.getByRole("heading", { name: "Arrival", exact: true }) });
  await expect(missingMetadata.locator(".movie-card-facts dd")).toHaveText([
    "1986",
    "Not available",
    "Director name",
    "Not available",
    "Not available",
  ]);
  await page.screenshot({ path: "artifacts/movies-card-list.png", fullPage: true });
  // The padding and description areas open details, not just the poster or title.
  await card.click({ position: { x: 6, y: 6 } });
  await expect(page.getByRole("dialog")).toContainText("Movie Details");
  await expect(page.getByRole("dialog")).toContainText("Alien");
  await page.getByRole("button", { name: "Close dialog" }).click();
  const description = await card.locator(".movie-card-description").boundingBox();
  await page.mouse.click(description!.x + 5, description!.y + 5);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await card.getByRole("button", { name: "View Alien", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await card.locator(".vote-button").click();
  await expect(card.locator(".vote-button")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Delete Alien", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Delete Before Sunrise", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Remove Movie?");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(card.locator(".movie-card-description")).toBeHidden();
  await expect(card.locator(".movie-card-facts")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: "artifacts/movies-card-list-mobile.png", fullPage: true });
  await card.click({ position: { x: 6, y: 6 } });
  await expect(page.getByRole("dialog")).toContainText("Alien");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await controls.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.locator(".movie-list .movie-card")).toHaveCount(6);
  await page.reload();
  await expect(controls.getByRole("button", { name: "List", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator(".movie-list .movie-title-button").first().click();
  await expect(page.getByRole("dialog")).toContainText("Movie Details");
  await page.getByRole("button", { name: "Close dialog" }).click();
  const votedMovie = page
    .locator(".movie-list .movie-card")
    .filter({ has: page.getByRole("heading", { name: "Blade Runner", exact: true }) });
  await votedMovie.locator(".vote-button").click();
  await expect(votedMovie.locator(".vote-button")).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/movies-list-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const row = await page.locator(".movie-list .movie-card").first().boundingBox();
  expect(row!.height).toBeLessThan(60);
  await expect(page.getByText("THE SHARED COLLECTION", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("A few good picks. One great movie night.", { exact: true }),
  ).toHaveCount(0);
});

test("only the adding member sees Delete in every movie view and can remove it", async ({
  page,
}) => {
  await login(page);
  const views = page.getByRole("group", { name: "Movie view" });
  for (const view of ["Cards", "Card List", "List"]) {
    await views.getByRole("button", { name: view, exact: true }).click();
    await expect(views.getByRole("button", { name: view, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("button", { name: /^Delete / })).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Delete Before Sunrise", exact: true }),
    ).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Delete Alien", exact: true })).toHaveCount(0);
  }
  const ownMovie = page.locator(".movie-card").filter({ hasText: "Before Sunrise" });
  // RLS can return no rows without an error; don't show a false success.
  await page.route("**/rest/v1/movies?**", async (route) => {
    if (route.request().method() === "DELETE") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    } else await route.continue();
  });
  await ownMovie.getByRole("button", { name: "Delete Before Sunrise", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("Movie not found or you cannot remove it.");
  await expect(ownMovie).toHaveCount(1);
  await page.unroute("**/rest/v1/movies?**");
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(ownMovie).toHaveCount(0);
  await expect(page.locator(".toast")).toContainText("Before Sunrise was removed.");
  await page.reload();
  await expect(page.locator(".movie-card")).toHaveCount(5);
});

test("eight sorts persist, account settings are wider, and the nearby add button opens search", async ({
  page,
}) => {
  await login(page);
  const sort = page.getByRole("combobox", { name: "Sort", exact: true });
  await expect(sort.locator("option")).toHaveText([
    "Most Votes",
    "Least Votes",
    "A-Z",
    "Z-A",
    "By Year Oldest",
    "By Year Newest",
    "My Votes",
    "Recently Added",
  ]);
  for (const mode of ["least-votes", "reverse-alphabetical", "year-ascending", "recently-added"]) {
    await sort.selectOption(mode);
    await expect(sort).toHaveValue(mode);
    await page.reload();
    await expect(sort).toHaveValue(mode);
  }
  await expect(page.locator(".movie-card h2")).toHaveText([
    "Blade Runner",
    "Before Sunrise",
    "The Thing",
    "The Grand Budapest Hotel",
    "Arrival",
    "Alien",
  ]);
  await page.locator(".collection-actions").getByRole("button", { name: "Add a Movie" }).click();
  await expect(page.getByLabel("Enter Movie Title")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Paul's menu" }).click();
  await page.getByRole("menuitem", { name: "Account Settings" }).click();
  await expect(page.getByRole("dialog")).toHaveCSS("width", "740px");
  await expect(page.getByLabel("Preferred movie sorting")).toHaveValue("recently-added");
  await page.locator(".avatar-settings .chat-profile-trigger").hover();
  await expect(page.locator(".profile-hover-card-large")).toContainText("Paul");
  await expect(page.locator(".profile-hover-card-large .avatar")).toHaveCSS("width", "96px");
  await page.screenshot({ path: "artifacts/account-settings-wide.png", fullPage: true });
  await page.keyboard.press("Escape");
  await expect(page.locator(".profile-hover-card-large")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.locator(".schedule-footer")).toHaveCount(0);
});

test("an empty wheel remains visible with a disabled spin control", async ({ page, request }) => {
  await request.post(`${fixture}/__test/reset`, { data: { claimed: true, movies: false } });
  await login(page);
  await page.getByRole("link", { name: "Spin the Wheel" }).click();
  await expect(page.locator(".wheel-rotor")).toBeVisible();
  await expect(page.locator(".wheel-rotor path")).toHaveCount(8);
  await expect(page.getByRole("button", { name: "Spin the wheel", exact: true })).toBeDisabled();
  await expect(
    page.getByText("A movie needs at least 2 votes to appear on the wheel."),
  ).toBeVisible();
  await expect(page.getByText("LEAVE IT TO CHANCE", { exact: true })).toHaveCount(0);
  await expect(page.locator(".wheel-description, .wheel-empty svg")).toHaveCount(0);
  await page.screenshot({ path: "artifacts/wheel-empty.png", fullPage: true });
});

test("chat profile cards, clickable URLs, and sender-only message deletion update across clients", async ({
  browser,
}) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  const abby = await a.newPage();
  const paul = await b.newPage();
  try {
    await login(abby, "Abby");
    await login(paul);
    const icon = paul
      .locator(".online-members")
      .getByRole("button", { name: "Abby: Online", exact: true });
    await expect(icon).toBeVisible();
    await icon.hover();
    const card = paul.locator(".profile-hover-card");
    await expect(card).toContainText("Abby");
    await expect(card).toContainText("Online");
    await expect(card.locator(".avatar")).toBeVisible();
    await card.hover();
    await expect(card).toBeVisible();
    await paul.screenshot({ path: "artifacts/chat-profile-card.png", fullPage: true });
    await paul.keyboard.press("Escape");
    await expect(card).toHaveCount(0);
    await paul
      .locator(".online-members")
      .getByRole("button", { name: "Darren: Offline", exact: true })
      .focus();
    await expect(card).toContainText("Offline");
    await paul.keyboard.press("Escape");
    const text =
      "Watch https://example.com/Film_(2026), then www.imdb.com.\n<script>plain text</script>";
    await abby.getByLabel("Message", { exact: true }).fill(text);
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC8sAAAAASUVORK5CYII=",
      "base64",
    );
    await abby
      .locator(".chat-composer input[type=file]")
      .setInputFiles({ name: "image.png", mimeType: "image/png", buffer: png });
    await expect(abby.getByText("Ready", { exact: true })).toBeVisible();
    await abby.getByRole("button", { name: "Send message" }).click();
    const received = paul.locator(".chat-message");
    await expect(received).toHaveCount(1);
    await expect(
      received.getByRole("link", { name: "https://example.com/Film_(2026)" }),
    ).toHaveAttribute("href", "https://example.com/Film_(2026)");
    await expect(received.getByRole("link", { name: "www.imdb.com" })).toHaveAttribute(
      "href",
      "https://www.imdb.com",
    );
    await expect(received.locator(".message-text")).toHaveText(text);
    await expect(received.locator("script")).toHaveCount(0);
    await expect(received.getByRole("button", { name: "Delete message", exact: true })).toHaveCount(
      0,
    );
    await received.getByRole("button", { name: "Abby: Online", exact: true }).hover();
    await expect(card).toContainText("Abby");
    await abby.getByLabel("Message", { exact: true }).fill("Keep this draft");
    const sent = abby.locator(".chat-message");
    await sent.hover();
    await sent.getByRole("button", { name: "Delete message", exact: true }).click();
    await abby.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(sent).toHaveCount(1);
    await sent.hover();
    await sent.getByRole("button", { name: "Delete message", exact: true }).click();
    await abby.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
    await expect(sent).toHaveCount(0);
    await expect(received).toHaveCount(0);
    await expect(abby.getByLabel("Message", { exact: true })).toHaveValue("Keep this draft");
    await paul.reload();
    await expect(paul.locator(".chat-message")).toHaveCount(0);
    await a.close();
    await expect(
      paul.locator(".online-members").getByRole("button", { name: "Abby: Offline", exact: true }),
    ).toBeVisible();
  } finally {
    await a.close();
    await b.close();
  }
});

test("schedule entries open details on mobile and keep edit controls separate", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await page.getByRole("button", { name: "Add Entry", exact: true }).click();
  await page.getByLabel("Date", { exact: true }).fill("2026-10-05");
  await page.getByLabel("Time", { exact: true }).fill("19:30");
  await page.getByLabel("Abby", { exact: true }).check();
  await page.getByLabel("Darren", { exact: true }).check();
  await page.getByRole("button", { name: "Add Entry", exact: true }).last().click();
  await expect(page.locator(".schedule-entry")).toContainText("7:30 PM EDT");
  await page.locator(".schedule-entry-open").click();
  await expect(page.getByRole("dialog")).toContainText("America/New_York");
  await expect(page.getByRole("dialog")).toContainText("Abby / Darren");
  await expect(page.getByRole("dialog")).toContainText("TBD");
  await page.screenshot({ path: "artifacts/schedule-details.png", fullPage: true });
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.locator(".schedule-entry").getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Edit Schedule Entry");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Movies", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
