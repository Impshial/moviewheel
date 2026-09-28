-- Reproducible schema, member seeds, atomic operations, and security boundaries.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.user_profiles (
  id uuid primary key,
  member_key text not null unique check (member_key in ('abby','darren','elisabeth','hannah','paul')),
  display_name text not null unique,
  auth_user_id uuid unique references auth.users(id),
  avatar_bucket text,
  avatar_path text,
  avatar_option_id uuid,
  chat_name_color text not null,
  preferred_movie_sort text not null default 'most-votes'
    check (preferred_movie_sort in ('most-votes','alphabetical','year','my-votes')),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((avatar_bucket is null) = (avatar_path is null))
);

insert into public.user_profiles (id, member_key, display_name, chat_name_color) values
 ('10000000-0000-4000-8000-000000000001','abby','Abby','#9d174d'),
 ('10000000-0000-4000-8000-000000000002','darren','Darren','#1d4ed8'),
 ('10000000-0000-4000-8000-000000000003','elisabeth','Elisabeth','#047857'),
 ('10000000-0000-4000-8000-000000000004','hannah','Hannah','#7e22ce'),
 ('10000000-0000-4000-8000-000000000005','paul','Paul','#b45309');

create function public.current_member_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.user_profiles where auth_user_id = (select auth.uid())
$$;

create function private.require_member() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare member_id uuid := public.current_member_id();
begin
  if member_id is null then raise exception 'Member authentication required' using errcode = '42501'; end if;
  return member_id;
end $$;

-- Auth creates and binds a member in the SAME transaction. Metadata cannot claim a slot.
create function private.bind_member_identity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.user_profiles set auth_user_id = new.id, updated_at = now()
    where new.email = member_key || '@movie-wheel.invalid' and auth_user_id is null;
  if not found then raise exception 'Unknown or already claimed member'; end if;
  return new;
end $$;
create trigger bind_movie_wheel_member after insert on auth.users
  for each row execute function private.bind_member_identity();

create table public.avatar_options (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  storage_path text not null unique,
  enabled boolean not null default true,
  sort_order integer not null default 0
);
alter table public.user_profiles add foreign key (avatar_option_id) references public.avatar_options(id);

create table public.movies (
  id uuid primary key default gen_random_uuid(),
  imdb_id text not null unique check (imdb_id ~ '^tt[0-9]{7,10}$'),
  title text not null check (length(btrim(title)) > 0),
  release_year integer,
  poster_url text,
  director text,
  runtime_minutes integer,
  genre text,
  rated text,
  plot text,
  imdb_rating text,
  raw_metadata jsonb not null default '{}',
  added_by_user_id uuid not null references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.movie_votes (
  movie_id uuid not null references public.movies(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id),
  created_at timestamptz not null default now(),
  primary key(movie_id,user_id)
);
create index movie_votes_user_idx on public.movie_votes(user_id);

create table public.movie_nights (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0),
  starts_at timestamptz not null,
  timezone text not null default 'America/New_York' check (timezone = 'America/New_York'),
  created_by_user_id uuid not null references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index movie_nights_time_idx on public.movie_nights(starts_at);
create table public.movie_night_hosts (
  movie_night_id uuid not null references public.movie_nights(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id),
  primary key(movie_night_id,user_id)
);
create table public.movie_night_movies (
  id uuid primary key default gen_random_uuid(),
  movie_night_id uuid not null references public.movie_nights(id) on delete cascade,
  movie_id uuid references public.movies(id) on delete set null,
  movie_title_snapshot text not null,
  movie_year_snapshot integer,
  movie_poster_snapshot text,
  created_at timestamptz not null default now(),
  unique(movie_night_id,movie_id)
);
create index night_movies_movie_idx on public.movie_night_movies(movie_id);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id),
  client_message_id uuid not null,
  message_text text,
  created_at timestamptz not null default clock_timestamp(),
  unique(user_id,client_message_id)
);
create index chat_messages_cursor_idx on public.chat_messages(created_at desc,id desc);
create table public.upload_objects (
  id uuid primary key,
  user_id uuid not null references public.user_profiles(id),
  bucket text not null check (bucket in ('chat-images','avatars')),
  object_path text not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','image/gif')),
  file_size bigint not null check (file_size > 0),
  width integer,
  height integer,
  state text not null default 'pending' check (state in ('pending','attached','deleting')),
  created_at timestamptz not null default now(),
  touched_at timestamptz not null default now(),
  unique(bucket,object_path)
);
create index upload_objects_cleanup_idx on public.upload_objects(state,touched_at);
create table public.chat_attachments (
  id uuid primary key references public.upload_objects(id),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  uploaded_by_user_id uuid not null references public.user_profiles(id),
  storage_bucket text not null default 'chat-images',
  storage_path text not null unique,
  mime_type text not null,
  file_size bigint not null,
  width integer,
  height integer,
  sort_order integer not null,
  created_at timestamptz not null default now()
);
create index chat_attachments_message_idx on public.chat_attachments(message_id);

