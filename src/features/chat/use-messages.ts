"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/features/workspace/provider";
import type { ChatMessage } from "@/lib/types";
import { errorMessage } from "@/lib/domain";

const fields = "*,chat_attachments(*)";
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const map = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => map.set(message.id, message));
  return [...map.values()].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
}
export function useMessages() {
  const { supabase, notice, chatVersion, chatInsertIds } = useWorkspace();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const current = useRef<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const inProgress = useRef<Promise<void> | null>(null);
  const active = useRef(true);
  const merge = useCallback((incoming: ChatMessage[]) => {
    if (!active.current) return;
    current.current = mergeMessages(current.current, incoming);
    setMessages(current.current);
  }, []);
  const refresh = useCallback(async () => {
    if (inProgress.current) await inProgress.current;
    const work = async () => {
      try {
        const latest = current.current.at(-1);
        // Reconcile the newest page even when a transaction commits out of
        // timestamp order. Realtime IDs below cover older late commits too.
        {
          const { data, error } = await supabase
            .from("chat_messages")
            .select(fields)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(100);
          if (error) throw error;
          if (!latest && active.current) setHasOlder(data.length === 100);
          merge(data as ChatMessage[]);
        }
        const loaded = new Set(current.current.map((message) => message.id));
        const missing = chatInsertIds.filter((id) => !loaded.has(id));
        for (let i = 0; i < missing.length; i += 100) {
          const { data, error } = await supabase
            .from("chat_messages")
            .select(fields)
            .in("id", missing.slice(i, i + 100));
          if (error) throw error;
          merge(data as ChatMessage[]);
        }
        if (latest) {
          let cursor = latest;
          // Catch every missed message after reconnect, even when more than 100 arrived.
          for (;;) {
            const { data, error } = await supabase
              .from("chat_messages")
              .select(fields)
              .or(
                `created_at.gt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.gt.${cursor.id})`,
              )
              .order("created_at")
              .order("id")
              .limit(100);
            if (error) throw error;
            if (!active.current) break;
            merge(data as ChatMessage[]);
            if (data.length < 100) break;
            cursor = data.at(-1) as ChatMessage;
          }
        }
      } catch (e) {
        if (active.current) notice(errorMessage(e, "Chat could not load."), true);
      } finally {
        if (active.current) setLoading(false);
      }
    };
    inProgress.current = work();
    await inProgress.current;
    inProgress.current = null;
  }, [supabase, notice, merge, chatInsertIds]);
  useEffect(() => {
    active.current = true;
    void refresh();
    return () => {
      active.current = false;
    };
  }, [refresh, chatVersion]);
  const older = useCallback(async () => {
    if (loadingOlder || !hasOlder || !current.current[0]) return;
    setLoadingOlder(true);
    try {
      const cursor = current.current[0];
      const { data, error } = await supabase
        .from("chat_messages")
        .select(fields)
        .or(
          `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`,
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(100);
      if (error) throw error;
      merge(data as ChatMessage[]);
      setHasOlder(data.length === 100);
    } catch (e) {
      notice(errorMessage(e), true);
    } finally {
      setLoadingOlder(false);
    }
  }, [supabase, notice, merge, loadingOlder, hasOlder]);
  return { messages, loading, loadingOlder, hasOlder, older, refresh };
}
