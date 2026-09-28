import "server-only";
import { adminSupabase } from "./supabase/server";
import { HttpError } from "./http";
import { mapOmdb } from "./domain";
import type { MovieMetadata, SearchMovie } from "./types";

async function cached<T>(
  cacheKey: string,
  ttlDays: number,
  fetchValue: () => Promise<T>,
): Promise<T> {
  const admin = adminSupabase();
  const { data, error } = await admin
    .from("omdb_cache")
    .select("payload, expires_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();
  if (error) throw new HttpError("Movie search cache is unavailable. Please try again.", 503);
  if (data && Date.parse(data.expires_at) > Date.now()) return data.payload as T;
  const value = await fetchValue();
  const saved = await admin.from("omdb_cache").upsert({
    cache_key: cacheKey,
    payload: value,
    expires_at: new Date(Date.now() + ttlDays * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (saved.error) throw new HttpError("Movie details could not be saved. Please try again.", 503);
  return value;
}
async function requestOmdb(params: Record<string, string>) {
  const key = process.env.OMDB_API_KEY;
  if (!key)
    throw new HttpError("Movie search needs the OMDb API key in the server configuration.", 503);
  const { data: allowed, error } = await adminSupabase().rpc("reserve_omdb_request");
  if (error) throw new HttpError("Movie search is unavailable. Please try again.", 503);
  if (!allowed)
    throw new HttpError(
      "Today's OMDb request allowance has been reached. Saved movies are still available.",
      429,
    );
  const url = new URL("https://www.omdbapi.com/");
  Object.entries({ ...params, apikey: key, type: "movie", r: "json" }).forEach(([k, v]) =>
    url.searchParams.set(k, v),
  );
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000) });
  } catch {
    throw new HttpError("OMDb did not respond. Please try again.", 502);
  }
  if (!response.ok) throw new HttpError("OMDb is temporarily unavailable.", 502);
  const body = (await response.json()) as Record<string, unknown>;
  if (body.Response === "False") {
    if (body.Error === "Movie not found!") return { Search: [], totalResults: "0" };
    throw new HttpError(
      body.Error === "Request limit reached!"
        ? "The OMDb request allowance has been reached. Try again later."
        : "OMDb could not complete this search. Try a more specific title.",
      502,
    );
  }
  return body;
}
export function getMovie(imdbId: string) {
  return cached<MovieMetadata>(`movie:${imdbId}`, 30, async () =>
    mapOmdb(await requestOmdb({ i: imdbId, plot: "full" })),
  );
}
export function searchMovies(query: string, page: number) {
  return cached<{ movies: SearchMovie[]; total: number }>(
    `search:${query.trim().toLowerCase()}:${page}`,
    1,
    async () => {
      const raw = await requestOmdb({ s: query, page: String(page) });
      const items = Array.isArray(raw.Search) ? (raw.Search as Record<string, unknown>[]) : [];
      return {
        movies: items
          .filter((item) => item.Type === "movie")
          .map((item) => {
            const metadata = mapOmdb(item);
            return {
              imdb_id: metadata.imdb_id,
              title: metadata.title,
              release_year: metadata.release_year,
              poster_url: metadata.poster_url,
            };
          }),
        total: Number(raw.totalResults) || 0,
      };
    },
  );
}
