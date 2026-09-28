"use client";
import { useState } from "react";
import { CalendarDays, Plus, Pencil, Trash2, Clock3, Users } from "lucide-react";
import { DateTime } from "luxon";
import { useWorkspace } from "@/features/workspace/provider";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { easternInput, easternToUtc, errorMessage, formatNight, TIMEZONE } from "@/lib/domain";
import type { MovieNight } from "@/lib/types";

export function SchedulePanel() {
  const { nights, profiles, supabase, refresh, notice, loading } = useWorkspace();
  const [editing, setEditing] = useState<MovieNight | "new" | null>(null);
  const [deleting, setDeleting] = useState<MovieNight | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const today = DateTime.now().setZone(TIMEZONE).startOf("day").toMillis();
  const upcoming = nights.filter((n) => Date.parse(n.starts_at) >= today);
  const past = nights.filter((n) => Date.parse(n.starts_at) < today).reverse();
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("movie_nights").delete().eq("id", deleting.id);
      if (error) throw error;
      setDeleting(null);
      notice("Schedule entry deleted.");
      await refresh();
    } catch (e) {
      notice(errorMessage(e), true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="schedule-panel">
      <div className="panel-heading">
        <h2>
          <CalendarDays size={17} />
          Schedule
        </h2>
        <span className="tiny-label">EASTERN TIME</span>
      </div>
      <button className="add-entry" onClick={() => setEditing("new")}>
        <Plus size={16} />
        Add Entry
      </button>
      <div className="schedule-list">
        {loading && <p className="muted">Loading schedule…</p>}
        {!loading && !upcoming.length && (
          <div className="schedule-empty">
            <CalendarDays size={28} strokeWidth={1} />
            <h3>A night to look forward to.</h3>
            <p>Pick a date and get everyone together.</p>
          </div>
        )}
        {(showPast ? [...upcoming, ...past] : upcoming).map((night) => {
          const formatted = formatNight(night.starts_at);
          const date = DateTime.fromISO(night.starts_at, { zone: TIMEZONE });
          return (
            <article className="schedule-entry" key={night.id}>
              <div className="schedule-date-block">
                <span>{date.toFormat("LLL")}</span>
                <strong>{date.day}</strong>
              </div>
              <div className="schedule-entry-body">
                <h3>{night.title}</h3>
                <p className="schedule-day">{formatted.date}</p>
                <p>
                  <Clock3 size={12} />
                  {formatted.time}
                </p>
                <p>
                  <Users size={12} />
                  {profiles
                    .filter((p) => night.movie_night_hosts.some((h) => h.user_id === p.id))
                    .map((p) => p.display_name)
                    .join(" / ")}
                </p>
                <div className="scheduled-movies">
                  <span>Movie(s)</span>
                  {night.movie_night_movies.length ? (
                    <ul>
                      {night.movie_night_movies.map((movie) => (
                        <li key={movie.id}>
                          {movie.movie_title_snapshot}
                          {movie.movie_year_snapshot ? ` (${movie.movie_year_snapshot})` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>TBD</p>
                  )}
                </div>
                <div className="entry-controls">
                  <button onClick={() => setEditing(night)}>
                    <Pencil size={12} />
                    Edit
                  </button>
                  <button onClick={() => setDeleting(night)}>
                    <Trash2 size={12} />
                    Delete
                  </button>
                </div>
              </div>
            </article>
          );
        })}
        {!!past.length && (
          <button className="button text-button past-toggle" onClick={() => setShowPast(!showPast)}>
            {showPast ? "Hide past nights" : `Show past nights (${past.length})`}
          </button>
        )}
      </div>
      <div className="schedule-footer">
        <span className="small-star">✦</span>
        <p>
          Same time. Different sofas.
          <br />
          Great company.
        </p>
      </div>
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        title={editing === "new" ? "Add Schedule Entry" : "Edit Schedule Entry"}
      >
        {editing && (
          <ScheduleForm
            key={typeof editing === "string" ? editing : editing.id}
            night={editing === "new" ? null : editing}
            onClose={() => setEditing(null)}
          />
        )}
      </Dialog>
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Delete Schedule Entry?"
        description={
          deleting
            ? `${deleting.title} — ${formatNight(deleting.starts_at).date} at ${formatNight(deleting.starts_at).time}`
            : ""
        }
        busy={busy}
        onConfirm={() => void remove()}
      />
    </section>
  );
}
function ScheduleForm({ night, onClose }: { night: MovieNight | null; onClose: () => void }) {
  const { profiles, movies, supabase, refresh, notice } = useWorkspace();
  const initial = night
    ? easternInput(night.starts_at)
    : { date: DateTime.now().setZone(TIMEZONE).toFormat("yyyy-MM-dd"), time: "19:30" };
  const [title, setTitle] = useState(night?.title ?? "Movie Night!");
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [hosts, setHosts] = useState(night?.movie_night_hosts.map((h) => h.user_id) ?? []);
  const [selectedMovies, setSelectedMovies] = useState(
    night?.movie_night_movies.flatMap((m) => (m.movie_id ? [m.movie_id] : [])) ?? [],
  );
  const [snapshots, setSnapshots] = useState(
    night?.movie_night_movies.filter((m) => !m.movie_id).map((m) => m.id) ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((value) => value !== id) : [...list, id];
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!hosts.length) throw new Error("Choose at least one host.");
      const { error } = await supabase.rpc("save_movie_night", {
        p_id: night?.id ?? null,
        p_title: title.trim(),
        p_starts_at: easternToUtc(date, time),
        p_host_ids: hosts,
        p_movie_ids: selectedMovies,
        p_retained_snapshot_ids: [
          ...snapshots,
          ...(night?.movie_night_movies
            .filter((m) => m.movie_id && selectedMovies.includes(m.movie_id))
            .map((m) => m.id) ?? []),
        ],
      });
      if (error) throw error;
      await refresh();
      notice(night ? "Schedule updated." : "Movie night added.");
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="stack">
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <div className="form-row">
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label>
          Time
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
        </label>
      </div>
      <p className="field-hint">America/New_York · Eastern Time</p>
      <fieldset>
        <legend>Hosts</legend>
        <div className="host-options">
          {profiles.map((p) => (
            <label className="checkbox-label" key={p.id}>
              <input
                type="checkbox"
                checked={hosts.includes(p.id)}
                onChange={() => setHosts(toggle(hosts, p.id))}
              />
              {p.display_name}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>
          Movies <span className="muted">(optional)</span>
        </legend>
        <div className="movie-options">
          {[...movies]
            .sort((a, b) => a.title.localeCompare(b.title))
            .map((movie) => (
              <label className="checkbox-label" key={movie.id}>
                <input
                  type="checkbox"
                  checked={selectedMovies.includes(movie.id)}
                  onChange={() => setSelectedMovies(toggle(selectedMovies, movie.id))}
                />
                {movie.title} {movie.release_year && `(${movie.release_year})`}
              </label>
            ))}
          {night?.movie_night_movies
            .filter((m) => !m.movie_id)
            .map((m) => (
              <label className="checkbox-label" key={m.id}>
                <input
                  type="checkbox"
                  checked={snapshots.includes(m.id)}
                  onChange={() => setSnapshots(toggle(snapshots, m.id))}
                />
                {m.movie_title_snapshot} <span className="muted">(saved selection)</span>
              </label>
            ))}
          {!movies.length && !snapshots.length && (
            <p className="muted">No movies in the collection yet. This entry will show TBD.</p>
          )}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button className="button secondary" type="button" onClick={onClose}>
          Cancel
        </button>
        <button className="button primary" disabled={busy}>
          {busy ? "Saving…" : night ? "Save Changes" : "Add Entry"}
        </button>
      </div>
    </form>
  );
}
