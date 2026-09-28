"use client";
import { useEffect, useRef, useState } from "react";
import { Film } from "lucide-react";
import { browserSupabase } from "@/lib/supabase/browser";
import type { Profile } from "@/lib/types";

export function StoredImage({
  bucket,
  path,
  alt,
  className = "",
  onClick,
}: {
  bucket: string;
  path: string;
  alt: string;
  className?: string;
  onClick?: () => void;
}) {
  const [source, setSource] = useState<{ path: string; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const imageFailures = useRef(0);
  useEffect(() => {
    let active = true;
    async function renew() {
      const { data, error } = await browserSupabase()
        .storage.from(bucket)
        .createSignedUrl(path, 3600);
      if (!active) return;
      setFailed(Boolean(error));
      if (data) setSource({ path, url: data.signedUrl });
    }
    void renew();
    const timer = setInterval(renew, 50 * 60 * 1000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void renew();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [bucket, path, refresh]);
  if (failed)
    return (
      <span role="img" aria-label={`${alt} unavailable`} className={`media-retry ${className}`}>
        Image unavailable
      </span>
    );
  if (!source || source.path !== path)
    return <span className={`image-loading ${className}`} aria-label={`Loading ${alt}`} />;
  return (
    <img
      className={className}
      src={source.url}
      alt={alt}
      onClick={onClick}
      onError={() => {
        if (imageFailures.current++ === 0) setRefresh((v) => v + 1);
        else setFailed(true);
      }}
    />
  );
}

export function Avatar({ profile, small = false }: { profile: Profile; small?: boolean }) {
  return (
    <span
      className={`avatar ${small ? "avatar-small" : ""}`}
      style={{ backgroundColor: profile.chat_name_color }}
    >
      {profile.avatar_bucket && profile.avatar_path ? (
        <StoredImage
          key={profile.avatar_path}
          bucket={profile.avatar_bucket}
          path={profile.avatar_path}
          alt={`${profile.display_name}'s avatar`}
        />
      ) : (
        <span aria-hidden="true">{profile.display_name[0]}</span>
      )}
    </span>
  );
}
export function Poster({
  url,
  title,
  className = "",
}: {
  url: string | null;
  title: string;
  className?: string;
}) {
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  return url && brokenUrl !== url ? (
    <img
      className={`poster ${className}`}
      src={url}
      alt={`${title} poster`}
      loading="lazy"
      onError={() => setBrokenUrl(url)}
    />
  ) : (
    <div
      className={`poster poster-fallback ${className}`}
      role="img"
      aria-label={`No poster available for ${title}`}
    >
      <Film size={34} />
      <span>{title}</span>
    </div>
  );
}
