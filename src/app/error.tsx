"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <h1>Let’s try that again.</h1>
      <p>Movie Wheel couldn’t load this page. Your shared data is still saved.</p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
