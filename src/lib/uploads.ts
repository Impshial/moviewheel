"use client";
import * as tus from "tus-js-client";
import type { browserSupabase } from "./supabase/browser";
import type { UploadRecord } from "./types";

export async function imageType(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const text = String.fromCharCode(...bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)) return "image/png";
  if (text.startsWith("GIF87a") || text.startsWith("GIF89a")) return "image/gif";
  if (text.startsWith("RIFF") && text.slice(8, 12) === "WEBP") return "image/webp";
  throw new Error(
    "Choose a JPEG, PNG, WebP, or GIF image. This file's format is unsupported or invalid.",
  );
}
export function checkFileSize(size: number, maximum: number | null) {
  if (!size) throw new Error("This file is empty.");
  if (maximum && size > maximum)
    throw new Error(
      `This image is ${(size / 1048576).toFixed(1)} MB. The configured Storage limit is ${(maximum / 1048576).toFixed(1)} MB.`,
    );
}
export async function imageDimensions(file: File) {
  try {
    const bitmap = await createImageBitmap(file);
    const result = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return result;
  } catch {
    return { width: null, height: null };
  }
}

export async function uploadImage({
  supabase,
  file,
  id,
  bucket,
  maxBytes,
  signal,
  onProgress,
  resumeUrl,
  onResumeUrl,
}: {
  supabase: ReturnType<typeof browserSupabase>;
  file: File;
  id: string;
  bucket: "chat-images" | "avatars";
  maxBytes: number | null;
  signal: AbortSignal;
  onProgress: (value: number) => void;
  resumeUrl?: string;
  onResumeUrl: (url: string) => void;
}): Promise<UploadRecord> {
  signal.throwIfAborted();
  checkFileSize(file.size, maxBytes);
  const mime = await imageType(file);
  const dimensions = await imageDimensions(file);
  const { data, error } = await supabase
    .rpc("register_upload", {
      p_id: id,
      p_bucket: bucket,
      p_mime_type: mime,
      p_file_size: file.size,
      p_width: dimensions.width,
      p_height: dimensions.height,
    })
    .abortSignal(signal);
  if (error) throw new Error(error.message);
  const registered = data as UploadRecord;
  signal.throwIfAborted();
  // A prior attempt may have uploaded successfully even if the response was lost.
  const { data: existing } = await supabase.storage.from(bucket).info(registered.object_path);
  if (existing && existing.size === file.size) {
    onProgress(100);
    return registered;
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Please sign in again before uploading.");
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;
  if (file.size <= 6 * 1024 * 1024 && !resumeUrl) {
    const response = await fetch(
      `${projectUrl}/storage/v1/object/${bucket}/${registered.object_path}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${session.access_token}`,
          apikey: key,
          "Content-Type": mime,
          "x-upsert": "false",
        },
        body: file,
        signal,
      },
    );
    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      throw new Error(
        details.message ||
          "Storage could not accept this image. Check the project limits or retry.",
      );
    }
  } else {
    const endpoint = new URL(projectUrl);
    if (endpoint.hostname.endsWith(".supabase.co"))
      endpoint.hostname = endpoint.hostname.replace(".supabase.co", ".storage.supabase.co");
    await new Promise<void>((resolve, reject) => {
      const transfer = new tus.Upload(file, {
        endpoint: `${endpoint.origin}/storage/v1/upload/resumable`,
        uploadUrl: resumeUrl,
        headers: { authorization: `Bearer ${session.access_token}`, apikey: key },
        chunkSize: 6 * 1024 * 1024,
        retryDelays: [0, 1000, 3000, 5000],
        uploadDataDuringCreation: true,
        storeFingerprintForResuming: false,
        metadata: {
          bucketName: bucket,
          objectName: registered.object_path,
          contentType: mime,
          cacheControl: "3600",
        },
        onProgress: (sent, total) => {
          if (transfer.url) onResumeUrl(transfer.url);
          onProgress(Math.round((sent / total) * 100));
        },
        onSuccess: () => {
          signal.removeEventListener("abort", abort);
          resolve();
        },
        onError: () => {
          signal.removeEventListener("abort", abort);
          if (transfer.url) onResumeUrl(transfer.url);
          reject(
            new Error(
              "Image upload was interrupted or exceeded a Storage limit. Your draft is saved here; retry the upload.",
            ),
          );
        },
      });
      const abort = () => {
        void transfer.abort();
        reject(new DOMException("Upload cancelled", "AbortError"));
      };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      else transfer.start();
    });
  }
  onProgress(100);
  return registered;
}
