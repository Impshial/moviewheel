"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, ImagePlus, MessageCircle, Send, X, RotateCcw } from "lucide-react";
import { useWorkspace } from "@/features/workspace/provider";
import { useMessages } from "./use-messages";
import { useUploads } from "./use-uploads";
import { Avatar, StoredImage } from "@/components/ui/media";
import { Dialog } from "@/components/ui/dialog";
import { errorMessage } from "@/lib/domain";
import type { Attachment } from "@/lib/types";

export function ChatPanel() {
  const { profiles, online, typing, setTyping, supabase, connected } = useWorkspace();
  const { messages, loading, hasOlder, loadingOlder, older, refresh } = useMessages();
  const uploads = useUploads("chat-images");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [lightbox, setLightbox] = useState<Attachment | null>(null);
  const [hasNew, setHasNew] = useState(false);
  const [dots, setDots] = useState(1);
  const [submission, setSubmission] = useState<{ id: string; text: string; ids: string[] } | null>(
    null,
  );
  const scroller = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const nearBottom = useRef(true);
  const firstLoad = useRef(true);
  const prepend = useRef<{ height: number; top: number } | null>(null);
  const previousLast = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (prepend.current) {
      el.scrollTop = prepend.current.top + el.scrollHeight - prepend.current.height;
      prepend.current = null;
    } else if (firstLoad.current || nearBottom.current) {
      el.scrollTop = el.scrollHeight;
    } else if (messages.at(-1)?.id !== previousLast.current) {
      // Defer the notification update outside the synchronous layout measurement.
      queueMicrotask(() => setHasNew(true));
    }
    if (messages.length) firstLoad.current = false;
    previousLast.current = messages.at(-1)?.id;
  }, [messages]);
  useEffect(() => {
    const interval = setInterval(() => setDots((d) => (d % 3) + 1), 450);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (nearBottom.current) el.scrollTop = el.scrollHeight;
    });
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, []);
  async function loadOlder() {
    if (!scroller.current || loadingOlder) return;
    prepend.current = { height: scroller.current.scrollHeight, top: scroller.current.scrollTop };
    await older();
    // No response rows still needs to release the saved scroll measurement.
    requestAnimationFrame(() => {
      prepend.current = null;
    });
  }
  async function send(event?: React.FormEvent) {
    event?.preventDefault();
    if (sending || (!text.trim() && !uploads.items.length && !submission)) return;
    setSending(true);
    setError("");
    setTyping(false);
    try {
      const pending = submission || { id: crypto.randomUUID(), text, ids: await uploads.ready() };
      setSubmission(pending);
      const { error } = await supabase.rpc("send_message", {
        p_client_message_id: pending.id,
        p_text: pending.text,
        p_upload_ids: pending.ids,
      });
      if (error) throw error;
      setText("");
      setSubmission(null);
      uploads.committed();
      nearBottom.current = true;
      setHasNew(false);
      await refresh();
      requestAnimationFrame(() => composer.current?.focus());
    } catch (e) {
      setError(errorMessage(e, "Message was not confirmed. Retry sending to check safely."));
    } finally {
      setSending(false);
    }
  }
  const names = profiles.filter((p) => typing.has(p.id)).map((p) => p.display_name);
  const locked = sending || Boolean(submission);
  return (
    <section className="chat-panel">
      <div className="panel-heading">
        <h2>
          <MessageCircle size={17} />
          The conversation
        </h2>
        <span className={`connection-status ${connected ? "connected" : ""}`}>
          {connected ? "LIVE" : "RECONNECTING"}
        </span>
      </div>
      <div className="online-members" aria-label="Online members">
        {profiles.map((profile) => (
          <span
            key={profile.id}
            className={`member-presence ${online.has(profile.id) ? "is-online" : ""}`}
            title={`${profile.display_name} · ${online.has(profile.id) ? "Online" : profile.last_seen_at ? `Last seen ${new Date(profile.last_seen_at).toLocaleString()}` : "Offline"}`}
          >
            <Avatar profile={profile} small />
            <span className="presence-dot" />
            <span className="sr-only">
              {profile.display_name}: {online.has(profile.id) ? "Online" : "Offline"}
            </span>
          </span>
        ))}
        <span>{online.size} online</span>
      </div>
      <div
        className="chat-scroll"
        ref={scroller}
        onScroll={() => {
          const el = scroller.current!;
          nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          if (nearBottom.current) setHasNew(false);
          if (el.scrollTop < 25 && hasOlder && !loadingOlder) void loadOlder();
        }}
      >
        <div className="message-stream">
          {hasOlder && (
            <button
              className="older-messages"
              disabled={loadingOlder}
              onClick={() => void loadOlder()}
            >
              {loadingOlder ? "Loading…" : "Load earlier messages"}
            </button>
          )}
          {loading && (
            <p className="chat-empty" role="status">
              Loading the conversation…
            </p>
          )}
          {!loading && !messages.length && (
            <div className="chat-empty">
              <MessageCircle size={30} strokeWidth={1} />
              <h3>Pull up a seat.</h3>
              <p>The conversation starts here.</p>
            </div>
          )}
          {messages.map((message) => {
            const profile = profiles.find((p) => p.id === message.user_id);
            if (!profile) return null;
            return (
              <div className="chat-message" key={message.id} data-message-id={message.id}>
                <Avatar profile={profile} small />
                <div className="message-content">
                  <p>
                    <span className="chat-author" style={{ color: profile.chat_name_color }}>
                      {online.has(profile.id) && (
                        <span className="inline-online" aria-label="Online" />
                      )}
                      {profile.display_name}:
                    </span>{" "}
                    <span className="message-text">{message.message_text}</span>
                  </p>
                  {!!message.chat_attachments.length && (
                    <div className="message-images">
                      {[...message.chat_attachments]
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map((image) => (
                          <button
                            className="image-thumbnail"
                            key={image.id}
                            onClick={() => setLightbox(image)}
                            aria-label={`Open image shared by ${profile.display_name}`}
                          >
                            <StoredImage
                              bucket={image.storage_bucket}
                              path={image.storage_path}
                              alt={`Image shared by ${profile.display_name}`}
                            />
                          </button>
                        ))}
                    </div>
                  )}
                  <time
                    dateTime={message.created_at}
                    title={new Date(message.created_at).toLocaleString()}
                  >
                    {new Date(message.created_at).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {hasNew && (
        <button
          className="new-messages"
          onClick={() => {
            nearBottom.current = true;
            setHasNew(false);
            if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
          }}
        >
          New messages <ArrowDown size={13} />
        </button>
      )}
      <div className="typing-line" aria-live="polite">
        {names.length > 0 && (
          <span>
            {names.join(" and ")}
            {".".repeat(dots)}
          </span>
        )}
      </div>
      <form className="chat-composer" onSubmit={send}>
        {!!uploads.items.length && (
          <div className="pending-images">
            {uploads.items.map((item) => (
              <div
                className={`pending-image ${item.state === "failed" ? "failed" : ""}`}
                key={item.id}
              >
                <img src={item.preview} alt={item.file.name || "Pasted image"} />
                <button
                  type="button"
                  disabled={locked}
                  aria-label={`Remove ${item.file.name || "image"}`}
                  className="remove-pending"
                  onClick={() => uploads.remove(item.id)}
                >
                  <X size={12} />
                </button>
                <span>
                  {item.state === "ready"
                    ? "Ready"
                    : item.state === "uploading"
                      ? `${item.progress}%`
                      : item.state === "queued"
                        ? "Queued"
                        : "Failed"}
                </span>
                {item.state === "failed" && (
                  <>
                    <button
                      type="button"
                      disabled={locked}
                      className="retry-upload"
                      onClick={() => uploads.retry(item.id)}
                    >
                      <RotateCcw size={12} />
                      Retry
                    </button>
                    <p role="alert">{item.error}</p>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        <label className="sr-only" htmlFor="chat-message">
          Message
        </label>
        <textarea
          id="chat-message"
          ref={composer}
          rows={2}
          placeholder="Talk movies…"
          value={text}
          readOnly={locked}
          onChange={(e) => {
            setText(e.target.value);
            setTyping(Boolean(e.target.value.trim()));
          }}
          onBlur={() => setTyping(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          onPaste={(e) => {
            if (locked) return;
            const files = Array.from(e.clipboardData.items)
              .filter((item) => item.kind === "file")
              .flatMap((item) => {
                const file = item.getAsFile();
                return file ? [file] : [];
              });
            if (files.length) {
              uploads.add(files);
              if (!e.clipboardData.getData("text/plain")) e.preventDefault();
            }
          }}
        />
        <div className="composer-actions">
          <input
            ref={fileInput}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif"
            hidden
            onChange={(e) => {
              uploads.add(Array.from(e.target.files || []));
              e.target.value = "";
            }}
          />
          <button
            className="icon-button attachment-button"
            type="button"
            disabled={locked}
            aria-label="Attach images"
            onClick={() => fileInput.current?.click()}
          >
            <ImagePlus size={20} />
          </button>
          <span>Shift + Enter for a new line</span>
          <button
            className="send-button"
            disabled={sending || (!text.trim() && !uploads.items.length && !submission)}
            aria-label={submission ? "Retry sending message" : "Send message"}
          >
            {sending ? "…" : submission ? <RotateCcw size={17} /> : <Send size={17} />}
          </button>
        </div>
        {error && (
          <p className="chat-error" role="alert">
            {error}
            {submission && " Retry sends the same message safely."}
          </p>
        )}
      </form>
      <Dialog
        open={Boolean(lightbox)}
        onOpenChange={(open) => {
          if (!open) setLightbox(null);
        }}
        title="Shared image"
        wide
      >
        {lightbox && (
          <StoredImage
            bucket={lightbox.storage_bucket}
            path={lightbox.storage_path}
            alt="Full-size shared image"
            className="lightbox-image"
          />
        )}
      </Dialog>
    </section>
  );
}
