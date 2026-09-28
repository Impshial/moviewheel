"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { browserSupabase } from "@/lib/supabase/browser";
import { errorMessage } from "@/lib/domain";
import { readAll } from "@/lib/pagination";
import type { Movie, MovieNight, Profile } from "@/lib/types";
import { X } from "lucide-react";

type Workspace = {
  me: Profile;
  profiles: Profile[];
  movies: Movie[];
  nights: MovieNight[];
  loading: boolean;
  refresh: () => Promise<void>;
  notice: (message: string, error?: boolean) => void;
  online: Set<string>;
  typing: Set<string>;
  setTyping: (typing: boolean) => void;
  supabase: ReturnType<typeof browserSupabase>;
  connected: boolean;
  addMovieOpen: boolean;
  setAddMovieOpen: (value: boolean) => void;
  openAddMovie: () => void;
  chatVersion: number;
  chatInsertIds: string[];
};
const Context = createContext<Workspace | null>(null);
export function useWorkspace() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("Workspace missing");
  return ctx;
}

export function WorkspaceProvider({
  initialProfile,
  children,
}: {
  initialProfile: Profile;
  children: ReactNode;
}) {
  const [supabase] = useState(browserSupabase);
  const [profiles, setProfiles] = useState<Profile[]>([initialProfile]);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [nights, setNights] = useState<MovieNight[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [addMovieOpen, setAddMovieOpen] = useState(false);
  const [chatVersion, setChatVersion] = useState(0);
  const [chatInsertIds, setChatInsertIds] = useState<string[]>([]);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [typing, setTypingIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ id: number; message: string; error: boolean } | null>(null);
  const typingRef = useRef<(value: boolean) => void>(() => {});
  const active = useRef(true);
  const notice = useCallback(
    (message: string, error = false) => setToast({ id: Date.now(), message, error }),
    [],
  );
  const refresh = useCallback(async () => {
    const results = await Promise.all([
      supabase.from("user_profiles").select("*").order("display_name"),
      readAll<Movie>((from, to) =>
        supabase.from("movies").select("*,movie_votes(user_id)").order("id").range(from, to),
      ),
      readAll<MovieNight>((from, to) =>
        supabase
          .from("movie_nights")
          .select("*,movie_night_hosts(user_id),movie_night_movies(*)")
          .order("starts_at")
          .order("id")
          .range(from, to),
      ),
    ]);
    if (!active.current) return;
    const failure = results.find((result) => result.error);
    if (failure) {
      notice(errorMessage(failure.error, "Could not refresh shared data."), true);
      setLoading(false);
      return;
    }
    setProfiles(results[0].data as Profile[]);
    setMovies(results[1].data as Movie[]);
    setNights(results[2].data as MovieNight[]);
    setLoading(false);
  }, [supabase, notice]);
  useEffect(() => {
    active.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- All state writes in refresh follow asynchronous Supabase reads.
    void refresh();
    let refreshTimer: ReturnType<typeof setTimeout>;
    const invalidate = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void refresh(), 100);
    };
    const channel = supabase.channel("movie-wheel:members", { config: { private: true } });
    [
      "user_profiles",
      "movies",
      "movie_votes",
      "movie_nights",
      "movie_night_hosts",
      "movie_night_movies",
    ].forEach((table) =>
      channel.on("postgres_changes", { event: "*", schema: "public", table }, invalidate),
    );
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "chat_messages" },
      (payload) => {
        const id = "id" in payload.new ? payload.new.id : undefined;
        if (typeof id === "string")
          setChatInsertIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
        setChatVersion((v) => v + 1);
      },
    );
    channel.subscribe((status) => {
      if (!active.current) return;
      setConnected(status === "SUBSCRIBED");
      if (status === "SUBSCRIBED") {
        void refresh();
        setChatVersion((v) => v + 1);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        active.current = false;
        void supabase.removeAllChannels();
        window.location.replace("/login");
      }
    });
    const seen = () => {
      if (document.visibilityState === "visible") void supabase.rpc("touch_last_seen");
    };
    seen();
    const timer = setInterval(seen, 60000);
    const onFocus = () => {
      seen();
      void refresh();
    };
    window.addEventListener("online", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      active.current = false;
      clearTimeout(refreshTimer);
      clearInterval(timer);
      listener.subscription.unsubscribe();
      window.removeEventListener("online", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      void supabase.removeChannel(channel);
    };
  }, [supabase, refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 9000);
    return () => clearTimeout(timer);
  }, [toast]);

  const memberConnections = useMemo(
    () =>
      profiles
        .filter((p) => p.auth_user_id)
        .map((p) => `${p.id}:${p.auth_user_id}`)
        .sort()
        .join(","),
    [profiles],
  );
  useEffect(() => {
    const connectionId = crypto.randomUUID();
    const states = new Map<string, { connection_id: string; typing_at?: number }[]>();
    const channels: RealtimeChannel[] = [];
    let own: RealtimeChannel | undefined;
    let lastSent = 0;
    let wasTyping = false;
    let typingTimer: ReturnType<typeof setTimeout>;
    const render = () => {
      const onlineIds = new Set<string>();
      const typingIds = new Set<string>();
      states.forEach((connections, memberId) => {
        if (connections.length) onlineIds.add(memberId);
        if (
          memberId !== initialProfile.id &&
          connections.some((c) => c.typing_at && Date.now() - c.typing_at < 6000)
        )
          typingIds.add(memberId);
      });
      setOnline(onlineIds);
      setTypingIds(typingIds);
    };
    for (const entry of memberConnections.split(",").filter(Boolean)) {
      const [memberId, authId] = entry.split(":");
      // Channel authorization binds the writer to auth.uid(); metadata cannot impersonate a different member.
      const channel = supabase.channel(`movie-wheel:member:${authId}`, {
        config: { private: true, presence: { key: connectionId } },
      });
      channel
        .on("presence", { event: "sync" }, () => {
          states.set(
            memberId,
            Object.values(
              channel.presenceState<{ connection_id: string; typing_at?: number }>(),
            ).flat(),
          );
          render();
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED" && memberId === initialProfile.id) {
            own = channel;
            void channel.track({ connection_id: connectionId, typing_at: 0 });
          } else if (status === "CHANNEL_ERROR" || status === "CLOSED" || status === "TIMED_OUT") {
            states.delete(memberId);
            render();
          }
        });
      channels.push(channel);
    }
    const update = (value: boolean) => {
      clearTimeout(typingTimer);
      if (value !== wasTyping || (value && Date.now() - lastSent > 1500)) {
        lastSent = Date.now();
        void own?.track({ connection_id: connectionId, typing_at: value ? Date.now() : 0 });
      }
      wasTyping = value;
      if (value) typingTimer = setTimeout(() => update(false), 4000);
    };
    typingRef.current = update;
    const clear = () => update(false);
    window.addEventListener("blur", clear);
    const expire = setInterval(render, 1000);
    return () => {
      clearInterval(expire);
      clearTimeout(typingTimer);
      window.removeEventListener("blur", clear);
      typingRef.current = () => {};
      channels.forEach((channel) => {
        void channel.untrack();
        void supabase.removeChannel(channel);
      });
    };
  }, [memberConnections, initialProfile.id, supabase]);
  const setTyping = useCallback((value: boolean) => typingRef.current(value), []);
  const me = profiles.find((p) => p.id === initialProfile.id) || initialProfile;
  return (
    <Context.Provider
      value={{
        me,
        profiles,
        movies,
        nights,
        loading,
        refresh,
        notice,
        online,
        typing,
        setTyping,
        supabase,
        connected,
        addMovieOpen,
        setAddMovieOpen,
        openAddMovie: () => setAddMovieOpen(true),
        chatVersion,
        chatInsertIds,
      }}
    >
      {children}
      {toast && (
        <div
          className={`toast ${toast.error ? "toast-error" : ""}`}
          role={toast.error ? "alert" : "status"}
          key={toast.id}
        >
          <span>{toast.message}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={18} />
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
