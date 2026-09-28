export const MEMBERS = ["Abby", "Darren", "Elisabeth", "Hannah", "Paul"] as const;
export type MemberName = (typeof MEMBERS)[number];
export const SORTS = {
  "most-votes": "Most Votes",
  "least-votes": "Least Votes",
  alphabetical: "A-Z",
  "reverse-alphabetical": "Z-A",
  "year-ascending": "By Year Oldest",
  year: "By Year Newest",
  "my-votes": "My Votes",
} as const;
export type SortMode = keyof typeof SORTS;
export const MOVIE_VIEWS = { cards: "Cards", "card-list": "Card List", list: "List" } as const;
export type MovieView = keyof typeof MOVIE_VIEWS;
export type Profile = {
  id: string;
  member_key: string;
  display_name: MemberName;
  auth_user_id: string | null;
  avatar_bucket: string | null;
  avatar_path: string | null;
  avatar_option_id: string | null;
  chat_name_color: string;
  preferred_movie_sort: SortMode;
  preferred_movie_view: MovieView;
  last_seen_at: string | null;
  updated_at: string;
};
export type MovieMetadata = {
  imdb_id: string;
  title: string;
  release_year: number | null;
  poster_url: string | null;
  director: string | null;
  runtime_minutes: number | null;
  genre: string | null;
  rated: string | null;
  plot: string | null;
  imdb_rating: string | null;
  raw_metadata: Record<string, unknown>;
};
export type Movie = MovieMetadata & {
  id: string;
  added_by_user_id: string;
  created_at: string;
  movie_votes: { user_id: string }[];
};
export type SearchMovie = Pick<MovieMetadata, "imdb_id" | "title" | "release_year" | "poster_url">;
export type MovieSnapshot = {
  id: string;
  movie_id: string | null;
  movie_title_snapshot: string;
  movie_year_snapshot: number | null;
  movie_poster_snapshot: string | null;
};
export type MovieNight = {
  id: string;
  title: string;
  starts_at: string;
  timezone: "America/New_York";
  created_by_user_id: string;
  updated_at: string;
  movie_night_hosts: { user_id: string }[];
  movie_night_movies: MovieSnapshot[];
};
export type Attachment = {
  id: string;
  message_id: string;
  uploaded_by_user_id: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  width: number | null;
  height: number | null;
  sort_order: number;
};
export type ChatMessage = {
  id: string;
  user_id: string;
  client_message_id: string;
  message_text: string | null;
  deleted_at: string | null;
  created_at: string;
  chat_attachments: Attachment[];
};
export type UploadRecord = {
  id: string;
  user_id: string;
  bucket: "chat-images" | "avatars";
  object_path: string;
  mime_type: string;
  file_size: number;
  state: "pending" | "attached" | "deleting";
};
export type AvatarOption = { id: string; name: string; storage_path: string; sort_order: number };
export type AddMovieOutcome = "added" | "existing_vote_added" | "already_voted";
