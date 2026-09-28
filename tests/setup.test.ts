import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("rejects a copied Data API URL before attempting hosted setup", () => {
  let failure = "";
  try {
    execFileSync(
      process.execPath,
      [fileURLToPath(new URL("../scripts/setup-supabase.mjs", import.meta.url))],
      {
        env: {
          ...process.env,
          NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co/rest/v1/",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-public",
          SUPABASE_SECRET_KEY: "test-secret",
          SUPABASE_ACCESS_TOKEN: "test-access",
          SUPABASE_DB_PASSWORD: "test-password",
          PIN_AUTH_SECRET: "test-pin-secret",
        },
        stdio: "pipe",
        timeout: 10000,
      },
    );
  } catch (error) {
    failure = String((error as { stderr?: Buffer }).stderr ?? "");
  }
  expect(failure).toContain("must be the project base URL");
  expect(failure).toContain("No setup changes applied");
  expect(failure).not.toContain("test-secret");
});
