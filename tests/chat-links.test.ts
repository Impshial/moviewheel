import { describe, expect, it } from "vitest";
import { chatLinks } from "@/lib/chat-links";

describe("chat URLs", () => {
  it("recognizes multiple URLs without swallowing surrounding punctuation", () => {
    const text =
      "Watch (https://example.com/Film_(2026)), then www.imdb.com/title/tt1234567.\nOr example.org!";
    const links = chatLinks(text);
    expect(links.map((link) => link.href)).toEqual([
      "https://example.com/Film_(2026)",
      "https://www.imdb.com/title/tt1234567",
      "https://example.org",
    ]);
    for (const link of links) expect(text.slice(link.index, link.lastIndex)).toBe(link.raw);
  });
  it("preserves explicit HTTP and HTTPS URLs and normalizes protocol-relative URLs", () => {
    expect(
      chatLinks("http://localhost:3000/movie?q=Alien#votes https://example.com //example.org").map(
        (link) => link.href,
      ),
    ).toEqual([
      "http://localhost:3000/movie?q=Alien#votes",
      "https://example.com",
      "https://example.org",
    ]);
  });
  it("does not turn executable schemes or plain email addresses into links", () => {
    expect(chatLinks("javascript:alert(1) data:text/html,hello person@example.com")).toEqual([]);
  });
});
