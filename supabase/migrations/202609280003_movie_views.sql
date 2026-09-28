alter table public.user_profiles add column preferred_movie_view text not null default 'cards'
  check (preferred_movie_view in ('cards','card-list','list'));

create function public.set_movie_view(p_view text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.user_profiles set preferred_movie_view=p_view,updated_at=now()
    where id=private.require_member();
end $$;
revoke all on function public.set_movie_view(text) from public,anon,authenticated;
grant execute on function public.set_movie_view(text) to authenticated;
