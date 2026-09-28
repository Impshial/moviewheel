// Isolated test-only Supabase protocol fixture. The real application has no test/demo bypass.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { createHmac, randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { WebSocketServer } from "ws";

const db = new PGlite();
await db.exec(`
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema storage; create schema realtime;
 create table auth.users(id uuid primary key,email text unique);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
 alter table storage.objects enable row level security;
 create table realtime.messages(id bigint); alter table realtime.messages enable row level security;
 create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic',true) $$;
 grant usage on schema public,auth,storage,realtime to anon,authenticated,service_role;
 grant select,insert on storage.objects,realtime.messages to authenticated;
 create publication supabase_realtime;
`);
const migrations = new URL("../../supabase/migrations/", import.meta.url);
for (const file of (await readdir(migrations)).filter((file) => file.endsWith(".sql")).sort())
  await db.exec(await readFile(new URL(file, migrations), "utf8"));
await db.exec("update storage.buckets set file_size_limit=10485760");
const auth = new Map();
const tokens = new Map();
const files = new Map();
const sockets = new Set();
const calls = [];
let signSequence = 0;
const makeUser = (id, email) => ({
  id,
  email,
  aud: "authenticated",
  role: "authenticated",
  email_confirmed_at: new Date().toISOString(),
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  identities: [],
  created_at: new Date().toISOString(),
});
function makeSession(user) {
  const payload = {
    sub: user.id,
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    aud: "authenticated",
    role: "authenticated",
    session_id: randomUUID(),
  };
  const access = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "test-signature",
  ].join(".");
  const refresh = randomUUID();
  tokens.set(access, user);
  tokens.set(refresh, user);
  return {
    access_token: access,
    refresh_token: refresh,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: payload.exp,
    user,
  };
}
function credential(member, pin) {
  return (
    "Mw1!" +
    createHmac("sha256", "movie-wheel-test-only-secret-do-not-deploy")
      .update(`movie-wheel:pin:v1\0${member}\0${pin}`)
      .digest("base64url")
  );
}
async function run(user, sql, params = [], admin = false) {
  if (admin) return (await db.query(sql, params)).rows;
  return db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
      user?.id || "00000000-0000-4000-8000-000000000000",
    ]);
    return (await tx.query(sql, params)).rows;
  });
}
function send(ws, topic, event, payload, ref = null, joinRef = null) {
  if (ws.readyState === 1)
    ws.send(
      JSON.stringify(
        ws.v2
          ? [joinRef, ref, topic, event, payload]
          : { topic, event, payload, ref, join_ref: joinRef },
      ),
    );
}
function presence(topic) {
  const state = {};
  for (const ws of sockets) {
    const c = ws.channels.get(topic);
    if (c?.presence)
      state[c.presence.connection_id] = { metas: [{ ...c.presence, phx_ref: c.presenceRef }] };
  }
  for (const ws of sockets) if (ws.channels.has(topic)) send(ws, topic, "presence_state", state);
}
function changed(table, type = "INSERT", record = {}) {
  for (const ws of sockets)
    for (const [topic, channel] of ws.channels) {
      const ids = channel.filters
        .filter((f) => f.table === table && (f.event === "*" || f.event === type))
        .map((f) => f.id);
      if (ids.length)
        send(ws, topic, "postgres_changes", {
          ids,
          data: {
            schema: "public",
            table,
            type,
            record,
            old_record: record,
            columns: [],
            commit_timestamp: new Date().toISOString(),
            errors: null,
          },
        });
    }
}
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:54329");
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "authorization,apikey,content-type,x-client-info,x-supabase-api-version,x-upsert,prefer,accept,range,range-unit,accept-profile,content-profile",
  );
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }
  const respond = (data, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    const body =
      bytes.length && req.headers["content-type"]?.includes("application/json")
        ? JSON.parse(bytes.toString())
        : {};
    const bearer = req.headers.authorization?.replace(/^Bearer /, "");
    const user = tokens.get(bearer);
    const admin = req.headers.apikey === "test-server-key" || bearer === "test-server-key";
    calls.push({ method: req.method, path: url.pathname });
    if (url.pathname === "/health") {
      respond({ ok: true });
      return;
    }
    if (url.pathname === "/__test/shutdown") {
      respond({ ok: true });
      setTimeout(shutdown, 100);
      return;
    }
    if (url.pathname === "/__test/reset") {
      for (const ws of sockets) ws.close();
      auth.clear();
      tokens.clear();
      files.clear();
      calls.length = 0;
      await db.exec(
        "truncate public.movies,public.movie_nights,public.chat_messages,public.upload_objects,public.omdb_cache,storage.objects cascade; update public.user_profiles set auth_user_id=null,avatar_bucket=null,avatar_path=null,avatar_option_id=null,preferred_movie_sort='most-votes',preferred_movie_view='cards'; delete from auth.users;",
      );
      if (body.claimed)
        for (const name of ["abby", "darren", "elisabeth", "hannah", "paul"]) {
          const id = randomUUID();
          const email = `${name}@movie-wheel.invalid`;
          await db.query("insert into auth.users values($1,$2)", [id, email]);
          auth.set(email, { user: makeUser(id, email), password: credential(name, "001234") });
        }
      if (body.movies) {
        const moon = {
          imdb_id: "tt1182345",
          title: "Moon",
          release_year: 2009,
          poster_url: null,
          director: null,
        };
        for (const [key, value] of [
          ["movie:tt1182345", moon],
          ["search:moon:1", { movies: [moon], total: 1 }],
        ])
          await db.query(
            "insert into public.omdb_cache values($1,$2,now()+interval '1 day',now())",
            [key, JSON.stringify(value)],
          );
        const members = (
          await db.query("select id from public.user_profiles order by display_name")
        ).rows;
        for (const [i, title] of [
          "Alien",
          "Arrival",
          "The Grand Budapest Hotel",
          "The Thing",
          "Before Sunrise",
          "Blade Runner",
        ].entries()) {
          const id = randomUUID();
          await db.query(
            "insert into public.movies(id,imdb_id,title,release_year,poster_url,director,plot,added_by_user_id) values($1,$2,$3,$4,$5,$6,$7,$8)",
            [
              id,
              `tt${String(1000000 + i)}`,
              title,
              1979 + i * 7,
              `http://127.0.0.1:54329/poster/${i}`,
              "Director name",
              "A memorable story for your next movie night.",
              members[i % 5].id,
            ],
          );
          for (let voter = 0; voter < (i < 4 ? 3 : 1); voter++)
            await db.query("insert into public.movie_votes(movie_id,user_id) values($1,$2)", [
              id,
              members[voter].id,
            ]);
        }
      }
      respond({ ok: true });
      return;
    }
    if (url.pathname === "/__test/calls") {
      respond(calls);
      return;
    }
    if (url.pathname === "/__test/history") {
      for (let i = 0; i < 140; i++)
        await db.query(
          "insert into public.chat_messages(user_id,client_message_id,message_text,created_at) values('10000000-0000-4000-8000-000000000001',$1,$2,now()-($3::integer*interval '1 minute'))",
          [randomUUID(), `Earlier message ${i}`, 150 - i],
        );
      respond({ ok: true });
      return;
    }
    if (url.pathname === "/__test/signed-count") {
      respond({ count: signSequence });
      return;
    }
    if (url.pathname.startsWith("/poster/")) {
      const i = Number(url.pathname.split("/").pop());
      const colors = ["#344956", "#976452", "#456875", "#423946", "#76604d", "#28505a"];
      const labels = [
        "ALIEN",
        "ARRIVAL",
        "GRAND\nBUDAPEST",
        "THE THING",
        "BEFORE\nSUNRISE",
        "BLADE\nRUNNER",
      ];
      res.writeHead(200, { "Content-Type": "image/svg+xml" });
      res.end(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450"><rect width="300" height="450" fill="${colors[i]}"/><circle cx="150" cy="175" r="90" fill="#ffffff10"/><path d="M0 450L150 130L300 450" fill="#00000033"/><text x="150" y="340" text-anchor="middle" fill="#f4e8d3" font-family="Georgia" font-size="27">${labels[
          i
        ]
          .split("\n")
          .map((t, j) => `<tspan x="150" dy="${j ? 35 : 0}">${t}</tspan>`)
          .join("")}</text></svg>`,
      );
      return;
    }
    if (url.pathname === "/auth/v1/admin/users" && req.method === "POST" && admin) {
      const id = randomUUID();
      await db.query("insert into auth.users values($1,$2)", [id, body.email]);
      const newUser = makeUser(id, body.email);
      auth.set(body.email, { user: newUser, password: body.password });
      respond(newUser);
      changed("user_profiles", "UPDATE");
      return;
    }
    if (url.pathname === "/auth/v1/token") {
      if (url.searchParams.get("grant_type") === "refresh_token") {
        const who = tokens.get(body.refresh_token);
        if (!who) {
          respond({ msg: "Invalid refresh token" }, 401);
          return;
        }
        respond(makeSession(who));
        return;
      }
      const account = auth.get(body.email);
      if (!account || account.password !== body.password) {
        respond({ code: "invalid_credentials", msg: "Invalid login credentials" }, 400);
        return;
      }
      respond(makeSession(account.user));
      return;
    }
    if (url.pathname === "/auth/v1/user") {
      if (!user) {
        respond({ msg: "Invalid JWT" }, 401);
        return;
      }
      if (req.method === "PUT") {
        const account = auth.get(user.email);
        if (body.current_password !== account.password) {
          respond({ msg: "Current password is incorrect" }, 400);
          return;
        }
        account.password = body.password;
      }
      respond(user);
      return;
    }
    if (url.pathname === "/auth/v1/logout") {
      tokens.delete(bearer);
      respond({});
      return;
    }
    if (url.pathname.startsWith("/storage/v1/bucket/")) {
      if (!admin) {
        respond({}, 403);
        return;
      }
      const id = url.pathname.split("/").pop();
      respond((await db.query("select * from storage.buckets where id=$1", [id])).rows[0]);
      return;
    }
    const info = url.pathname.match(/^\/storage\/v1\/object\/info\/([^/]+)\/(.+)$/);
    if (info) {
      const found = files.get(`${info[1]}/${decodeURIComponent(info[2])}`);
      if (!found) {
        respond({ message: "Not found" }, 404);
        return;
      }
      respond({
        size: found.bytes.length,
        contentType: found.mime,
        metadata: { size: found.bytes.length, mimetype: found.mime },
      });
      return;
    }
    const sign = url.pathname.match(/^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/);
    if (sign) {
      const key = `${sign[1]}/${decodeURIComponent(sign[2])}`;
      if (req.method === "POST") {
        if (!user) {
          respond({}, 401);
          return;
        }
        signSequence++;
        respond({ signedURL: `/object/sign/${key}?token=test-${signSequence}` });
        return;
      }
      const file = files.get(key);
      if (!file) {
        respond({}, 404);
        return;
      }
      res.writeHead(200, { "Content-Type": file.mime });
      res.end(file.bytes);
      return;
    }
    const object = url.pathname.match(/^\/storage\/v1\/object\/([^/]+)(?:\/(.+))?$/);
    if (object && req.method === "POST") {
      const path = decodeURIComponent(object[2]);
      const mime = req.headers["content-type"];
      if (bytes.length > 10485760) {
        respond({ message: "Storage file size limit exceeded" }, 413);
        return;
      }
      await run(user, "insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)", [
        object[1],
        path,
        JSON.stringify({ size: bytes.length, mimetype: mime }),
      ]);
      files.set(`${object[1]}/${path}`, { bytes, mime });
      respond({ Key: `${object[1]}/${path}`, Id: randomUUID() });
      return;
    }
    if (object && req.method === "DELETE" && admin) {
      for (const path of body.prefixes) {
        files.delete(`${object[1]}/${path}`);
        await db.query("delete from storage.objects where bucket_id=$1 and name=$2", [
          object[1],
          path,
        ]);
      }
      respond([]);
      return;
    }
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/);
    if (rpc) {
      const args = Object.entries(body);
      if (args.some(([k]) => !/^p_[a-z_]+$/.test(k))) {
        respond({}, 400);
        return;
      }
      const rows = await run(
        user,
        `select to_jsonb(public.${rpc[1]}(${args.map(([k], i) => `${k} => $${i + 1}`).join(",")})) as result`,
        args.map(([, v]) => v),
        admin,
      );
      respond(rows[0]?.result ?? null);
      const changes = {
        add_movie: ["movies", "movie_votes"],
        set_vote: ["movie_votes"],
        save_movie_night: ["movie_nights"],
        send_message: ["chat_messages"],
        delete_message: ["chat_messages"],
        update_preferences: ["user_profiles"],
        set_movie_view: ["user_profiles"],
        set_avatar: ["user_profiles"],
      };
      (changes[rpc[1]] || []).forEach((table) =>
        changed(
          table,
          ["update_preferences", "set_avatar", "delete_message"].includes(rpc[1])
            ? "UPDATE"
            : "INSERT",
          rpc[1] === "delete_message" ? { id: body.p_message_id } : {},
        ),
      );
      return;
    }
    const tableMatch = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/);
    if (tableMatch) {
      const table = tableMatch[1];
      const params = [];
      const where = [];
      for (const [key, value] of url.searchParams) {
        if (!/^[a-z_]+$/.test(key)) continue;
        if (value === "is.null") {
          where.push(`t.${key} is null`);
        } else if (value.startsWith("eq.")) {
          params.push(value.slice(3));
          where.push(`t.${key}=$${params.length}`);
        } else if (value.startsWith("in.")) {
          params.push(value.slice(4, -1).split(","));
          where.push(`t.${key}=any($${params.length}::uuid[])`);
        }
      }
      const cursor = url.searchParams.get("or");
      if (cursor) {
        const match = cursor.match(
          /created_at\.(gt|lt)\.([^,]+),and\(created_at\.eq\.([^,]+),id\.(?:gt|lt)\.([^)]+)/,
        );
        if (match) {
          params.push(match[2], match[4]);
          where.push(
            `(t.created_at,t.id) ${match[1] === "gt" ? ">" : "<"} ($${params.length - 1}::timestamptz,$${params.length}::uuid)`,
          );
        }
      }
      const clause = where.length ? ` where ${where.join(" and ")}` : "";
      if (req.method === "DELETE") {
        await run(user, `delete from public.${table} t${clause}`, params, admin);
        respond(null);
        changed(table, "DELETE");
        return;
      }
      let fields = "t.*";
      const relation = (child, fk, alias = child) =>
        `,coalesce((select jsonb_agg(c.*) from public.${child} c where c.${fk}=t.id),'[]'::jsonb) ${alias}`;
      if (table === "movies") fields += relation("movie_votes", "movie_id");
      if (table === "movie_nights")
        fields +=
          relation("movie_night_hosts", "movie_night_id") +
          relation("movie_night_movies", "movie_night_id");
      if (table === "chat_messages") fields += relation("chat_attachments", "message_id");
      let order = "";
      const orderParam = url.searchParams.get("order");
      if (orderParam)
        order =
          " order by " +
          orderParam
            .split(",")
            .map((part) => {
              const [column, direction] = part.split(".");
              return /^[a-z_]+$/.test(column)
                ? `t.${column} ${direction === "desc" ? "desc" : "asc"}`
                : "t.id";
            })
            .join(",");
      const offset = Number(url.searchParams.get("offset")) || 0;
      const limit = Number(url.searchParams.get("limit"));
      const rows = await run(
        user,
        `select ${fields} from public.${table} t${clause}${order}${limit ? ` limit ${Math.min(1000, limit)}` : ""} offset ${offset}`,
        params,
        admin,
      );
      if (req.headers.accept?.includes("vnd.pgrst.object")) {
        if (!rows.length) {
          respond(
            { code: "PGRST116", details: "The result contains 0 rows", message: "Not found" },
            406,
          );
          return;
        }
        respond(rows[0]);
        return;
      }
      respond(rows);
      return;
    }
    respond({ error: "Unknown test fixture endpoint" }, 404);
  } catch (error) {
    respond({ message: error.message, code: error.code }, 400);
  }
});
const wsServer = new WebSocketServer({ server, path: "/realtime/v1/websocket" });
wsServer.on("connection", (ws) => {
  ws.id = randomUUID();
  ws.channels = new Map();
  sockets.add(ws);
  ws.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    ws.v2 = Array.isArray(message);
    const { topic, event, payload, ref, join_ref } = ws.v2
      ? {
          join_ref: message[0],
          ref: message[1],
          topic: message[2],
          event: message[3],
          payload: message[4],
        }
      : message;
    if (event === "heartbeat") {
      send(ws, topic, "phx_reply", { status: "ok", response: {} }, ref, join_ref);
      return;
    }
    if (event === "phx_join") {
      const user = tokens.get(payload.access_token);
      if (!user) {
        send(
          ws,
          topic,
          "phx_reply",
          { status: "error", response: { reason: "unauthorized" } },
          ref,
          join_ref,
        );
        return;
      }
      const filters = (payload.config.postgres_changes || []).map((f, i) => ({ ...f, id: i + 1 }));
      ws.channels.set(topic, { user, filters });
      send(
        ws,
        topic,
        "phx_reply",
        { status: "ok", response: { postgres_changes: filters } },
        ref,
        join_ref,
      );
      presence(topic);
      return;
    }
    if (event === "presence") {
      const channel = ws.channels.get(topic);
      if (channel && topic.endsWith(`member:${channel.user.id}`)) {
        if (payload.event === "track") {
          channel.presence = payload.payload;
          channel.presenceRef = randomUUID();
        }
        if (payload.event === "untrack") delete channel.presence;
        presence(topic);
      }
      send(ws, topic, "phx_reply", { status: "ok", response: {} }, ref, join_ref);
      return;
    }
    if (event === "phx_leave") {
      ws.channels.delete(topic);
      send(ws, topic, "phx_reply", { status: "ok", response: {} }, ref, join_ref);
      presence(topic);
    }
  });
  ws.on("close", () => {
    const topics = [...ws.channels.keys()];
    sockets.delete(ws);
    topics.forEach(presence);
  });
});
await new Promise((resolve) => server.listen(54329, "127.0.0.1", resolve));
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3100"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54329",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-public-key",
      SUPABASE_SECRET_KEY: "test-server-key",
      PIN_AUTH_SECRET: "movie-wheel-test-only-secret-do-not-deploy",
      OMDB_API_KEY: "test-key-not-used",
      NEXT_TELEMETRY_DISABLED: "1",
      MOVIE_WHEEL_E2E: "1",
    },
  },
);
function shutdown() {
  for (const ws of sockets) ws.terminate();
  child.kill();
  server.close();
  wsServer.close();
  void db.close();
  setTimeout(() => process.exit(0), 500).unref();
}
for (const event of ["SIGTERM", "SIGINT"]) process.on(event, shutdown);
child.on("exit", (code) => {
  server.close();
  wsServer.close();
  void db.close();
  process.exit(code || 0);
});
