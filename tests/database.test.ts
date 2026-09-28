import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { SORTS, MOVIE_VIEWS } from "@/lib/types";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";

let db: PGlite;
const authIds = Array.from({ length: 5 }, (_, i) => `20000000-0000-4000-8000-00000000000${i + 1}`);
const memberIds = Array.from(
  { length: 5 },
  (_, i) => `10000000-0000-4000-8000-00000000000${i + 1}`,
);
const names = ["abby", "darren", "elisabeth", "hannah", "paul"];
async function member<T = Record<string, unknown>>(
  index: number,
  sql: string,
  values: unknown[] = [],
) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
      authIds[index] || "30000000-0000-4000-8000-000000000001",
    ]);
    return (await tx.query<T>(sql, values)).rows;
  });
}
async function cacheMovie(id = "tt1234567") {
  await db.query(
    "insert into public.omdb_cache values($1,$2,now()+interval '1 day',now()) on conflict(cache_key) do nothing",
    [
      `movie:${id}`,
      JSON.stringify({
        imdb_id: id,
        title: "Alien",
        release_year: 1979,
        poster_url: "https://example.test/poster.jpg",
      }),
    ],
  );
}
async function add(index = 0, id = "tt1234567") {
  return (
    await member<{ result: { movie_id: string; outcome: string } }>(
      index,
      "select public.add_movie($1) result",
      [id],
    )
  )[0].result;
}
async function staged(index = 0, size = 100, bucket = "chat-images", uploaded = true) {
  const id = crypto.randomUUID();
  const result = await member<{ item: { object_path: string } }>(
    index,
    "select public.register_upload($1,$2,'image/png',$3,null,null) item",
    [id, bucket, size],
  );
  const path = result[0].item.object_path;
  if (uploaded)
    await db.query("insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)", [
      bucket,
      path,
      JSON.stringify({ size, mimetype: "image/png" }),
    ]);
  return id;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage; create schema realtime;
    create table auth.users(id uuid primary key,email text unique);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    create table realtime.messages(id bigint);
    alter table realtime.messages enable row level security;
    create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic',true) $$;
    grant usage on schema public,auth,storage,realtime to anon,authenticated,service_role;
    grant select,insert on storage.objects,realtime.messages to authenticated;
    create publication supabase_realtime;
  `);
  const migrations = new URL("../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(migrations)).filter((file) => file.endsWith(".sql")).sort())
    await db.exec(await readFile(new URL(file, migrations), "utf8"));
  for (let i = 0; i < 5; i++)
    await db.query("insert into auth.users values($1,$2)", [
      authIds[i],
      `${names[i]}@movie-wheel.invalid`,
    ]);
}, 60000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(
    "truncate public.movies,public.movie_nights,public.chat_messages,public.upload_objects,public.omdb_cache,storage.objects cascade",
  );
  await db.exec(
    "update public.user_profiles set avatar_bucket=null,avatar_path=null,avatar_option_id=null,preferred_movie_sort='most-votes'; update storage.buckets set file_size_limit=null",
  );
  await cacheMovie();
});

describe("actual PostgreSQL migration and atomic rules", () => {
  it.each(Object.keys(MOVIE_VIEWS))(
    "persists the %s movie view for only the caller",
    async (view) => {
      await db.exec("update public.user_profiles set preferred_movie_view='cards'");
      await member(0, "select public.set_movie_view($1)", [view]);
      expect(
        (
          await db.query<{ preferred_movie_view: string }>(
            "select preferred_movie_view from public.user_profiles order by id",
          )
        ).rows.map((row) => row.preferred_movie_view),
      ).toEqual([view, "cards", "cards", "cards", "cards"]);
      await expect(member(0, "select public.set_movie_view('invalid')")).rejects.toThrow();
      await expect(member(8, "select public.set_movie_view('list')")).rejects.toThrow(
        "authentication required",
      );
    },
  );
  it("deletes only the sender's message, detaches images, and prevents retry resurrection", async () => {
    const upload = await staged(0);
    const key = crypto.randomUUID();
    const [{ id }] = await member<{ id: string }>(
      0,
      "select public.send_message($1,'remove this',$2) id",
      [key, [upload]],
    );
    await expect(member(1, "select public.delete_message($1)", [id])).rejects.toThrow("your own");
    await expect(member(8, "select public.delete_message($1)", [id])).rejects.toThrow(
      "authentication required",
    );
    await expect(member(0, "delete from public.chat_messages where id=$1", [id])).rejects.toThrow(
      "permission denied",
    );
    const [{ ids }] = await member<{ ids: string[] }>(0, "select public.delete_message($1) ids", [
      id,
    ]);
    expect(ids).toEqual([upload]);
    const [{ message_text, deleted_at }] = await member(
      1,
      "select * from public.chat_messages where id=$1",
      [id],
    );
    expect(message_text).toBeNull();
    expect(deleted_at).toBeTruthy();
    expect(
      await member(1, "select * from public.chat_attachments where message_id=$1", [id]),
    ).toEqual([]);
    expect(
      (await db.query("select state from public.upload_objects where id=$1", [upload])).rows[0],
    ).toMatchObject({ state: "deleting" });
    expect(await member(0, "select public.delete_message($1) ids", [id])).toEqual([{ ids: [] }]);
    expect(
      await member(0, "select public.send_message($1,'remove this',$2) id", [key, [upload]]),
    ).toEqual([{ id }]);
    expect(await member(1, "select * from public.chat_messages where deleted_at is null")).toEqual(
      [],
    );
  });
  it.each(Object.keys(SORTS))("persists the %s preference for only the caller", async (sort) => {
    await member(0, "select public.update_preferences('#123456',$1)", [sort]);
    const { rows } = await db.query<{ preferred_movie_sort: string }>(
      "select preferred_movie_sort from public.user_profiles order by id",
    );
    expect(rows.map((row) => row.preferred_movie_sort)).toEqual([
      sort,
      "most-votes",
      "most-votes",
      "most-votes",
      "most-votes",
    ]);
    await expect(
      member(0, "select public.update_preferences('#123456','invalid')"),
    ).rejects.toThrow();
  });
  it("creates exactly five seeded identities and rejects account reclaims", async () => {
    expect((await db.query("select * from public.user_profiles")).rows).toHaveLength(5);
    await expect(
      db.query("insert into auth.users values($1,'abby@movie-wheel.invalid')", [
        crypto.randomUUID(),
      ]),
    ).rejects.toThrow();
    await expect(
      db.query("insert into auth.users values($1,'outsider@example.test')", [crypto.randomUUID()]),
    ).rejects.toThrow("Unknown");
    expect(
      (
        await db.query<{ auth_user_id: string }>(
          "select auth_user_id from public.user_profiles where member_key='abby'",
        )
      ).rows[0].auth_user_id,
    ).toBe(authIds[0]);
  });
  it("adds and votes atomically and preserves all three duplicate outcomes", async () => {
    const first = await add(0);
    expect(first.outcome).toBe("added");
    expect((await add(1)).outcome).toBe("existing_vote_added");
    expect((await add(1)).outcome).toBe("already_voted");
    expect((await db.query("select * from public.movies")).rows).toHaveLength(1);
    expect((await db.query("select * from public.movie_votes")).rows).toHaveLength(2);
  });
  it("serializes overlapping duplicate submissions without duplicate rows", async () => {
    const results = await Promise.all([add(0), add(1), add(0)]);
    expect(results.map((r) => r.outcome)).toEqual([
      "added",
      "existing_vote_added",
      "already_voted",
    ]);
  });
  it("allows all five votes, idempotent voting, and removing only the caller's vote", async () => {
    const movie = await add();
    for (let i = 0; i < 5; i++)
      await member(i, "select public.set_vote($1,true)", [movie.movie_id]);
    expect((await db.query("select * from public.movie_votes")).rows).toHaveLength(5);
    await member(1, "select public.set_vote($1,false)", [movie.movie_id]);
    expect(
      (await db.query("select * from public.movie_votes where user_id=$1", [memberIds[0]])).rows,
    ).toHaveLength(1);
    await expect(
      member(1, "delete from public.movie_votes where user_id=$1", [memberIds[0]]),
    ).rejects.toThrow("permission denied");
  });
  it("allows another member to edit the schedule and delete a movie while retaining snapshots", async () => {
    const movie = await add();
    const [{ id }] = await member<{ id: string }>(
      0,
      "select public.save_movie_night(null,'Movie Night!','2026-10-05T23:30:00Z',$1,$2) id",
      [[memberIds[0], memberIds[1]], [movie.movie_id]],
    );
    await member(
      1,
      "select public.save_movie_night($1,'Updated night','2026-10-06T23:30:00Z',$2,$3)",
      [id, [memberIds[2]], [movie.movie_id]],
    );
    await member(2, "delete from public.movies where id=$1", [movie.movie_id]);
    const snapshots = (await member(0, "select * from public.movie_night_movies")).map((r) => r);
    expect(snapshots[0]).toMatchObject({
      movie_id: null,
      movie_title_snapshot: "Alien",
      movie_year_snapshot: 1979,
    });
    expect((await db.query("select * from public.movie_votes")).rows).toHaveLength(0);
    expect((await db.query("select title from public.movie_nights")).rows[0]).toMatchObject({
      title: "Updated night",
    });
  });
  it("denies unrelated authenticated accounts and forged profile changes", async () => {
    expect(await member(8, "select * from public.user_profiles")).toEqual([]);
    await expect(add(8)).rejects.toThrow("authentication required");
    await expect(
      member(0, "update public.user_profiles set auth_user_id=$1 where id=$2", [
        authIds[0],
        memberIds[1],
      ]),
    ).rejects.toThrow("permission denied");
    await member(0, "select public.update_preferences('#123456','year')");
    expect(
      (
        await db.query("select preferred_movie_sort from public.user_profiles where id=$1", [
          memberIds[1],
        ])
      ).rows[0],
    ).toMatchObject({ preferred_movie_sort: "most-votes" });
    await expect(member(0, "select public.update_preferences('#ffffff','year')")).rejects.toThrow(
      "darker",
    );
  });
  it("does not publish failed uploads, supports >4 images and >5 MB, and deduplicates retries", async () => {
    await db.exec("update storage.buckets set file_size_limit=52428800");
    const missing = await staged(0, 100, "chat-images", false);
    const key = crypto.randomUUID();
    await expect(
      member(0, "select public.send_message($1,'text',$2)", [key, [missing]]),
    ).rejects.toThrow("Finish uploading");
    expect((await db.query("select * from public.chat_messages")).rows).toHaveLength(0);
    const ids = [];
    for (let i = 0; i < 6; i++) ids.push(await staged(0, i === 0 ? 10 * 1024 * 1024 : 100));
    const [{ id }] = await member<{ id: string }>(
      0,
      "select public.send_message($1,'six images',$2) id",
      [key, ids],
    );
    const retry = await member<{ id: string }>(
      0,
      "select public.send_message($1,'six images',$2) id",
      [key, ids],
    );
    expect(retry[0].id).toBe(id);
    expect((await db.query("select * from public.chat_attachments")).rows).toHaveLength(6);
    expect((await db.query("select * from public.chat_messages")).rows).toHaveLength(1);
    expect((await member(1, "select * from storage.objects")).length).toBe(6);
  });
  it("accepts image-only and text-only messages but not whitespace-only messages", async () => {
    await member(0, "select public.send_message($1,'Hello','{}')", [crypto.randomUUID()]);
    await member(1, "select public.send_message($1,'',$2)", [
      crypto.randomUUID(),
      [await staged(1)],
    ]);
    await expect(
      member(0, "select public.send_message($1,'   ','{}')", [crypto.randomUUID()]),
    ).rejects.toThrow("Write a message");
    expect((await db.query("select * from public.chat_messages")).rows).toHaveLength(2);
  });
  it("cannot attach another member's upload or delete a committed attachment during cleanup", async () => {
    const upload = await staged(0);
    await expect(
      member(1, "select public.send_message($1,'stolen',$2)", [crypto.randomUUID(), [upload]]),
    ).rejects.toThrow("unavailable");
    await member(0, "select public.send_message($1,'mine',$2)", [crypto.randomUUID(), [upload]]);
    await member(0, "select public.abandon_uploads($1)", [[upload]]);
    expect(
      (
        await db.query<{ state: string }>("select state from public.upload_objects where id=$1", [
          upload,
        ])
      ).rows[0].state,
    ).toBe("attached");
    expect((await db.query("select * from public.claim_abandoned_uploads()")).rows).toHaveLength(0);
  });
  it("cleanup claims abandoned records so a racing finalization cannot reference removed files", async () => {
    const upload = await staged(0);
    await db.query(
      "update public.upload_objects set touched_at=now()-interval '25 hours' where id=$1",
      [upload],
    );
    expect((await db.query("select * from public.claim_abandoned_uploads()")).rows).toHaveLength(1);
    await expect(
      member(0, "select public.send_message($1,'late',$2)", [crypto.randomUUID(), [upload]]),
    ).rejects.toThrow("unavailable");
  });
  it("replaces an avatar using a new path while all members can read it", async () => {
    const first = await staged(0, 100, "avatars");
    await member(0, "select public.set_avatar($1,null)", [first]);
    const second = await staged(0, 100, "avatars");
    await member(0, "select public.set_avatar($1,null)", [second]);
    await member(0, "select public.set_avatar($1,null)", [second]);
    expect(
      (
        await db.query<{ state: string }>("select state from public.upload_objects where id=$1", [
          first,
        ])
      ).rows[0].state,
    ).toBe("deleting");
    expect((await member(1, "select * from storage.objects")).length).toBe(2);
    expect(
      (
        await db.query<{ avatar_path: string }>(
          "select avatar_path from public.user_profiles where id=$1",
          [memberIds[0]],
        )
      ).rows[0].avatar_path,
    ).toContain(second);
  });
  it("selects a supplied preset without exposing ownership writes to another member", async () => {
    const option = crypto.randomUUID();
    await db.query(
      "insert into public.avatar_options(id,name,storage_path) values($1,'Test preset','test/preset.png')",
      [option],
    );
    await db.exec(
      "insert into storage.objects(bucket_id,name,metadata) values('avatar-presets','test/preset.png','{}')",
    );
    await member(0, "select public.set_avatar(null,$1)", [option]);
    const mine = (
      await member(1, "select avatar_bucket,avatar_path from public.user_profiles where id=$1", [
        memberIds[0],
      ])
    )[0];
    expect(mine).toMatchObject({ avatar_bucket: "avatar-presets", avatar_path: "test/preset.png" });
    await expect(
      member(1, "update public.user_profiles set avatar_path=null where id=$1", [memberIds[0]]),
    ).rejects.toThrow("permission denied");
    expect(
      await member(1, "select * from storage.objects where bucket_id='avatar-presets'"),
    ).toHaveLength(1);
  });
});
