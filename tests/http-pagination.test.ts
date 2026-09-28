import { describe, it, expect } from "vitest";
import { sameOrigin } from "@/lib/http";
import { readAll } from "@/lib/pagination";

describe("browser-facing request origins", () => {
  it("accepts the public host when Next normalizes the internal URL", () => {
    expect(() =>
      sameOrigin(
        new Request("http://localhost:3100/api/auth/login", {
          headers: { host: "127.0.0.1:3100", origin: "http://127.0.0.1:3100" },
        }),
      ),
    ).not.toThrow();
    expect(() =>
      sameOrigin(
        new Request("http://localhost/api/auth/login", {
          headers: {
            host: "movies.example.test",
            origin: "https://movies.example.test",
            "x-forwarded-proto": "https",
          },
        }),
      ),
    ).not.toThrow();
  });
  it("rejects missing or cross-site origins", () => {
    expect(() => sameOrigin(new Request("https://movies.example.test/api/auth/login"))).toThrow();
    expect(() =>
      sameOrigin(
        new Request("https://movies.example.test/api/auth/login", {
          headers: { host: "movies.example.test", origin: "https://unrelated.example.test" },
        }),
      ),
    ).toThrow();
  });
});
it("reads every row even when the project API cap is lower than the requested page", async () => {
  const rows = Array.from({ length: 1123 }, (_, i) => i);
  const result = await readAll<number>(async (from) => ({
    data: rows.slice(from, from + 100),
    error: null,
  }));
  expect(result.data).toEqual(rows);
});
