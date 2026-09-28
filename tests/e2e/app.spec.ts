import { test, expect, type Page } from "@playwright/test";
const fixture = "http://127.0.0.1:54329";
async function login(page: Page, name = "Paul", pin = "001234") {
  await page.goto("/login");
  await page.getByRole("button", { name, exact: true }).click();
  await page.getByLabel("PIN", { exact: true }).fill(pin);
  await page.getByRole("button", { name: "Enter", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Movies to Watch/ })).toBeVisible();
}
test.beforeEach(async ({ request }) => {
  await request.post(`${fixture}/__test/reset`, { data: { claimed: true, movies: true } });
});

test("competing first claims cannot overwrite the successful PIN", async ({ request }) => {
  await request.post(`${fixture}/__test/reset`, { data: { claimed: false, movies: false } });
  const pins = ["001234", "000987"];
  const responses = await Promise.all(
    pins.map((pin) =>
      request.post("/api/auth/setup", {
        headers: { origin: "http://127.0.0.1:3100" },
        data: { member: "abby", pin, confirmPin: pin },
      }),
    ),
  );
  expect(responses.map((r) => r.status()).sort()).toEqual([200, 409]);
  const winner = responses.findIndex((r) => r.status() === 200);
  const success = await request.post("/api/auth/login", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: { member: "abby", pin: pins[winner] },
  });
  const rejected = await request.post("/api/auth/login", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: { member: "abby", pin: pins[1 - winner] },
  });
  expect(success.status()).toBe(200);
  expect(rejected.status()).toBe(401);
});

