import { expect, test, type Page } from "@playwright/test";

type Sound = {
  duration: number;
  channels: number;
  sampleRate: number;
  when: number;
  at: number;
  offset: number;
  stopped: boolean;
};
type AudioState = { wheelSounds: Sound[]; closedAudio: number };

async function recordSounds(page: Page) {
  await page.addInitScript(() => {
    const state = window as typeof window & AudioState;
    state.wheelSounds = [];
    state.closedAudio = 0;
    const start = AudioBufferSourceNode.prototype.start;
    const stop = AudioBufferSourceNode.prototype.stop;
    const close = AudioContext.prototype.close;
    const records = new WeakMap<AudioBufferSourceNode, Sound>();
    AudioBufferSourceNode.prototype.start = function (when = 0, offset = 0, duration?: number) {
      const sound = {
        duration: this.buffer?.duration ?? 0,
        channels: this.buffer?.numberOfChannels ?? 0,
        sampleRate: this.buffer?.sampleRate ?? 0,
        when,
        offset,
        at: this.context.currentTime,
        stopped: false,
      };
      records.set(this, sound);
      state.wheelSounds.push(sound);
      if (duration === undefined) start.call(this, when, offset);
      else start.call(this, when, offset, duration);
    };
    AudioBufferSourceNode.prototype.stop = function (when = 0) {
      const sound = records.get(this);
      if (sound) sound.stopped = true;
      stop.call(this, when);
    };
    AudioContext.prototype.close = function () {
      state.closedAudio++;
      return close.call(this);
    };
  });
}

async function openWheel(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Paul", exact: true }).click();
  await page.getByLabel("PIN", { exact: true }).fill("001234");
  await page.getByRole("button", { name: "Enter", exact: true }).click();
  const loaded = page.waitForResponse(
    (response) => response.url().endsWith("/audio/spin-applause-small-group.mp3") && response.ok(),
  );
  await page.getByRole("link", { name: "Spin the Wheel" }).click();
  await loaded;
  await expect(page.getByRole("button", { name: "Spin the wheel", exact: true })).toBeEnabled();
}

const sounds = (page: Page) =>
  page.evaluate(() => (window as typeof window & AudioState).wheelSounds);

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:54329/__test/reset", {
    data: { claimed: true, movies: true },
  });
});

test("spin starts applause, schedules every crossing, and cancels sound on leaving", async ({
  page,
}) => {
  await recordSounds(page);
  await openWheel(page);
  expect(await sounds(page)).toEqual([]);
  await page.getByRole("button", { name: "Spin the wheel", exact: true }).click();
  await expect
    .poll(async () => (await sounds(page)).filter((sound) => sound.duration > 1).length)
    .toBe(1);
  const scheduled = await sounds(page);
  const clicks = scheduled.filter((sound) => sound.duration < 0.1);
  const target = await page
    .locator(".wheel-rotor")
    .evaluate((element) =>
      Number((element as SVGElement).style.transform.match(/rotate\(([^d]+)deg\)/)![1]),
    );
  expect(clicks).toHaveLength(Math.floor(target / 90));
  expect(clicks.every((sound) => sound.when >= sound.at)).toBe(true);
  expect(clicks.at(-1)!.when - clicks.at(-2)!.when).toBeGreaterThan(
    clicks[2].when - clicks[1].when,
  );
  const applause = scheduled.find((sound) => sound.duration > 1)!;
  expect(applause.duration).toBeCloseTo(4.486, 2);
  expect(applause.channels).toBe(2);
  expect(applause.sampleRate).toBe(44100);
  expect(applause.offset).toBeLessThan(0.5);
  await expect(page.getByText("THE WHEEL HAS SPOKEN")).toBeVisible({ timeout: 12000 });
  expect((await sounds(page)).filter((sound) => sound.duration > 1)).toHaveLength(1);
  await page.getByRole("button", { name: "Spin the wheel", exact: true }).click();
  await expect
    .poll(async () => (await sounds(page)).filter((sound) => sound.duration > 1).length)
    .toBe(2);
  await page.getByRole("link", { name: "Movies to Watch", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as typeof window & AudioState).closedAudio))
    .toBeGreaterThan(0);
  expect((await sounds(page)).at(-1)?.stopped).toBe(true);
});

test("reduced motion plays applause without simulated spin clicks", async ({ page }) => {
  await recordSounds(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openWheel(page);
  await page.getByRole("button", { name: "Spin the wheel", exact: true }).click();
  await expect(page.getByText("THE WHEEL HAS SPOKEN")).toBeVisible();
  await expect.poll(async () => (await sounds(page)).length).toBe(1);
  expect((await sounds(page))[0].duration).toBeGreaterThan(1);
});

test("unavailable audio does not prevent choosing a movie", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "AudioContext", {
      value: class {
        constructor() {
          throw new Error("Audio unavailable");
        }
      },
    });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openWheel(page);
  await page.getByRole("button", { name: "Spin the wheel", exact: true }).click();
  await expect(page.getByText("THE WHEEL HAS SPOKEN")).toBeVisible();
  await expect(page.getByRole("button", { name: "Spin the wheel", exact: true })).toBeEnabled();
});
