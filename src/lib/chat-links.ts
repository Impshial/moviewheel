import { LinkifyIt } from "linkify-it";

const linkify = new LinkifyIt({ fuzzyLink: true, fuzzyEmail: false })
  .add("ftp:", null)
  .add("mailto:", null);

export function chatLinks(text: string) {
  return (linkify.match(text) ?? []).flatMap((match) => {
    const url = match.schema === "" ? `https://${match.raw}` : match.url;
    const href = url.startsWith("//") ? `https:${url}` : url;
    return /^https?:\/\//i.test(href) ? [{ ...match, href }] : [];
  });
}
