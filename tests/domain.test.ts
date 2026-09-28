import { describe, expect, it } from "vitest";
import {
  addMovieNotice,
  contrastOnWhite,
  easternToUtc,
  formatNight,
  indexAtPointer,
  isEligible,
  isPin,
  mapOmdb,
  randomIndex,
  sortMovies,
  targetRotation,
} from "@/lib/domain";
import { sessionCookieOptions } from "@/lib/supabase/cookies";
import { TaskQueue } from "@/lib/queue";
import { checkFileSize, imageType } from "@/lib/uploads";
import type { Movie } from "@/lib/types";

const metadata = mapOmdb({
  imdbID: "tt1234567",
  Title: "Alien",
  Type: "movie",
  Year: "1979",
  Runtime: "117 min",
});
function movie(id: string, title: string, votes: string[], year: number | null = 2020): Movie {
  return {
    ...metadata,
    id,
    title,
    release_year: year,
    added_by_user_id: "a",
    created_at: "",
    movie_votes: votes.map((user_id) => ({ user_id })),
  };
}
describe("PINs and browser-session cookies", () => {
  it("preserves leading zeroes and requires exactly six digits", () => {
    expect(isPin("001234")).toBe(true);
    [123456, "12345", "1234567", "123a56", " 123456", "１２３４５６"].forEach((value) =>
      expect(isPin(value)).toBe(false),
    );
  });
  it("strips SDK persistence attributes on every refresh but expires deleted cookies", () => {
    expect(
      sessionCookieOptions({ maxAge: 34560000, expires: new Date("2030-01-01") }),
    ).not.toHaveProperty("maxAge");
    expect(
      sessionCookieOptions({ maxAge: 34560000, expires: new Date("2030-01-01") }),
    ).not.toHaveProperty("expires");
    expect(sessionCookieOptions({}, true)).toMatchObject({ maxAge: 0, path: "/", sameSite: "lax" });
  });
});
describe("collection rules", () => {
  const movies = [
    movie("b", "Bravo", ["a", "b", "c"], 1990),
    movie("a", "Alpha", ["a", "b", "c"], 2022),
    movie("c", "Charlie", ["b"], null),
  ];
  it("sorts without mutating shared state", () => {
    expect(sortMovies(movies, "most-votes", "b").map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(sortMovies(movies, "alphabetical", "b").map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(sortMovies(movies, "year", "b").map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(sortMovies(movies, "my-votes", "c").map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(sortMovies(movies, "my-votes", "b")[2].id).toBe("c");
    expect(movies[0].id).toBe("b");
  });
  it("puts personal votes first even when another movie has more total votes", () => {
    expect(
      sortMovies(
        [movie("a", "Alien", ["other", "third"]), movie("b", "Bravo", ["me"])],
        "my-votes",
        "me",
      )[0].id,
    ).toBe("b");
  });
  it.each([0, 1, 2, 3, 4, 5])("qualifies exactly at three votes (%i)", (count) =>
    expect(
      isEligible(
        movie(
          "a",
          "Alien",
          Array.from({ length: count }, (_, i) => String(i)),
        ),
      ),
    ).toBe(count >= 3),
  );
  it("keeps duplicate notifications distinct", () => {
    expect(addMovieNotice("Alien", "added")).toContain("automatically");
    expect(addMovieNotice("Alien", "existing_vote_added")).toContain("Your vote has been added");
    expect(addMovieNotice("Alien", "already_voted")).toContain("already voted");
  });
  it("maps missing OMDb values honestly and rejects series", () => {
    expect(
      mapOmdb({
        Title: "Arrival",
        imdbID: "tt2543164",
        Type: "movie",
        Year: "N/A",
        Runtime: "N/A",
        Director: "N/A",
        Poster: "N/A",
      }),
    ).toMatchObject({
      title: "Arrival",
      release_year: null,
      runtime_minutes: null,
      director: null,
      poster_url: null,
    });
    expect(() => mapOmdb({ Title: "Series", imdbID: "tt2543164", Type: "series" })).toThrow();
  });
});
describe("local wheel", () => {
  it("rejects empty wheels, handles one entry, and rejects biased tail samples", () => {
    expect(() => randomIndex(0)).toThrow();
    expect(randomIndex(1, () => 100)).toBe(0);
    const samples = [0xffffffff, 4];
    expect(randomIndex(3, () => samples.shift()!)).toBe(1);
    expect(samples).toHaveLength(0);
  });
  it("gives each entry one equal interval regardless of vote totals", () => {
    const counts = [0, 0, 0];
    for (let value = 0; value < 3000; value++) counts[randomIndex(3, () => value)]++;
    expect(counts).toEqual([1000, 1000, 1000]);
  });
  it("lands every chosen winner under the fixed pointer after repeated spins", () => {
    let angle = 0;
    for (const count of [1, 2, 3, 7, 19, 60])
      for (let winner = 0; winner < count; winner++) {
        const target = targetRotation(angle, winner, count);
        expect(target - angle).toBeGreaterThanOrEqual(2160);
        expect(indexAtPointer(target, count)).toBe(winner);
        angle = target;
      }
  });
});
describe("Eastern scheduling and appearance", () => {
  it("uses DST rather than a fixed offset", () => {
    expect(easternToUtc("2026-01-10", "19:30")).toBe("2026-01-11T00:30:00.000Z");
    expect(easternToUtc("2026-07-10", "19:30")).toBe("2026-07-10T23:30:00.000Z");
    expect(formatNight("2026-07-10T23:30:00.000Z").time).toContain("7:30 PM");
  });
  it("rejects skipped spring-forward times and consistently selects the first fall-back occurrence", () => {
    expect(() => easternToUtc("2026-03-08", "02:30")).toThrow("does not exist");
    expect(easternToUtc("2026-11-01", "01:30")).toBe("2026-11-01T05:30:00.000Z");
  });
  it("checks chat color contrast on white", () => {
    expect(contrastOnWhite("#ffffff")).toBe(1);
    expect(contrastOnWhite("#000000")).toBe(21);
    ["#9d174d", "#1d4ed8", "#047857", "#7e22ce", "#b45309"].forEach((color) =>
      expect(contrastOnWhite(color)).toBeGreaterThanOrEqual(4.5),
    );
  });
});
describe("upload constraints and queue", () => {
  it("does not reject files above 5 MB when configured storage permits them", () => {
    expect(() => checkFileSize(10 * 1024 * 1024, 50 * 1024 * 1024)).not.toThrow();
    expect(() => checkFileSize(10 * 1024 * 1024, null)).not.toThrow();
    expect(() => checkFileSize(60 * 1024 * 1024, 50 * 1024 * 1024)).toThrow(
      "configured Storage limit",
    );
  });
  it("recognizes actual image signatures and rejects unsupported content", async () => {
    expect(await imageType(new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])]))).toBe(
      "image/png",
    );
    expect(await imageType(new Blob(["GIF89a"]))).toBe("image/gif");
    await expect(imageType(new Blob(["<svg></svg>"]))).rejects.toThrow("unsupported");
  });
  it("processes more than four attachments with bounded concurrency without dropping any", async () => {
    const queue = new TaskQueue(2);
    let running = 0;
    let maximum = 0;
    const result = await Promise.all(
      Array.from({ length: 9 }, (_, i) =>
        queue.run(async () => {
          running++;
          maximum = Math.max(maximum, running);
          await new Promise((resolve) => setTimeout(resolve, 2));
          running--;
          return i;
        }),
      ),
    );
    expect(result).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(maximum).toBe(2);
  });
});
