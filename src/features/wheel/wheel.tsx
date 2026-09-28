"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useWorkspace } from "@/features/workspace/provider";
import { isEligible, randomIndex, targetRotation, WHEEL_MIN_VOTES } from "@/lib/domain";
import type { Movie } from "@/lib/types";

const COLORS = [
  "#ff6b61",
  "#ffae3d",
  "#ffe268",
  "#9aca57",
  "#24bbaa",
  "#2bb9e8",
  "#7678d7",
  "#be69d0",
];
export function MovieWheel() {
  const { movies, loading } = useWorkspace();
  const [snapshot, setSnapshot] = useState<Movie[] | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [winner, setWinner] = useState<Movie | null>(null);
  const [duration, setDuration] = useState(6500);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = movies
    .filter(isEligible)
    .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  const entries = spinning && snapshot ? snapshot : live;
  const segments = entries.length
    ? entries
    : COLORS.map((_, index) => ({ id: `empty-${index}`, title: "" }));
  const restingWinner = winner ? entries.findIndex((movie) => movie.id === winner.id) : -1;
  const visibleRotation =
    !spinning && restingWinner >= 0
      ? Math.floor(rotation / 360) * 360 +
        ((360 - ((restingWinner + 0.5) * 360) / entries.length) % 360)
      : rotation;
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function spin() {
    if (spinning || !live.length) return;
    const captured = [...live];
    const selected = randomIndex(captured.length);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ms = reduced ? 0 : 6500;
    setDuration(ms);
    setWinner(null);
    setSnapshot(captured);
    setSpinning(true);
    setRotation(targetRotation(visibleRotation, selected, captured.length));
    timer.current = setTimeout(() => {
      setWinner(captured[selected]);
      setSpinning(false);
      setSnapshot(null);
    }, ms + 30);
  }
  return (
    <section className="wheel-page">
      <Link className="back-link" href="/">
        <ArrowLeft size={16} />
        Movies to Watch
      </Link>
      <h1>Let the wheel decide.</h1>
      {loading ? (
        <p role="status">Loading the wheel…</p>
      ) : (
        <>
          <div className="wheel-stage">
            <div className="wheel-pointer" aria-hidden="true" />
            <svg
              viewBox="0 0 600 600"
              className="wheel-rotor"
              aria-hidden="true"
              style={{
                transform: `rotate(${visibleRotation}deg)`,
                transitionDuration: spinning ? `${duration}ms` : "0ms",
              }}
            >
              {segments.map((movie, index) => {
                const start = (index * 2 * Math.PI) / segments.length - Math.PI / 2;
                const end = ((index + 1) * 2 * Math.PI) / segments.length - Math.PI / 2;
                const middle = (start + end) / 2;
                const color = COLORS[index % COLORS.length];
                const path = `M300 300 L${300 + 286 * Math.cos(start)} ${300 + 286 * Math.sin(start)} A286 286 0 ${end - start > Math.PI ? 1 : 0} 1 ${300 + 286 * Math.cos(end)} ${300 + 286 * Math.sin(end)} Z`;
                const label =
                  movie.title.length > 27 ? `${movie.title.slice(0, 25)}…` : movie.title;
                return (
                  <g key={movie.id}>
                    {segments.length === 1 ? (
                      <circle cx="300" cy="300" r="286" fill={color} />
                    ) : (
                      <path d={path} fill={color} />
                    )}
                    {movie.title && (
                      <text
                        x="300"
                        y="300"
                        transform={`rotate(${(middle * 180) / Math.PI} 300 300) translate(115 0)`}
                        dy=".35em"
                        fontSize={Math.min(18, 340 / segments.length)}
                        textLength={Math.min(
                          155,
                          label.length * Math.min(18, 340 / segments.length) * 0.6,
                        )}
                        lengthAdjust="spacingAndGlyphs"
                        textAnchor="start"
                        fill="#18202d"
                        fontWeight="700"
                      >
                        {label}
                      </text>
                    )}
                  </g>
                );
              })}
              <circle cx="300" cy="300" r="286" fill="none" stroke="#ffffff55" strokeWidth="20" />
            </svg>
            <button
              className="spin-button"
              onClick={spin}
              disabled={spinning || !entries.length}
              aria-label={spinning ? "Wheel spinning" : "Spin the wheel"}
            >
              {spinning ? "…" : "Spin"}
            </button>
          </div>
          {entries.length > 0 && (
            <details className="wheel-entries">
              <summary>
                See the {entries.length} {entries.length === 1 ? "movie" : "movies"} on the wheel
              </summary>
              <ul>
                {entries.map((m) => (
                  <li key={m.id}>{m.title}</li>
                ))}
              </ul>
            </details>
          )}
          {!entries.length && (
            <div className="wheel-empty">
              <h2>No movies have enough votes yet.</h2>
              <p>A movie needs at least {WHEEL_MIN_VOTES} votes to appear on the wheel.</p>
            </div>
          )}
        </>
      )}
      <div className="wheel-result" aria-live="polite">
        {spinning ? (
          <p>Finding tonight’s pick…</p>
        ) : winner ? (
          <>
            <span className="eyebrow">THE WHEEL HAS SPOKEN</span>
            <h2>{winner.title}</h2>
            <p>{winner.release_year}</p>
          </>
        ) : entries.length > 0 ? (
          <p>One spin. Your next movie.</p>
        ) : null}
      </div>
    </section>
  );
}
