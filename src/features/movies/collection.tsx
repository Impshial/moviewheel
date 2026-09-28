"use client";
import { useState } from "react";
import { Film, Heart, Plus, Trash2, Check, LayoutGrid, Rows3, List } from "lucide-react";
import { useWorkspace } from "@/features/workspace/provider";
import { Poster } from "@/components/ui/media";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { MovieDetails } from "./details";
import { SORTS, MOVIE_VIEWS, type Movie, type MovieView, type SortMode } from "@/lib/types";
import { errorMessage, isEligible, sortMovies, votedFor, WHEEL_MIN_VOTES } from "@/lib/domain";

const VIEW_ICONS = { cards: LayoutGrid, "card-list": Rows3, list: List };

export function MovieCollection() {
  const { movies, me, profiles, loading, supabase, refresh, notice, openAddMovie } = useWorkspace();
  const [selected, setSelected] = useState<Movie | null>(null);
  const [deleting, setDeleting] = useState<Movie | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingVotes, setPendingVotes] = useState<Set<string>>(new Set());
  const view = me.preferred_movie_view ?? "cards";
  async function changeView(view: MovieView) {
    const { error } = await supabase.rpc("set_movie_view", { p_view: view });
    if (error) notice(errorMessage(error), true);
    else await refresh();
  }
  async function vote(movie: Movie) {
    setPendingVotes((prev) => new Set(prev).add(movie.id));
    try {
      const { error } = await supabase.rpc("set_vote", {
        p_movie_id: movie.id,
        p_voted: !votedFor(movie, me.id),
      });
      if (error) throw error;
      await refresh();
    } catch (e) {
      notice(errorMessage(e), true);
    } finally {
      setPendingVotes((prev) => {
        const next = new Set(prev);
        next.delete(movie.id);
        return next;
      });
    }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("movies").delete().eq("id", deleting.id);
      if (error) throw error;
      notice(`${deleting.title} was removed.`);
      setDeleting(null);
      await refresh();
    } catch (e) {
      notice(errorMessage(e), true);
    } finally {
      setBusy(false);
    }
  }
  async function changeSort(sort: SortMode) {
    const { error } = await supabase.rpc("update_preferences", {
      p_color: me.chat_name_color,
      p_sort: sort,
    });
    if (error) notice(errorMessage(error), true);
    else await refresh();
  }
  const currentSelection = selected && (movies.find((m) => m.id === selected.id) || selected);
  return (
    <section className="collection">
      <div className="section-heading">
        <div>
          <h1>
            Movies to Watch <span className="count-badge">{movies.length}</span>
          </h1>
        </div>
        <div className="collection-actions">
          <button className="button primary" onClick={openAddMovie}>
            <Plus size={16} />
            Add a Movie
          </button>
          <label className="sort-control">
            Sort
            <select
              disabled={loading}
              value={me.preferred_movie_sort}
              onChange={(e) => void changeSort(e.target.value as SortMode)}
            >
              {Object.entries(SORTS).map(([key, label]) => (
                <option value={key} key={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="collection-toolbar">
        <div className="movie-view-controls" role="group" aria-label="Movie view">
          {Object.entries(MOVIE_VIEWS).map(([key, label]) => {
            const Icon = VIEW_ICONS[key as MovieView];
            return (
              <button
                key={key}
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={view === key}
                disabled={loading}
                onClick={() => void changeView(key as MovieView)}
              >
                <Icon size={17} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>
      {loading ? (
        <div className="poster-grid" aria-label="Loading movies">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div className="skeleton-card" key={i} />
          ))}
        </div>
      ) : !movies.length ? (
        <div className="empty-collection">
          <div className="empty-reel">
            <Film size={52} strokeWidth={1} />
          </div>
          <p className="eyebrow">MAKE IT A MOVIE NIGHT</p>
          <h2>So, what are we watching?</h2>
          <p>
            Add your first movie to get things rolling.
            <br />
            {WHEEL_MIN_VOTES} votes put it on the wheel.
          </p>
          <button className="button primary" onClick={openAddMovie}>
            <Plus size={18} />
            Add a Movie
          </button>
        </div>
      ) : (
        <div
          className={
            view === "cards"
              ? "poster-grid"
              : view === "card-list"
                ? "movie-card-list"
                : "movie-list"
          }
        >
          {sortMovies(movies, me.preferred_movie_sort, me.id).map((movie) => {
            const voted = votedFor(movie, me.id);
            const count = movie.movie_votes.length;
            return (
              <article className="movie-card" key={movie.id}>
                <div className="poster-wrap">
                  {view === "card-list" ? (
                    <Poster url={movie.poster_url} title={movie.title} />
                  ) : (
                    <button
                      className="poster-button"
                      onClick={() => setSelected(movie)}
                      aria-label={`View ${movie.title}`}
                    >
                      <Poster url={movie.poster_url} title={movie.title} />
                    </button>
                  )}
                  <button
                    className="delete-movie icon-button"
                    aria-label={`Delete ${movie.title}`}
                    onClick={() => setDeleting(movie)}
                  >
                    <Trash2 size={17} />
                  </button>
                  {isEligible(movie) && (
                    <span className="poster-wheel-tag">
                      <Check size={11} />
                      On Wheel
                    </span>
                  )}
                </div>
                <button
                  className="movie-title-button"
                  title={movie.title}
                  aria-label={view === "card-list" ? `View ${movie.title}` : undefined}
                  onClick={() => setSelected(movie)}
                >
                  <h2>{movie.title}</h2>
                </button>
                {view === "card-list" ? (
                  <>
                    <dl className="movie-card-facts">
                      <div>
                        <dt>Year</dt>
                        <dd>{movie.release_year ?? "Unknown"}</dd>
                      </div>
                      <div>
                        <dt>Rating</dt>
                        <dd>{movie.rated ?? "Not available"}</dd>
                      </div>
                      <div>
                        <dt>Director</dt>
                        <dd>{movie.director ?? "Not available"}</dd>
                      </div>
                      <div>
                        <dt>Runtime</dt>
                        <dd>
                          {movie.runtime_minutes ? `${movie.runtime_minutes} min` : "Not available"}
                        </dd>
                      </div>
                      <div>
                        <dt>IMDb rating</dt>
                        <dd>{movie.imdb_rating ? `${movie.imdb_rating}/10` : "Not available"}</dd>
                      </div>
                    </dl>
                    <p className="movie-card-description">
                      {movie.plot ?? "No description available."}
                    </p>
                  </>
                ) : (
                  <p className="movie-meta">
                    {movie.release_year ?? "Year unknown"}
                    {view !== "list" && (
                      <>
                        <span>·</span>
                        {profiles.find((p) => p.id === movie.added_by_user_id)?.display_name ??
                          "Member"}
                        &apos;s pick
                      </>
                    )}
                  </p>
                )}
                <div className="movie-voting">
                  <button
                    className={`vote-button ${voted ? "voted" : ""}`}
                    aria-pressed={voted}
                    disabled={pendingVotes.has(movie.id)}
                    onClick={() => void vote(movie)}
                  >
                    <Heart size={16} fill={voted ? "currentColor" : "none"} />
                    {voted ? "Voted" : "Vote"}
                  </button>
                  <span>
                    {count} {count === 1 ? "vote" : "votes"}
                  </span>
                </div>
                <p className={`eligibility ${isEligible(movie) ? "eligible" : ""}`}>
                  {isEligible(movie)
                    ? "On Wheel"
                    : count === WHEEL_MIN_VOTES - 1
                      ? "Needs 1 more vote"
                      : "Not on Wheel"}
                </p>
              </article>
            );
          })}
        </div>
      )}
      <Dialog
        open={Boolean(currentSelection)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title="Movie Details"
        wide
      >
        {currentSelection && (
          <>
            <MovieDetails movie={currentSelection} />
            <p className="muted">
              Added by{" "}
              {profiles.find((p) => p.id === currentSelection.added_by_user_id)?.display_name} ·{" "}
              {currentSelection.movie_votes.length} votes
            </p>
          </>
        )}
      </Dialog>
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Remove Movie?"
        description={`Remove “${deleting?.title}” from Movies to Watch? Its votes will also be removed.`}
        busy={busy}
        onConfirm={() => void remove()}
      />
    </section>
  );
}
