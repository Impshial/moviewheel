"use client";
import { useState } from "react";
import * as HoverCard from "@radix-ui/react-hover-card";
import { Check, Minus } from "lucide-react";
import { Avatar } from "@/components/ui/media";
import type { Profile } from "@/lib/types";

export function ProfileHoverCard({
  profile,
  online,
  showPresence = false,
  small = true,
}: {
  profile: Profile;
  online: boolean;
  showPresence?: boolean;
  small?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const status = online ? "Online" : "Offline";
  return (
    <HoverCard.Root open={open} onOpenChange={setOpen} openDelay={250} closeDelay={150}>
      <HoverCard.Trigger asChild>
        <button
          type="button"
          className={`chat-profile-trigger ${showPresence ? `member-presence ${online ? "is-online" : ""}` : ""}`}
          aria-label={`${profile.display_name}: ${status}`}
          onClick={() => setOpen(true)}
        >
          <Avatar profile={profile} small={small} />
          {showPresence && <span className="presence-dot" aria-hidden="true" />}
        </button>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          className={`profile-hover-card ${small ? "" : "profile-hover-card-large"}`}
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          hideWhenDetached
          aria-label={`${profile.display_name}'s profile`}
        >
          <div className="profile-card-avatar">
            <Avatar profile={profile} />
            <span
              className={`profile-status-badge ${online ? "is-online" : ""}`}
              aria-hidden="true"
            >
              {online ? <Check size={12} strokeWidth={3} /> : <Minus size={12} strokeWidth={3} />}
            </span>
          </div>
          <div className="profile-card-details">
            <h3>{profile.display_name}</h3>
            <p className="profile-card-status">{status}</p>
          </div>
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}
