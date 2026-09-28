import { DateTime } from "luxon";
import type { AddMovieOutcome, Movie, MovieMetadata, SortMode } from "./types";

export const TIMEZONE = "America/New_York";
export const WHEEL_MIN_VOTES = 2;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const isPin = (value: unknown): value is string =>
  typeof value === "string" && /^\d{6}$/.test(value);
export const isEligible = (movie: Movie) => movie.movie_votes.length >= WHEEL_MIN_VOTES;
export const votedFor = (movie: Movie, memberId: string) =>
  movie.movie_votes.some((v) => v.user_id === memberId);

export function sortMovies(movies: Movie[], mode: SortMode, memberId: string): Movie[] {
  const title = (a: Movie, b: Movie) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
  const votes = (a: Movie, b: Movie) => b.movie_votes.length - a.movie_votes.length || title(a, b);
  return [...movies].sort((a, b) => {
    if (mode === "alphabetical") return title(a, b);
    if (mode === "year")
      return (b.release_year ?? -Infinity) - (a.release_year ?? -Infinity) || title(a, b);
    if (mode === "my-votes")
      return Number(votedFor(b, memberId)) - Number(votedFor(a, memberId)) || votes(a, b);
    return votes(a, b);
  });
}

export function addMovieNotice(title: string, outcome: AddMovieOutcome): string {
  if (outcome === "added")
    return `${title} was added to the movie list. Your vote was added automatically.`;
  if (outcome === "existing_vote_added")
    return `${title} is already in the movie list. Your vote has been added.`;
  return `${title} is already in the movie list, and you've already voted for it.`;
}

const nullable = (value: unknown) =>
  typeof value === "string" && value.trim() && value !== "N/A" ? value : null;
export function mapOmdb(raw: Record<string, unknown>): MovieMetadata {
  const id = nullable(raw.imdbID);
  const title = nullable(raw.Title);
  if (!id || !/^tt\d{7,10}$/.test(id) || !title || raw.Type !== "movie")
    throw new Error("Movie details are unavailable.");
  const year = Number.parseInt(String(raw.Year), 10);
  const runtime = Number.parseInt(String(raw.Runtime), 10);
  const poster = nullable(raw.Poster);
  return {
    imdb_id: id,
    title,
    release_year: Number.isFinite(year) ? year : null,
    poster_url: poster && /^https:\/\//.test(poster) ? poster : null,
    director: nullable(raw.Director),
    runtime_minutes: Number.isFinite(runtime) ? runtime : null,
    genre: nullable(raw.Genre),
    rated: nullable(raw.Rated),
    plot: nullable(raw.Plot),
    imdb_rating: nullable(raw.imdbRating),
    raw_metadata: raw,
  };
}

export function contrastOnWhite(hex: string): number {
  if (!/^#[\da-f]{6}$/i.test(hex)) return 0;
  const rgb = [1, 3, 5]
    .map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 1.05 / (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] + 0.05);
}

export function easternInput(iso: string): { date: string; time: string } {
  const date = DateTime.fromISO(iso, { zone: TIMEZONE });
  return { date: date.toFormat("yyyy-MM-dd"), time: date.toFormat("HH:mm") };
}
export function easternToUtc(date: string, time: string): string {
  const local = `${date}T${time}`;
  const value = DateTime.fromISO(local, { zone: TIMEZONE });
  if (!value.isValid || value.toFormat("yyyy-MM-dd'T'HH:mm") !== local)
    throw new Error(
      "This time does not exist in Eastern Time because of daylight saving. Choose another time.",
    );
  // For the repeated fall-back hour, consistently choose the earlier occurrence.
  const candidates = value.getPossibleOffsets().sort((a, b) => a.toMillis() - b.toMillis());
  return candidates[0].toUTC().toISO()!;
}
export function formatNight(iso: string) {
  const date = DateTime.fromISO(iso, { zone: TIMEZONE });
  return { date: date.toFormat("cccc, LLLL d"), time: date.toFormat("h:mm a ZZZZ") };
}

// Rejection sampling avoids modulo bias, including counts that do not divide 2^32.
export function randomIndex(
  count: number,
  nextUint32 = () => crypto.getRandomValues(new Uint32Array(1))[0],
): number {
  if (!Number.isSafeInteger(count) || count < 1 || count > 0x100000000)
    throw new Error("Invalid wheel size");
  const limit = Math.floor(0x100000000 / count) * count;
  let sample: number;
  do {
    sample = nextUint32();
  } while (sample >= limit);
  return sample % count;
}
export function targetRotation(current: number, winner: number, count: number): number {
  const target = (360 - ((winner + 0.5) * 360) / count) % 360;
  return current + 360 * 6 + ((target - (current % 360) + 360) % 360);
}
export function indexAtPointer(rotation: number, count: number): number {
  return Math.floor(((360 - (rotation % 360)) % 360) / (360 / count)) % count;
}

export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again.") {
  return error instanceof Error
    ? error.message
    : typeof error === "object" && error && "message" in error
      ? String(error.message)
      : fallback;
}
