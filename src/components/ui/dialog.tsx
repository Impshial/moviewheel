"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="modal-overlay" />
        <DialogPrimitive.Content
          className={`modal ${wide ? "modal-wide" : ""}`}
          {...(!description ? { "aria-describedby": undefined } : {})}
        >
          <div className="modal-heading">
            <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close className="icon-button" aria-label="Close dialog">
              <X size={20} />
            </DialogPrimitive.Close>
          </div>
          {description && (
            <DialogPrimitive.Description className="muted">
              {description}
            </DialogPrimitive.Description>
          )}
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function ConfirmDialog({
  title,
  description,
  open,
  onOpenChange,
  onConfirm,
  busy,
}: {
  title: string;
  description: string;
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={busy ? () => {} : onOpenChange}
      title={title}
      description={description}
    >
      <div className="modal-actions">
        <button className="button secondary" disabled={busy} onClick={() => onOpenChange(false)}>
          Cancel
        </button>
        <button className="button danger" disabled={busy} onClick={onConfirm}>
          {busy ? "Deleting…" : "Delete"}
        </button>
      </div>
    </Dialog>
  );
}
