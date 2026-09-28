import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}
export function failure(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  if (error instanceof ZodError)
    return json({ error: error.issues[0]?.message || "Check the entered values." }, 400);
  // Do not serialize upstream error objects, request headers, credentials, or URLs containing API keys.
  return json({ error: "The service could not complete this request. Please try again." }, 503);
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  // Next can normalize request.url to its internal hostname. The incoming Host
  // remains the browser-facing authority, both locally and behind Vercel.
  const url = new URL(request.url);
  const protocol =
    request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || url.protocol.slice(0, -1);
  const host = request.headers.get("host") || url.host;
  if (!origin || origin !== `${protocol}://${host}`)
    throw new HttpError("Request origin was not accepted.", 403);
}
