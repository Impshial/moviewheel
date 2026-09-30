import { expect, test, type Page } from "@playwright/test";

const fixture = "http://127.0.0.1:54329";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Paul", exact: true }).click();
  await page.getByLabel("PIN", { exact: true }).fill("001234");
  await page.getByRole("button", { name: "Enter", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^Movies to Watch/ })).toBeVisible();
}

async function openOptions(page: Page) {
  const list = page.locator(".wheel-entries");
  await expect(list).toBeVisible();
  if ((await list.getAttribute("open")) === null) await list.locator("summary").click();
  return list.getByRole("checkbox");
}

test.beforeEach(async ({ request }) => {
  await request.post(`${fixture}/__test/reset`, { data: { claimed: true, movies: true } });
});

test("temporary choices control segments and winners without writing shared data", async ({
  page,
  request,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page);
  await page.getByRole("link", { name: "Spin the Wheel" }).click();
  const choices = await openOptions(page);
  await expect(choices).toHaveCount(4);
  await expect(page.locator(".wheel-entries input:checked")).toHaveCount(4);
  const callCount = (await (await request.get(`${fixture}/__test/calls`)).json()).length;

  await page.getByRole("checkbox", { name: "Include Alien", exact: true }).uncheck();
  await expect(page.locator(".wheel-rotor text")).toHaveText([
    "Arrival",
    "The Grand Budapest Hotel",
    "The Thing",
  ]);
  await expect(choices).toHaveCount(4);
  for (const choice of await choices.all()) await choice.uncheck();
  await expect(page.getByRole("heading", { name: "No movies selected." })).toBeVisible();
  await expect(page.locator(".wheel-rotor path")).toHaveCount(8);
  await expect(page.getByRole("button", { name: "Spin the wheel", exact: true })).toBeDisabled();

  await page.getByRole("checkbox", { name: "Include Arrival", exact: true }).check();
  await expect(page.locator(".wheel-rotor text")).toHaveText(["Arrival"]);
  await page.getByRole("button", { name: "Spin the wheel", exact: true }).click();
  await expect(page.locator(".wheel-result h2")).toHaveText("Arrival");
  await expect(page.locator(".wheel-entries input:checked")).toHaveCount(1);
  await page.getByRole("checkbox", { name: "Include Alien", exact: true }).check();
  await expect(page.locator(".wheel-result h2")).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(choices.first()).toBeVisible();
  const fits = await page.locator(".wheel-entries").evaluate((element) => {
    const box = element.getBoundingClientRect();
    return (
      box.left >= 0 && box.right <= window.innerWidth && element.scrollWidth <= element.clientWidth
    );
  });
  expect(fits).toBe(true);
  await page.screenshot({ path: "artifacts/wheel-selections-mobile.png", fullPage: true });

  const calls = (await (await request.get(`${fixture}/__test/calls`)).json()).slice(callCount) as {
    method: string;
    path: string;
  }[];
  expect(
    calls.filter(
      (call) =>
        ["POST", "PATCH", "PUT", "DELETE"].includes(call.method) &&
        call.path.includes("/rest/v1/") &&
        !call.path.endsWith("/touch_last_seen"),
    ),
  ).toEqual([]);
});

test("leaving resets choices on links and browser history while chat stays intact", async ({
  page,
  context,
}) => {
  await login(page);
  await page.getByLabel("Message", { exact: true }).fill("Keep my chat draft");
  await page.getByRole("link", { name: "Spin the Wheel" }).click();
  await openOptions(page);
  const alien = page.getByRole("checkbox", { name: "Include Alien", exact: true });
  await alien.uncheck();

  const otherTab = await context.newPage();
  await otherTab.goto("/wheel");
  await openOptions(otherTab);
  await expect(otherTab.locator(".wheel-entries input:checked")).toHaveCount(4);
  await otherTab.close();
  await page.getByRole("link", { name: "Movies to Watch", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: /^Movies to Watch/ })).toBeVisible();
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue("Keep my chat draft");
  await page.goBack();
  await expect(page).toHaveURL("/wheel");
  await openOptions(page);
  await expect(alien).toBeChecked();
  await alien.uncheck();
  await page.goForward();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: /^Movies to Watch/ })).toBeVisible();
  await page.getByRole("link", { name: "Spin the Wheel" }).click();
  await openOptions(page);
  await expect(page.locator(".wheel-entries input:checked")).toHaveCount(4);
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue("Keep my chat draft");
  await alien.uncheck();
  await page.reload();
  await openOptions(page);
  await expect(page.locator(".wheel-entries input:checked")).toHaveCount(4);
});

test("spins freeze chosen entries while new eligible movies arrive", async ({ page, context }) => {
  await login(page);
  const otherTab = await context.newPage();
  await otherTab.goto("/");
  const sunrise = otherTab.locator(".movie-card").filter({
    has: otherTab.getByRole("heading", { name: "Before Sunrise", exact: true }),
  });
  await expect(sunrise.getByRole("button", { name: "Vote", exact: true })).toBeEnabled();
  await page.getByRole("link", { name: "Spin the Wheel" }).click();
  const choices = await openOptions(page);
  await page.getByRole("checkbox", { name: "Include Alien", exact: true }).uncheck();
  await page.getByRole("button", { name: "Spin the wheel", exact: true }).click();
  for (const choice of await choices.all()) await expect(choice).toBeDisabled();
  await sunrise.getByRole("button", { name: "Vote", exact: true }).click();
  await expect(sunrise).toContainText("2 votes");
  await expect(choices).toHaveCount(4);
  await expect(page.locator(".wheel-rotor text")).toHaveCount(3);
  await expect(page.getByText("THE WHEEL HAS SPOKEN")).toBeVisible({ timeout: 12000 });
  expect(["Arrival", "The Grand Budapest Hotel", "The Thing"]).toContain(
    await page.locator(".wheel-result h2").innerText(),
  );
  await expect(choices).toHaveCount(5);
  await expect(
    page.getByRole("checkbox", { name: "Include Before Sunrise", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Include Alien", exact: true }),
  ).not.toBeChecked();
  for (const choice of await choices.all()) await expect(choice).toBeEnabled();
  await page.screenshot({ path: "artifacts/wheel-selections-desktop.png", fullPage: true });
  await otherTab.close();
});
