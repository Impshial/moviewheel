import { Fragment } from "react";
import { chatLinks } from "@/lib/chat-links";

export function MessageText({ text }: { text: string | null }) {
  const value = text ?? "";
  const links = chatLinks(value);
  return (
    <span className="message-text">
      {links.map((link, index) => {
        const before = value.slice(links[index - 1]?.lastIndex ?? 0, link.index);
        return (
          <Fragment key={link.index}>
            {before}
            <a href={link.href} target="_blank" rel="noopener noreferrer">
              {link.raw}
            </a>
          </Fragment>
        );
      })}
      {value.slice(links.at(-1)?.lastIndex ?? 0)}
    </span>
  );
}
