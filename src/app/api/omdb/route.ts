import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { failure, json } from "@/lib/http";
import { getMovie, searchMovies } from "@/lib/omdb";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    await requireMember();
    const params = new URL(request.url).searchParams;
    if (params.has("id"))
      return json(
        await getMovie(
          z
            .string()
            .regex(/^tt\d{7,10}$/)
            .parse(params.get("id")),
        ),
      );
    const query = z.string().trim().min(1).max(200).parse(params.get("query"));
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .parse(params.get("page") || 1);
    return json(await searchMovies(query, page));
  } catch (error) {
    return failure(error);
  }
}