test("pasted image upload failure retains the draft and lost publish responses retry without duplication", async ({
  page,
}) => {
  await login(page);
  await page.getByLabel("Message", { exact: true }).fill("Keep my draft");
  await page.route(
    "**/storage/v1/object/chat-images/**",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Test upload interruption" }),
      }),
    { times: 1 },
  );
  await page.getByLabel("Message", { exact: true }).evaluate((element) => {
    const raw = atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC8sAAAAASUVORK5CYII=",
    );
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([Uint8Array.from(raw, (c) => c.charCodeAt(0))], "pasted.png", { type: "image/png" }),
    );
    element.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }),
    );
  });
  await expect(page.getByText("Test upload interruption", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue("Keep my draft");
  await expect(page.locator(".chat-message")).toHaveCount(0);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();
  await page.route(
    "**/rest/v1/rpc/send_message",
    async (route) => {
      await route.fetch();
      await route.abort("failed");
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry sending message" })).toBeEnabled();
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue("Keep my draft");
  await page.getByRole("button", { name: "Retry sending message" }).click();
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue("");
  await page.reload();
  await expect(page.locator(".chat-message")).toHaveCount(1);
  await expect(page.locator(".image-thumbnail")).toHaveCount(1);
});

test("concurrent movie additions show distinct outcomes, and live votes cross the wheel threshold", async ({
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const [abby, paul, hannah] = await Promise.all(contexts.map((c) => c.newPage()));
  try {
    await login(abby, "Abby");
    await login(paul, "Paul");
    await login(hannah, "Hannah");
    async function chooseMoon(page: Page) {
      await page.getByRole("button", { name: "Add a Movie", exact: true }).first().click();
      await page.getByLabel("Enter Movie Title").fill("Moon");
      await page.locator(".search-result").click();
    }
    await Promise.all([chooseMoon(abby), chooseMoon(paul)]);
    await Promise.all(
      [abby, paul].map((p) => p.getByRole("button", { name: "Add to Movie List" }).click()),
    );
    await expect(abby.locator(".toast")).toContainText("Moon");
    await expect(paul.locator(".toast")).toContainText("Moon");
    const notices = await Promise.all([abby, paul].map((p) => p.locator(".toast").innerText()));
    expect(
      notices.some((t) =>
        t.includes("was added to the movie list. Your vote was added automatically."),
      ),
    ).toBe(true);
    expect(
      notices.some((t) => t.includes("is already in the movie list. Your vote has been added.")),
    ).toBe(true);
    const moon = hannah
      .locator(".movie-card")
      .filter({ has: hannah.getByRole("heading", { name: "Moon", exact: true }) });
    await expect(moon).toContainText("2 votes");
    await expect(moon).toContainText("Needs 1 more vote");
    await moon.getByRole("button", { name: "Vote", exact: true }).click();
    await expect(moon).toContainText("3 votes");
    await expect(moon.locator(".eligibility")).toHaveText("On Wheel");
    await chooseMoon(paul);
    await paul.getByRole("button", { name: "Add to Movie List" }).click();
    await expect(paul.locator(".toast")).toContainText("you've already voted for it");
    await moon.getByRole("button", { name: "Voted", exact: true }).click();
    await expect(moon).toContainText("Needs 1 more vote");
    await paul.getByRole("button", { name: "Delete Moon", exact: true }).click();
    await paul.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
    await expect(moon).toHaveCount(0);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
test("first visitor setup preserves leading zeroes, persists refresh, changes PIN, and logs out", async ({
  page,
  request,
}) => {
  await request.post(`${fixture}/__test/reset`, { data: { claimed: false, movies: false } });
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Who are you?" })).toBeVisible();
  await expect(page.getByRole("button")).toHaveText([
    "Abby",
    "Darren",
    "Elisabeth",
    "Hannah",
    "Paul",
  ]);
  await expect(page.getByText("The conversation")).toHaveCount(0);
  await page.getByRole("button", { name: "Paul", exact: true }).click();
  await page.getByLabel("Create PIN", { exact: true }).fill("001234");
  await page.getByLabel("Confirm PIN", { exact: true }).fill("001234");
  await page.getByRole("button", { name: "Set PIN" }).click();
  await expect(page.getByRole("heading", { name: /Movies to Watch/ })).toBeVisible();
  for (const cookie of await page.context().cookies())
    if (cookie.name.startsWith("sb-")) expect(cookie.expires).toBe(-1);
  await page.reload();
  await expect(page.getByRole("heading", { name: /Movies to Watch/ })).toBeVisible();
  await page.getByRole("button", { name: "Paul's menu" }).click();
  await page.getByRole("menuitem", { name: "Account Settings" }).click();
  await page.getByLabel("Current PIN", { exact: true }).fill("001234");
  await page.getByLabel("New PIN", { exact: true }).fill("000987");
  await page.getByLabel("Confirm new PIN", { exact: true }).fill("000987");
  await page.getByRole("button", { name: "Change PIN", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Your PIN was changed");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Paul's menu" }).click();
  await page.getByRole("menuitem", { name: "Log Out" }).click();
  await expect(page.getByRole("heading", { name: "Who are you?" })).toBeVisible();
  await page.getByRole("button", { name: "Paul", exact: true }).click();
  await page.getByLabel("PIN", { exact: true }).fill("001234");
  await page.getByRole("button", { name: "Enter", exact: true }).click();
  await expect(page.locator(".form-error")).toHaveText("Incorrect PIN. Try again.");
  await page.getByLabel("PIN", { exact: true }).fill("000987");
  await page.getByRole("button", { name: "Enter", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Movies to Watch/ })).toBeVisible();
});
test("wheel stays in the center, preserves chat draft, and produces no mutation", async ({
  page,
  request,
}) => {
  await login(page);
  await page.getByLabel("Message", { exact: true }).fill("Keep this draft while I spin");
  await page.getByRole("link", { name: "Spin the Wheel" }).click();
  await expect(page.getByRole("heading", { name: "Let the wheel decide." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Schedule", exact: true })).toBeVisible();
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue(
    "Keep this draft while I spin",
  );
  const before = await request.get(`${fixture}/__test/calls`);
  const count = (await before.json()).length;
  await page.getByRole("button", { name: "Spin the wheel", exact: true }).click();
  await expect(page.getByText("THE WHEEL HAS SPOKEN")).toBeVisible({ timeout: 12000 });
  const calls = (await (await request.get(`${fixture}/__test/calls`)).json()).slice(count) as {
    method: string;
    path: string;
  }[];
  expect(
    calls.filter(
      (c) =>
        c.method === "POST" && c.path.includes("/rest/v1/") && !c.path.endsWith("/touch_last_seen"),
    ),
  ).toEqual([]);
  await page.screenshot({ path: "artifacts/wheel.png", fullPage: true });
  await page.getByRole("link", { name: "Movies to Watch", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Movies to Watch/ })).toBeVisible();
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue(
    "Keep this draft while I spin",
  );
  await page.screenshot({ path: "artifacts/desktop.png", fullPage: true });
});
test("six attachments including >5 MB upload directly, persist, and survive view URL renewal", async ({
  page,
  request,
}) => {
  await login(page);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC8sAAAAASUVORK5CYII=",
    "base64",
  );
  const images = Array.from({ length: 6 }, (_, i) => ({
    name: `photo-${i}.png`,
    mimeType: "image/png",
    buffer: i === 0 ? Buffer.concat([png, Buffer.alloc(5500000)]) : png,
  }));
  await page.locator(".chat-composer input[type=file]").setInputFiles(images);
  await expect(page.getByText("Ready", { exact: true })).toHaveCount(6);
  await page.getByRole("link", { name: "Spin the Wheel" }).click();
  await expect(page.getByText("Ready", { exact: true })).toHaveCount(6);
  await page.getByLabel("Message", { exact: true }).fill("Six photos");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".image-thumbnail")).toHaveCount(6);
  await expect(page.locator(".pending-image")).toHaveCount(0);
  const before = (await (await request.get(`${fixture}/__test/signed-count`)).json()).count;
  await page.reload();
  await expect(page.locator(".image-thumbnail")).toHaveCount(6);
  await page.locator(".image-thumbnail").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".lightbox-image")).toBeVisible();
  expect(
    (await (await request.get(`${fixture}/__test/signed-count`)).json()).count,
  ).toBeGreaterThan(before);
  const calls = await (await request.get(`${fixture}/__test/calls`)).json();
  expect(
    calls.filter(
      (c: { method: string; path: string }) =>
        c.method === "POST" && c.path.startsWith("/storage/v1/object/chat-images/"),
    ),
  ).toHaveLength(6);
});
test("two authenticated users receive chat, presence survives a tab closing, and typing expires", async ({
  browser,
  request,
}) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  const abby = await a.newPage();
  const paul = await b.newPage();
  try {
    await login(abby, "Abby");
    await login(paul, "Paul");
    const second = await a.newPage();
    await second.goto("/");
    await expect(second.getByRole("heading", { name: /Movies to Watch/ })).toBeVisible();
    await expect(paul.getByText("2 online", { exact: true })).toBeVisible();
    await second.close();
    await expect(paul.getByText("2 online", { exact: true })).toBeVisible();
    await abby.getByLabel("Message", { exact: true }).fill("Hello from Abby");
    await expect(paul.locator(".typing-line")).toContainText("Abby");
    await abby.getByRole("button", { name: "Send message" }).click();
    await expect(paul.getByText("Hello from Abby", { exact: true })).toBeVisible();
    await expect(paul.locator(".typing-line")).toBeEmpty();
    await abby.getByRole("button", { name: "Abby's menu" }).click();
    await abby.getByRole("menuitem", { name: "Account Settings" }).click();
    await abby.locator("input[type=color]").fill("#123456");
    await abby.getByRole("button", { name: "Save Preferences" }).click();
    await expect(paul.locator(".chat-author").first()).toHaveCSS("color", "rgb(18, 52, 86)");
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC8sAAAAASUVORK5CYII=",
      "base64",
    );
    await abby
      .locator(".account-settings input[type=file]")
      .setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: png });
    await expect(abby.getByText("Ready to save", { exact: true })).toBeVisible();
    await abby.getByRole("button", { name: "Use this avatar" }).click();
    const avatar = paul.locator(".chat-message .avatar img").first();
    await expect(avatar).toBeVisible();
    const first = await avatar.getAttribute("src");
    await abby
      .locator(".account-settings input[type=file]")
      .setInputFiles({ name: "replacement.png", mimeType: "image/png", buffer: png });
    await expect(abby.getByText("Ready to save", { exact: true })).toBeVisible();
    await abby.getByRole("button", { name: "Use this avatar" }).click();
    await expect(avatar).not.toHaveAttribute("src", first!);
    await abby.getByLabel("Preferred movie sorting").selectOption("alphabetical");
    await abby.getByRole("button", { name: "Save Preferences" }).click();
    await expect(abby.locator(".toast")).toContainText("preferences were saved");
    const otherDevice = await browser.newContext();
    try {
      const again = await otherDevice.newPage();
      await login(again, "Abby");
      await expect(again.getByRole("combobox", { name: "Sort", exact: true })).toHaveValue(
        "alphabetical",
      );
      await expect(again.locator(".chat-message .avatar img").first()).toBeVisible();
    } finally {
      await otherDevice.close();
    }
  } finally {
    await a.close();
    await b.close();
  }
  expect((await request.get(`${fixture}/health`)).ok()).toBe(true);
});

