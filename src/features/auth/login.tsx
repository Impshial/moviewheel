"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { MEMBERS, type MemberName } from "@/lib/types";
import { api } from "@/lib/api";
import { errorMessage, isPin } from "@/lib/domain";

export function Login() {
  const router = useRouter();
  const [name, setName] = useState<MemberName | null>(null);
  const [configured, setConfigured] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function select(member: MemberName) {
    setBusy(true);
    setError("");
    try {
      const state = await api<{ configured: boolean }>("/api/auth/status", {
        method: "POST",
        body: JSON.stringify({ member: member.toLowerCase() }),
      });
      setConfigured(state.configured);
      setName(member);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function enter(event: React.FormEvent) {
    event.preventDefault();
    if (!isPin(pin)) {
      setError("Enter exactly six digits.");
      return;
    }
    if (!configured && pin !== confirmPin) {
      setError("The PIN entries must match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/api/auth/${configured ? "login" : "setup"}`, {
        method: "POST",
        body: JSON.stringify({
          member: name!.toLowerCase(),
          pin,
          confirmPin: configured ? undefined : confirmPin,
        }),
      });
      setPin("");
      setConfirmPin("");
      router.replace("/");
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
      // A concurrent successful claim must switch this client to returning login.
      if (!configured) {
        const state = await api<{ configured: boolean }>("/api/auth/status", {
          method: "POST",
          body: JSON.stringify({ member: name!.toLowerCase() }),
        }).catch(() => null);
        if (state?.configured) {
          setConfigured(true);
          setPin("");
          setConfirmPin("");
        }
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <div className="login-content">
        {!name ? (
          <>
            <h1>Who are you?</h1>
            <div className="name-list">
              {MEMBERS.map((member, index) => (
                <button
                  key={member}
                  disabled={busy}
                  onClick={() => void select(member)}
                  className="name-button"
                  style={{ "--member-index": index } as React.CSSProperties}
                >
                  <span>{member}</span>
                  <ArrowRight size={20} aria-hidden="true" />
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <h1>Hi, {name}!</h1>
            <p className="login-prompt">
              {configured ? "Enter your PIN" : "Create your 6-digit PIN"}
            </p>
            <form onSubmit={enter} className="stack">
              <label>
                {configured ? "PIN" : "Create PIN"}
                <PinInput value={pin} onChange={setPin} autoFocus />
              </label>
              {!configured && (
                <label>
                  Confirm PIN
                  <PinInput value={confirmPin} onChange={setConfirmPin} />
                </label>
              )}
              <button className="button primary" disabled={busy}>
                {busy ? "One moment…" : configured ? "Enter" : "Set PIN"}
                <ArrowRight size={18} />
              </button>
              <button
                type="button"
                className="button text-button"
                disabled={busy}
                onClick={() => {
                  setName(null);
                  setPin("");
                  setConfirmPin("");
                  setError("");
                }}
              >
                <ArrowLeft size={16} />
                Back
              </button>
            </form>
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
export function PinInput({
  value,
  onChange,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <input
      className="pin-input"
      type="password"
      inputMode="numeric"
      pattern="[0-9]{6}"
      maxLength={6}
      autoComplete="off"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      required
      autoFocus={autoFocus}
    />
  );
}
