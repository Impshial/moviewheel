"use client";
import { Poster } from "@/components/ui/media";
import type { MovieMetadata } from "@/lib/types";
export function MovieDetails({ movie }: { movie: MovieMetadata }) {
  return (
    <div className="movie-details">
      <Poster url={movie.poster_url} title={movie.title} />
      <div>
        <div className="eyebrow">
          {movie.release_year ?? "Year unknown"} <span>·</span> {movie.rated ?? "Unrated"}
        </div>
        <h3>{movie.title}</h3>
        <p className="movie-genres">{movie.genre ?? "Genre unavailable"}</p>
        <dl className="detail-facts">
          <div>
            <dt>Director</dt>
            <dd>{movie.director ?? "Not available"}</dd>
          </div>
          <div>
            <dt>Runtime</dt>
            <dd>{movie.runtime_minutes ? `${movie.runtime_minutes} minutes` : "Not available"}</dd>
          </div>
          <div>
            <dt>IMDb rating</dt>
            <dd>{movie.imdb_rating ?? "Not available"}</dd>
          </div>
        </dl>
        <p className="movie-plot">{movie.plot ?? "No overview is available for this movie."}</p>
        <a
          className="subtle-link"
          href={`https://www.imdb.com/title/${movie.imdb_id}/`}
          target="_blank"
          rel="noreferrer"
        >
          IMDb · {movie.imdb_id} ↗
        </a>
      </div>
    </div>
  );
}
