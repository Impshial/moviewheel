"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  Plus,
  Disc3,
  ChevronDown,
  CalendarDays,
  Film,
  MessageCircle,
  Settings,
  LogOut,
} from "lucide-react";
import { useWorkspace } from "./provider";
import { Avatar } from "@/components/ui/media";
import { AddMovie } from "@/features/movies/add-movie";
import { SchedulePanel } from "@/features/schedule/schedule";
import { ChatPanel } from "@/features/chat/chat";
import { AccountSettings } from "@/features/account/settings";
import { errorMessage } from "@/lib/domain";
import { ChatResizer } from "./chat-resizer";

export function AppShell({ children }: { children: ReactNode }) {
  const { me, supabase, notice, setTyping, addMovieOpen, setAddMovieOpen, openAddMovie } =
    useWorkspace();
  const [settings, setSettings] = useState(false);
  const [panel, setPanel] = useState("movies");
  const path = usePathname();
  const center = useRef<HTMLElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (center.current) center.current.scrollTop = 0;
  }, [path]);
  async function logout() {
    setTyping(false);
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      notice(errorMessage(error, "Logout failed. Please try again."), true);
      return;
    }
    await supabase.removeAllChannels();
    window.location.replace("/login");
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to movies
      </a>
      <header className="app-header">
        <Link className="brand" href="/" onClick={() => setPanel("movies")}>
          <img src="/icon.svg" alt="" />
          <span>
            Movie Wheel<span className="brand-dot">.</span>
          </span>
        </Link>
        <div className="header-actions">
          <button className="button secondary add-movie-button" onClick={openAddMovie}>
            <Plus size={17} />
            <span>Add a Movie</span>
          </button>
          <Link
            className={`button primary wheel-link ${path === "/wheel" ? "active" : ""}`}
            href="/wheel"
            onClick={() => {
              setPanel("movies");
              setTyping(false);
            }}
          >
            <Disc3 size={18} />
            <span>Spin the Wheel</span>
          </Link>
          <Dropdown.Root>
            <Dropdown.Trigger
              className="user-menu-trigger"
              aria-label={`${me.display_name}'s menu`}
            >
              <Avatar profile={me} />
              <ChevronDown size={14} />
            </Dropdown.Trigger>
            <Dropdown.Portal>
              <Dropdown.Content className="user-menu" sideOffset={12} align="end">
                <Dropdown.Label>{me.display_name}</Dropdown.Label>
                <Dropdown.Item onSelect={() => setSettings(true)}>
                  <Settings size={15} />
                  Account Settings
                </Dropdown.Item>
                <Dropdown.Separator />
                <Dropdown.Item onSelect={() => void logout()}>
                  <LogOut size={15} />
                  Log Out
                </Dropdown.Item>
              </Dropdown.Content>
            </Dropdown.Portal>
          </Dropdown.Root>
        </div>
      </header>
      <div className="workspace-grid" ref={grid}>
        <aside className={`left-sidebar ${panel === "schedule" ? "mobile-active" : ""}`}>
          <SchedulePanel />
        </aside>
        <main
          ref={center}
          id="main-content"
          className={`center-workspace ${panel === "movies" ? "mobile-active" : ""}`}
        >
          {children}
        </main>
        <aside
          id="chat-sidebar"
          className={`right-sidebar ${panel === "chat" ? "mobile-active" : ""}`}
        >
          <ChatResizer gridRef={grid} />
          <ChatPanel />
        </aside>
      </div>
      <nav className="mobile-nav" aria-label="Workspace panels">
        {[
          { id: "schedule", label: "Schedule", Icon: CalendarDays },
          { id: "movies", label: path === "/wheel" ? "Wheel" : "Movies", Icon: Film },
          { id: "chat", label: "Chat", Icon: MessageCircle },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            className={panel === id ? "selected" : ""}
            aria-current={panel === id ? "page" : undefined}
            onClick={() => {
              setPanel(id);
              setTyping(false);
            }}
          >
            <Icon size={19} />
            {label}
          </button>
        ))}
      </nav>
      <AddMovie open={addMovieOpen} onOpenChange={setAddMovieOpen} />
      <AccountSettings open={settings} onOpenChange={setSettings} />
    </div>
  );
}
