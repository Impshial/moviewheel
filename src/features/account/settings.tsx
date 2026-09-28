"use client";
import { useEffect, useRef, useState } from "react";
import { Upload, Check } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Avatar, StoredImage } from "@/components/ui/media";
import { useWorkspace } from "@/features/workspace/provider";
import { useUploads } from "@/features/chat/use-uploads";
import { PinInput } from "@/features/auth/login";
import { api } from "@/lib/api";
import { contrastOnWhite, errorMessage } from "@/lib/domain";
import { SORTS, type AvatarOption, type SortMode } from "@/lib/types";

export function AccountSettings({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Account Settings">
      {open && <SettingsForm />}
    </Dialog>
  );
}
function SettingsForm() {
  const { me, supabase, refresh, notice } = useWorkspace();
  const [color, setColor] = useState(me.chat_name_color);
  const [sort, setSort] = useState(me.preferred_movie_sort);
  const [options, setOptions] = useState<AvatarOption[]>([]);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const upload = useUploads("avatars");
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true;
    void supabase
      .from("avatar_options")
      .select("*")
      .eq("enabled", true)
      .order("sort_order")
      .then(({ data, error }) => {
        if (active) {
          if (error) notice(errorMessage(error), true);
          else setOptions(data as AvatarOption[]);
        }
      });
    return () => {
      active = false;
    };
  }, [supabase, notice]);
  async function saveAvatar(option: string | null, custom = false) {
    setBusy(true);
    setError("");
    try {
      const ids = custom ? await upload.ready() : [];
      const { error } = await supabase.rpc("set_avatar", {
        p_upload_id: ids[0] ?? null,
        p_option_id: option,
      });
      if (error) throw error;
      if (custom) upload.committed();
      await refresh();
      notice("Your avatar was updated.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function preferences(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (contrastOnWhite(color) < 4.5)
        throw new Error("Choose a darker color so your name stays readable on white.");
      const { error } = await supabase.rpc("update_preferences", { p_color: color, p_sort: sort });
      if (error) throw error;
      await refresh();
      notice("Your preferences were saved.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function changePin(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/change-pin", {
        method: "POST",
        body: JSON.stringify({ currentPin, newPin, confirmPin: confirm }),
      });
      setCurrentPin("");
      setNewPin("");
      setConfirm("");
      notice("Your PIN was changed.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="account-settings">
      <section>
        <h3>Your avatar</h3>
        <div className="avatar-settings">
          <Avatar profile={me} />
          <div>
            <strong>{me.display_name}</strong>
            <p className="field-hint">Your face in the conversation.</p>
          </div>
          <input
            ref={picker}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                upload.items.forEach((item) => upload.remove(item.id));
                upload.add([file]);
              }
              e.target.value = "";
            }}
          />
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => picker.current?.click()}
          >
            <Upload size={15} />
            Upload
          </button>
        </div>
        {!!upload.items.length && (
          <div className="avatar-upload">
            {upload.items.map((item) => (
              <div key={item.id}>
                <img src={item.preview} alt="New avatar preview" />
                <span>
                  {item.state === "ready"
                    ? "Ready to save"
                    : item.state === "failed"
                      ? item.error
                      : `Uploading ${item.progress}%`}
                </span>
                {item.state === "failed" && (
                  <button className="button secondary" onClick={() => upload.retry(item.id)}>
                    Retry
                  </button>
                )}
                <button className="button text-button" onClick={() => upload.remove(item.id)}>
                  Remove
                </button>
              </div>
            ))}
            <button
              className="button primary"
              disabled={busy || upload.items.some((i) => i.state !== "ready")}
              onClick={() => void saveAvatar(null, true)}
            >
              Use this avatar
            </button>
          </div>
        )}
        {!!options.length ? (
          <div className="avatar-options">
            {options.map((option) => (
              <button
                key={option.id}
                className={`avatar-choice ${me.avatar_option_id === option.id ? "selected" : ""}`}
                aria-label={`Use ${option.name}`}
                aria-pressed={me.avatar_option_id === option.id}
                disabled={busy}
                onClick={() => void saveAvatar(option.id)}
              >
                <StoredImage bucket="avatar-presets" path={option.storage_path} alt={option.name} />
                {me.avatar_option_id === option.id && <Check size={15} />}
              </button>
            ))}
          </div>
        ) : (
          <p className="field-hint">Preset avatars will appear here when the library is added.</p>
        )}
        {me.avatar_path && (
          <button
            className="button text-button"
            disabled={busy}
            onClick={() => void saveAvatar(null)}
          >
            Use my initial
          </button>
        )}
      </section>
      <section>
        <h3>Your preferences</h3>
        <form className="stack" onSubmit={preferences}>
          <label>
            Chat name color
            <div className="color-row">
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
              <span className="color-preview" style={{ color }}>
                {me.display_name}: <span>Hello, movie people.</span>
              </span>
            </div>
          </label>
          {contrastOnWhite(color) < 4.5 && (
            <p className="field-hint">Choose a darker shade for readable text.</p>
          )}
          <label>
            Preferred movie sorting
            <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
              {Object.entries(SORTS).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button className="button secondary" disabled={busy || contrastOnWhite(color) < 4.5}>
            Save Preferences
          </button>
        </form>
      </section>
      <section>
        <h3>Change PIN</h3>
        <form className="stack" onSubmit={changePin}>
          <label>
            Current PIN
            <PinInput value={currentPin} onChange={setCurrentPin} />
          </label>
          <div className="form-row">
            <label>
              New PIN
              <PinInput value={newPin} onChange={setNewPin} />
            </label>
            <label>
              Confirm new PIN
              <PinInput value={confirm} onChange={setConfirm} />
            </label>
          </div>
          <button className="button secondary" disabled={busy}>
            Change PIN
          </button>
        </form>
      </section>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
