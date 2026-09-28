import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

const file = new URL("../.env.local", import.meta.url);
let content;
try {
  content = await readFile(file, "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  content = await readFile(new URL("../.env.example", import.meta.url), "utf8");
}
const entry = content.match(/^PIN_AUTH_SECRET=(.*)$/m);
if (entry && entry[1].trim()) {
  console.log(".env.local already has a PIN secret. Preserved it unchanged.");
} else {
  const secret = randomBytes(32).toString("hex");
  content = entry
    ? content.replace(/^PIN_AUTH_SECRET=.*$/m, `PIN_AUTH_SECRET=${secret}`)
    : `${content}\nPIN_AUTH_SECRET=${secret}\n`;
  await writeFile(file, content, { mode: 0o600 });
  console.log(
    "Created .env.local with a one-time PIN secret. Its value has not been printed. Fill in the service credentials and preserve this file.",
  );
}