test("older chat pagination and scroll survive wheel navigation while new messages wait below", async ({
  page,
  browser,
  request,
}) => {
  await request.post(`${fixture}/__test/history`);
  await login(page);
  await expect(page.locator(".chat-message")).toHaveCount(100);
  const scroller = page.locator(".chat-scroll");
  await scroller.evaluate((el) => {
    el.scrollTop = 0;
  });
  await expect(page.locator(".chat-message")).toHaveCount(140);
  await scroller.evaluate((el) => {
    el.scrollTop = 200;
  });
  const top = await scroller.evaluate((el) => el.scrollTop);
  await page.getByRole("link", { name: "Spin the Wheel" }).click();
  await expect(page.getByRole("heading", { name: "Let the wheel decide." })).toBeVisible();
  expect(await scroller.evaluate((el) => el.scrollTop)).toBe(top);
  const context = await browser.newContext();
  try {
    const other = await context.newPage();
    await login(other, "Abby");
    await other.getByLabel("Message", { exact: true }).fill("A new message at the bottom");
    await other.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByRole("button", { name: "New messages" })).toBeVisible();
    expect(await scroller.evaluate((el) => el.scrollTop)).toBe(top);
    await page.getByRole("button", { name: "New messages" }).click();
    await expect(page.getByText("A new message at the bottom", { exact: true })).toBeInViewport();
  } finally {
    await context.close();
  }
});
test("mobile navigation and shared schedule edits remain usable", async ({ page }) => {
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
  await page.getByRole("button", { name: "Movies", exact: true }).click();
  await page.screenshot({ path: "artifacts/mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
