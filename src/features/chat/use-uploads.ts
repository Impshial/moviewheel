"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/features/workspace/provider";
import { TaskQueue } from "@/lib/queue";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/domain";
import { uploadImage } from "@/lib/uploads";

export type DraftImage = {
  id: string;
  file: File;
  preview: string;
  state: "queued" | "uploading" | "ready" | "failed";
  progress: number;
  error?: string;
  resumeUrl?: string;
};
export function useUploads(bucket: "chat-images" | "avatars") {
  const { supabase } = useWorkspace();
  const [items, setItems] = useState<DraftImage[]>([]);
  const current = useRef<DraftImage[]>([]);
  const queue = useRef(new TaskQueue(2));
  const controllers = useRef(new Map<string, AbortController>());
  const jobs = useRef(new Map<string, Promise<void>>());
  const mounted = useRef(true);
  const limits = useRef<Promise<Record<string, { maxBytes: number | null }>> | null>(null);
  const update = useCallback((updater: (list: DraftImage[]) => DraftImage[]) => {
    current.current = updater(current.current);
    if (mounted.current) setItems(current.current);
  }, []);
  const cleanup = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase.rpc("abandon_uploads", { p_ids: ids });
      if (!error)
        await api("/api/uploads/cleanup", { method: "POST", body: JSON.stringify({ ids }) }).catch(
          () => {},
        );
      // Pending/deleting records survive failed cleanup and are retried by maintenance.
    },
    [supabase],
  );
  const start = useCallback(
    (item: DraftImage) => {
      const controller = new AbortController();
      controllers.current.set(item.id, controller);
      const updateItem = (values: Partial<DraftImage>) =>
        update((list) => list.map((i) => (i.id === item.id ? { ...i, ...values } : i)));
      updateItem({ state: "queued", error: undefined });
      const job = queue.current.run(async () => {
        if (controller.signal.aborted) return;
        updateItem({ state: "uploading" });
        try {
          if (!limits.current)
            limits.current =
              api<Record<string, { maxBytes: number | null }>>("/api/uploads/config");
          const config = await limits.current.catch((e) => {
            limits.current = null;
            throw e;
          });
          await uploadImage({
            supabase,
            file: item.file,
            id: item.id,
            bucket,
            maxBytes: config[bucket].maxBytes,
            signal: controller.signal,
            resumeUrl: item.resumeUrl,
            onProgress: (progress) => updateItem({ progress }),
            onResumeUrl: (resumeUrl) => updateItem({ resumeUrl }),
          });
          if (controller.signal.aborted) {
            void cleanup([item.id]);
            return;
          }
          updateItem({ state: "ready", progress: 100 });
        } catch (e) {
          if (!controller.signal.aborted) updateItem({ state: "failed", error: errorMessage(e) });
          else void cleanup([item.id]);
        }
      });
      jobs.current.set(item.id, job);
      void job.finally(() => {
        jobs.current.delete(item.id);
        controllers.current.delete(item.id);
      });
    },
    [supabase, bucket, cleanup, update],
  );
  const add = useCallback(
    (files: File[]) => {
      const additions = files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
        state: "queued" as const,
        progress: 0,
      }));
      update((list) => [...list, ...additions]);
      additions.forEach(start);
    },
    [start, update],
  );
  const remove = useCallback(
    (id: string) => {
      const item = current.current.find((i) => i.id === id);
      controllers.current.get(id)?.abort();
      if (item) URL.revokeObjectURL(item.preview);
      update((list) => list.filter((i) => i.id !== id));
      void cleanup([id]);
    },
    [cleanup, update],
  );
  const retry = useCallback(
    (id: string) => {
      const item = current.current.find((i) => i.id === id);
      if (item && item.state === "failed") start(item);
    },
    [start],
  );
  const ready = useCallback(async () => {
    await Promise.all([...jobs.current.values()]);
    if (current.current.some((i) => i.state !== "ready"))
      throw new Error(
        "Retry or remove failed images before sending. Your message has not been sent.",
      );
    return current.current.map((i) => i.id);
  }, []);
  const committed = useCallback(() => {
    current.current.forEach((i) => URL.revokeObjectURL(i.preview));
    update(() => []);
  }, [update]);
  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => {
      const ids = current.current.map((i) => i.id);
      if (ids.length) void supabase.rpc("keep_uploads", { p_ids: ids });
    }, 60000);
    const aborters = controllers.current;
    return () => {
      mounted.current = false;
      clearInterval(timer);
      aborters.forEach((c) => c.abort());
      current.current.forEach((i) => URL.revokeObjectURL(i.preview));
      // Do not guess whether an in-flight message committed. Maintenance checks database state.
    };
  }, [supabase]);
  return { items, add, remove, retry, ready, committed };
}
