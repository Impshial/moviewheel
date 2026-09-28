-- Only the original adding member can delete a movie. Other members can still
-- view and vote for it; adding the same IMDb ID does not transfer ownership.
alter policy member_movie_delete on public.movies
  using (added_by_user_id = (select public.current_member_id()));
alter policy member_movie_delete on public.movies rename to own_movie_delete;
