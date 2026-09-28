"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ArrowLeft, Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Poster } from "@/components/ui/media";
import { MovieDetails } from "./details";
import { useWorkspace } from "@/features/workspace/provider";
import { api } from "@/lib/api";
import { addMovieNotice, errorMessage } from "@/lib/domain";
import { TaskQueue } from "@/lib/queue";
import type { AddMovieOutcome, MovieMetadata, SearchMovie } from "@/lib/types";

export function AddMovie({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Add a Movie" wide>
      {open && <SearchForm onClose={() => onOpenChange(false)} />}
    </Dialog>
  );
}
function SearchForm({ onClose }: { onClose: () => void }) {
  const { supabase, refresh, notice } = useWorkspace();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{
    query: string;
    page: number;
    movies: SearchMovie[];
    total: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<MovieMetadata | null>(null);
  const [busy, setBusy] = useState(false);
  const queue = useMemo(() => new TaskQueue(2), []);
  const detailCache = useRef(new Map<string, Promise<MovieMetadata>>());
  const getDetails = useMemo(
    () => (id: string) => {
      let request = detailCache.current.get(id);
      if (!request) {
        request = queue.run(() => api<MovieMetadata>(`/api/omdb?id=${encodeURIComponent(id)}`));
        detailCache.current.set(id, request);
        request.catch(() => detailCache.current.delete(id));
      }
      return request;
    },
    [queue],
  );
  useEffect(() => {
    if (!query.trim()) return;
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await api<{ movies: SearchMovie[]; total: number }>(
          `/api/omdb?query=${encodeURIComponent(query.trim())}&page=${page}`,
          { signal: abort.signal },
        );
        if (!abort.signal.aborted) setResult({ ...response, query, page });
      } catch (e) {
        if (!abort.signal.aborted) setError(errorMessage(e));
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query, page]);
  async function add() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const { data, error } = await supabase.rpc("add_movie", { p_imdb_id: selected.imdb_id });
      if (error) throw error;
      const outcome = data as { title: string; outcome: AddMovieOutcome };
      notice(addMovieNotice(outcome.title, outcome.outcome));
      await refresh();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const currentResult = result?.query === query && result.page === page ? result : null;
  return (
    <div className="add-movie-form">
      {selected ? (
        <>
          <button className="button text-button back-link" onClick={() => setSelected(null)}>
            <ArrowLeft size={16} />
            Back to results
          </button>
          <MovieDetails movie={selected} />
          <div className="modal-actions">
            <button className="button primary" disabled={busy} onClick={() => void add()}>
              <Plus size={17} />
              {busy ? "Adding…" : "Add to Movie List"}
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="search-label">
            Enter Movie Title
            <div className="search-field">
              <Search size={19} />
              <input
                autoFocus
                placeholder="Search by movie title…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                  setError("");
                }}
              />
            </div>
          </label>
          {!query.trim() && (
            <div className="search-intro">
              <FilmMark />
              <h3>Search for a movie</h3>
              <p>Search by title, then select a movie to add. Your vote is added automatically.</p>
            </div>
          )}
          {query.trim() && (loading || (!currentResult && !error)) && (
            <p className="muted" role="status">
              Searching movies…
            </p>
          )}
          {currentResult && !loading && (
            <>
              <div className="search-results">
                {currentResult.movies.map((movie) => (
                  <SearchResult
                    key={movie.imdb_id}
                    movie={movie}
                    getDetails={getDetails}
                    onSelect={setSelected}
                    onError={setError}
                  />
                ))}
              </div>
              {!currentResult.movies.length && (
                <p className="empty-copy">No movies found. Try another title.</p>
              )}
              {currentResult.total > 10 && (
                <div className="pagination">
                  <button
                    className="button secondary"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </button>
                  <span>
                    Page {page} of {Math.min(100, Math.ceil(currentResult.total / 10))}
                  </span>
                  <button
                    className="button secondary"
                    disabled={page >= Math.min(100, Math.ceil(currentResult.total / 10))}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
function SearchResult({
  movie,
  getDetails,
  onSelect,
  onError,
}: {
  movie: SearchMovie;
  getDetails: (id: string) => Promise<MovieMetadata>;
  onSelect: (movie: MovieMetadata) => void;
  onError: (error: string) => void;
}) {
  const element = useRef<HTMLButtonElement>(null);
  const [detail, setDetail] = useState<MovieMetadata | null>(null);
  useEffect(() => {
    let active = true;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        observer.disconnect();
        getDetails(movie.imdb_id)
          .then((result) => {
            if (active) setDetail(result);
          })
          .catch(() => {});
      }
    });
    if (element.current) observer.observe(element.current);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [movie.imdb_id, getDetails]);
  return (
    <button
      ref={element}
      className="search-result"
      onClick={async () => {
        try {
          onSelect(detail || (await getDetails(movie.imdb_id)));
        } catch (e) {
          onError(errorMessage(e));
        }
      }}
    >
      <Poster url={movie.poster_url} title={movie.title} />
      <span>
        <strong>{movie.title}</strong>
        <span>{movie.release_year ?? "Year unknown"}</span>
        <small>{detail?.director ?? "Director unavailable"}</small>
      </span>
      <Plus size={19} />
    </button>
  );
}
function FilmMark() {
  return (
    <div className="film-mark" aria-hidden="true">
      ✦
    </div>
  );
}