-- Server-only metadata cache and quota accounting; this is NOT login throttling.
create table public.omdb_cache (
  cache_key text primary key,
  payload jsonb not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create table private.omdb_usage (day date primary key, requests integer not null);
create function public.reserve_omdb_request() returns boolean
language plpgsql security definer set search_path = '' as $$
declare total integer;
begin
  insert into private.omdb_usage values ((now() at time zone 'UTC')::date,1)
  on conflict (day) do update set requests = private.omdb_usage.requests + 1
    where private.omdb_usage.requests < 1000 returning requests into total;
  return total is not null;
end $$;

create function public.add_movie(p_imdb_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare member_id uuid := private.require_member(); movie public.movies; metadata jsonb;
  added boolean := false; voted boolean := false;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_imdb_id,0));
  select * into movie from public.movies where imdb_id = p_imdb_id for update;
  if not found then
    select payload into metadata from public.omdb_cache where cache_key = 'movie:' || p_imdb_id;
    if metadata is null or metadata->>'imdb_id' <> p_imdb_id then
      raise exception 'Load movie details before adding this movie';
    end if;
    insert into public.movies(imdb_id,title,release_year,poster_url,director,runtime_minutes,
      genre,rated,plot,imdb_rating,raw_metadata,added_by_user_id)
    values(p_imdb_id,metadata->>'title',(metadata->>'release_year')::integer,metadata->>'poster_url',
      metadata->>'director',(metadata->>'runtime_minutes')::integer,metadata->>'genre',metadata->>'rated',
      metadata->>'plot',metadata->>'imdb_rating',coalesce(metadata->'raw_metadata','{}'),member_id)
    returning * into movie;
    added := true;
  end if;
  insert into public.movie_votes(movie_id,user_id) values(movie.id,member_id)
    on conflict do nothing;
  voted := found;
  return jsonb_build_object('movie_id',movie.id,'title',movie.title,'outcome',
    case when added then 'added' when voted then 'existing_vote_added' else 'already_voted' end);
end $$;

