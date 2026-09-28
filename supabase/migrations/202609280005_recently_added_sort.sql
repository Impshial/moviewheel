-- Preserve existing preferences and allow sorting by the original added date.
alter table public.user_profiles
  drop constraint user_profiles_preferred_movie_sort_check,
  add constraint user_profiles_preferred_movie_sort_check
    check (preferred_movie_sort in (
      'most-votes', 'least-votes', 'alphabetical', 'reverse-alphabetical',
      'year-ascending', 'year', 'my-votes', 'recently-added'
    ));