create function public.set_vote(p_movie_id uuid,p_voted boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare member_id uuid := private.require_member();
begin
  if p_voted then
    insert into public.movie_votes(movie_id,user_id) values(p_movie_id,member_id) on conflict do nothing;
  else
    delete from public.movie_votes where movie_id = p_movie_id and user_id = member_id;
  end if;
end $$;

create function public.save_movie_night(p_id uuid,p_title text,p_starts_at timestamptz,
  p_host_ids uuid[],p_movie_ids uuid[],p_retained_snapshot_ids uuid[] default '{}') returns uuid
language plpgsql security definer set search_path = '' as $$
declare member_id uuid := private.require_member(); night_id uuid;
begin
  if nullif(btrim(p_title),'') is null or p_starts_at is null then raise exception 'Title, date, and time are required'; end if;
  if coalesce(cardinality(p_host_ids),0) = 0 then raise exception 'Choose at least one host'; end if;
  if p_id is null then
    insert into public.movie_nights(title,starts_at,created_by_user_id)
      values(btrim(p_title),p_starts_at,member_id) returning id into night_id;
  else
    update public.movie_nights set title=btrim(p_title), starts_at=p_starts_at, updated_at=clock_timestamp()
      where id=p_id returning id into night_id;
    if not found then raise exception 'This schedule entry was removed'; end if;
  end if;
  delete from public.movie_night_hosts where movie_night_id=night_id;
  insert into public.movie_night_hosts select night_id,id from unnest(p_host_ids) id group by id;
  -- Preserve explicitly retained snapshots, including movies removed from the active collection.
  delete from public.movie_night_movies where movie_night_id=night_id
    and not (id = any(coalesce(p_retained_snapshot_ids,'{}')))
    and (movie_id is null or not (movie_id = any(coalesce(p_movie_ids,'{}'))));
  insert into public.movie_night_movies(movie_night_id,movie_id,movie_title_snapshot,movie_year_snapshot,movie_poster_snapshot)
    select night_id,id,title,release_year,poster_url from public.movies
    where id=any(coalesce(p_movie_ids,'{}')) on conflict(movie_night_id,movie_id) do nothing;
  return night_id;
end $$;

create function public.register_upload(p_id uuid,p_bucket text,p_mime_type text,p_file_size bigint,
  p_width integer default null,p_height integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare member_id uuid := private.require_member(); item public.upload_objects; limit_bytes bigint;
begin
  select file_size_limit into limit_bytes from storage.buckets where id=p_bucket;
  if limit_bytes is not null and p_file_size > limit_bytes then raise exception 'This image exceeds the configured storage limit'; end if;
  insert into public.upload_objects(id,user_id,bucket,object_path,mime_type,file_size,width,height)
    values(p_id,member_id,p_bucket,auth.uid()::text || '/' || p_id::text,p_mime_type,p_file_size,p_width,p_height)
    on conflict (id) do nothing;
  select * into item from public.upload_objects where id=p_id and user_id=member_id;
  if not found or item.state <> 'pending' or item.bucket <> p_bucket
    or item.mime_type <> p_mime_type or item.file_size <> p_file_size then
    raise exception 'This upload is no longer available';
  end if;
  return to_jsonb(item);
end $$;

create function private.verify_upload(p_id uuid,p_member_id uuid,p_bucket text) returns public.upload_objects
language plpgsql security definer set search_path = '' as $$
declare item public.upload_objects; metadata jsonb;
begin
  select * into item from public.upload_objects where id=p_id for update;
  if not found or item.user_id <> p_member_id or item.bucket <> p_bucket or item.state <> 'pending' then
    raise exception 'Attachment is unavailable';
  end if;
  select o.metadata into metadata from storage.objects o where o.bucket_id=item.bucket and o.name=item.object_path;
  if metadata is null or (metadata->>'size')::bigint <> item.file_size
    or metadata->>'mimetype' is distinct from item.mime_type then
    raise exception 'Finish uploading all attachments before sending';
  end if;
  return item;
end $$;

create function public.send_message(p_client_message_id uuid,p_text text,p_upload_ids uuid[] default '{}')
returns uuid language plpgsql security definer set search_path = '' as $$
declare member_id uuid := private.require_member(); message_id uuid; upload_id uuid; item public.upload_objects;
  ordinal integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(member_id::text || p_client_message_id::text,0));
  select id into message_id from public.chat_messages where user_id=member_id and client_message_id=p_client_message_id;
  if found then return message_id; end if;
  if nullif(btrim(p_text),'') is null and coalesce(cardinality(p_upload_ids),0)=0 then raise exception 'Write a message or add an image'; end if;
  -- Lock in consistent order to prevent deadlocks when finalizations reference overlapping uploads.
  perform 1 from public.upload_objects where id=any(coalesce(p_upload_ids,'{}')) order by id for update;
  insert into public.chat_messages(user_id,client_message_id,message_text)
    values(member_id,p_client_message_id,nullif(btrim(p_text),'')) returning id into message_id;
  foreach upload_id in array coalesce(p_upload_ids,'{}') loop
    item := private.verify_upload(upload_id,member_id,'chat-images');
    insert into public.chat_attachments(id,message_id,uploaded_by_user_id,storage_path,mime_type,file_size,width,height,sort_order)
      values(item.id,message_id,member_id,item.object_path,item.mime_type,item.file_size,item.width,item.height,ordinal);
    update public.upload_objects set state='attached', touched_at=now() where id=item.id;
    ordinal := ordinal + 1;
  end loop;
  return message_id;
end $$;

create function public.keep_uploads(p_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.upload_objects set touched_at=now() where user_id=private.require_member()
    and state='pending' and id=any(p_ids);
end $$;
create function public.abandon_uploads(p_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.upload_objects set state='deleting',touched_at=now() where user_id=private.require_member()
    and state='pending' and id=any(p_ids);
end $$;
-- Maintenance-only: lock and claim stale drafts before Storage API deletion.
create function public.claim_abandoned_uploads() returns setof public.upload_objects
language plpgsql security definer set search_path = '' as $$
begin
  return query update public.upload_objects set state='deleting'
    where id in (select id from public.upload_objects
      where state='deleting' or (state='pending' and touched_at < now() - interval '24 hours')
      order by touched_at for update skip locked limit 100)
    returning *;
end $$;

create function private.readable_color(p_color text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare r double precision; g double precision; b double precision; luminance double precision;
begin
  if p_color is null or p_color !~ '^#[0-9a-fA-F]{6}$' then return false; end if;
  r := get_byte(decode(substr(p_color,2),'hex'),0)/255.0;
  g := get_byte(decode(substr(p_color,2),'hex'),1)/255.0;
  b := get_byte(decode(substr(p_color,2),'hex'),2)/255.0;
  r := case when r <= 0.04045 then r/12.92 else power((r+0.055)/1.055,2.4) end;
  g := case when g <= 0.04045 then g/12.92 else power((g+0.055)/1.055,2.4) end;
  b := case when b <= 0.04045 then b/12.92 else power((b+0.055)/1.055,2.4) end;
  luminance := 0.2126*r + 0.7152*g + 0.0722*b;
  return 1.05/(luminance+0.05) >= 4.5;
end $$;

create function public.update_preferences(p_color text,p_sort text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.readable_color(p_color) then raise exception 'Choose a darker color for readable text'; end if;
  update public.user_profiles set chat_name_color=p_color,preferred_movie_sort=p_sort,updated_at=now()
    where id=private.require_member();
end $$;
create function public.touch_last_seen() returns void
language sql security definer set search_path = '' as $$
  update public.user_profiles set last_seen_at=now() where id=private.require_member()
$$;
create function public.set_avatar(p_upload_id uuid default null,p_option_id uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare member_id uuid := private.require_member(); item public.upload_objects; option public.avatar_options;
  old_path text; old_bucket text;
begin
  select avatar_path,avatar_bucket into old_path,old_bucket from public.user_profiles where id=member_id for update;
  if p_upload_id is not null and p_option_id is not null then raise exception 'Choose one avatar'; end if;
  if p_upload_id is not null then
    -- A lost success response can safely retry the currently selected file.
    if exists(select 1 from public.upload_objects where id=p_upload_id and user_id=member_id
      and state='attached' and bucket='avatars' and object_path=old_path and old_bucket='avatars') then return; end if;
    item := private.verify_upload(p_upload_id,member_id,'avatars');
    update public.user_profiles set avatar_bucket='avatars',avatar_path=item.object_path,avatar_option_id=null,updated_at=now() where id=member_id;
    update public.upload_objects set state='attached',touched_at=now() where id=item.id;
  elsif p_option_id is not null then
    select * into option from public.avatar_options where id=p_option_id and enabled;
    if not found then raise exception 'This avatar is unavailable'; end if;
    update public.user_profiles set avatar_bucket='avatar-presets',avatar_path=option.storage_path,avatar_option_id=option.id,updated_at=now() where id=member_id;
  else
    update public.user_profiles set avatar_bucket=null,avatar_path=null,avatar_option_id=null,updated_at=now() where id=member_id;
  end if;
  if old_bucket='avatars' then
    update public.upload_objects set state='deleting',touched_at=now() where bucket=old_bucket and object_path=old_path
      and not exists(select 1 from public.user_profiles where avatar_bucket=old_bucket and avatar_path=old_path);
  end if;
end $$;

-- Explicit privileges: writes go through session-derived RPCs, except shared deletes.
do $$ declare table_name text; begin
  foreach table_name in array array['user_profiles','avatar_options','movies','movie_votes','movie_nights',
    'movie_night_hosts','movie_night_movies','chat_messages','chat_attachments','upload_objects','omdb_cache'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
  end loop;
  foreach table_name in array array['user_profiles','avatar_options','movies','movie_votes','movie_nights',
    'movie_night_hosts','movie_night_movies','chat_messages','chat_attachments'] loop
    execute format('grant select on public.%I to authenticated', table_name);
    execute format('create policy member_read on public.%I for select to authenticated using ((select public.current_member_id()) is not null)', table_name);
  end loop;
end $$;
grant select on public.upload_objects to authenticated;
create policy own_upload_read on public.upload_objects for select to authenticated using(user_id=(select public.current_member_id()));
grant delete on public.movies,public.movie_nights to authenticated;
create policy member_movie_delete on public.movies for delete to authenticated using((select public.current_member_id()) is not null);
create policy member_night_delete on public.movie_nights for delete to authenticated using((select public.current_member_id()) is not null);

-- Restrict all security-definer entry points by role, including newly added overloads.
revoke all on all functions in schema private from public,anon,authenticated;
revoke all on all functions in schema public from public,anon,authenticated;
grant execute on function public.current_member_id() to authenticated;
grant execute on function public.add_movie(text),public.set_vote(uuid,boolean),
 public.save_movie_night(uuid,text,timestamptz,uuid[],uuid[],uuid[]),
 public.register_upload(uuid,text,text,bigint,integer,integer),public.send_message(uuid,text,uuid[]),
 public.keep_uploads(uuid[]),public.abandon_uploads(uuid[]),public.update_preferences(text,text),
 public.touch_last_seen(),public.set_avatar(uuid,uuid) to authenticated;
grant execute on function public.reserve_omdb_request(),public.claim_abandoned_uploads() to service_role;

insert into storage.buckets(id,name,public,allowed_mime_types)
values ('avatars','avatars',false,array['image/jpeg','image/png','image/webp','image/gif']),
 ('chat-images','chat-images',false,array['image/jpeg','image/png','image/webp','image/gif']),
 ('avatar-presets','avatar-presets',false,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict(id) do nothing;

create policy movie_wheel_media_read on storage.objects for select to authenticated using (
  (select public.current_member_id()) is not null and bucket_id in ('avatars','chat-images','avatar-presets')
);
create policy movie_wheel_media_upload on storage.objects for insert to authenticated with check (
  (select public.current_member_id()) is not null
  and exists(select 1 from public.upload_objects u where u.bucket=bucket_id and u.object_path=name
    and u.user_id=(select public.current_member_id()) and u.state='pending')
);
-- Completed objects are immutable. Retry uses the same TUS upload or a new registered object.

create policy movie_wheel_realtime_read on realtime.messages for select to authenticated using (
  (select public.current_member_id()) is not null and (realtime.topic() = 'movie-wheel:members'
    or exists(select 1 from public.user_profiles p where realtime.topic() = 'movie-wheel:member:' || p.auth_user_id::text))
);
create policy movie_wheel_realtime_send on realtime.messages for insert to authenticated with check (
  (select public.current_member_id()) is not null and realtime.topic() = 'movie-wheel:member:' || (select auth.uid())::text
);

-- Row changes are invalidation signals; clients refetch authoritative, RLS-protected snapshots.
alter publication supabase_realtime add table public.user_profiles, public.movies, public.movie_votes,
 public.movie_nights,public.movie_night_hosts,public.movie_night_movies,public.chat_messages,public.chat_attachments;
