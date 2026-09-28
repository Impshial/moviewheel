"use client";
import { useEffect, useRef, useState, type RefObject } from "react";

const MIN_CHAT_WIDTH = 275;
const MIN_MOVIES_WIDTH = 360;

export function ChatResizer({ gridRef }: { gridRef: RefObject<HTMLDivElement | null> }) {
  const handle = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; x: number; width: number } | null>(null);
  const [size, setSize] = useState({ width: 310, maximum: 310 });

  function bounds() {
    const grid = gridRef.current;
    const schedule = grid?.firstElementChild;
    return Math.max(
      MIN_CHAT_WIDTH,
      Math.floor(
        (grid?.clientWidth ?? 0) -
          (schedule?.getBoundingClientRect().width ?? 0) -
          MIN_MOVIES_WIDTH,
      ),
    );
  }

  function resize(width: number) {
    gridRef.current?.style.setProperty(
      "--chat-width",
      `${Math.round(Math.max(MIN_CHAT_WIDTH, Math.min(bounds(), width)))}px`,
    );
  }

  function finish() {
    const pointerId = drag.current?.pointerId;
    drag.current = null;
    gridRef.current?.classList.remove("is-resizing-chat");
    if (pointerId !== undefined && handle.current?.hasPointerCapture(pointerId))
      handle.current.releasePointerCapture(pointerId);
  }

  useEffect(() => {
    const grid = gridRef.current;
    const divider = handle.current;
    const chat = divider?.parentElement;
    if (!grid || !chat) return;
    const observer = new ResizeObserver(() => {
      if (getComputedStyle(grid).display !== "grid") {
        const pointerId = drag.current?.pointerId;
        drag.current = null;
        grid.classList.remove("is-resizing-chat");
        if (pointerId !== undefined && divider?.hasPointerCapture(pointerId))
          divider.releasePointerCapture(pointerId);
        return;
      }
      const maximum = Math.max(
        MIN_CHAT_WIDTH,
        Math.floor(
          grid.clientWidth -
            (grid.firstElementChild?.getBoundingClientRect().width ?? 0) -
            MIN_MOVIES_WIDTH,
        ),
      );
      setSize({ width: Math.round(chat.getBoundingClientRect().width), maximum });
    });
    observer.observe(grid);
    observer.observe(chat);
    return () => {
      observer.disconnect();
      drag.current = null;
      grid.classList.remove("is-resizing-chat");
    };
  }, [gridRef]);

  return (
    <div
      ref={handle}
      className="chat-resizer"
      role="separator"
      tabIndex={0}
      aria-label="Resize chat pane"
      aria-controls="chat-sidebar"
      aria-orientation="vertical"
      aria-valuemin={MIN_CHAT_WIDTH}
      aria-valuemax={size.maximum}
      aria-valuenow={size.width}
      aria-valuetext={`${size.width} pixels wide`}
      title="Drag to resize chat. Use Left/Right arrow keys, or double-click to reset."
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          width: event.currentTarget.parentElement!.getBoundingClientRect().width,
        };
        gridRef.current?.classList.add("is-resizing-chat");
      }}
      onPointerMove={(event) => {
        if (drag.current?.pointerId === event.pointerId)
          resize(drag.current.width + drag.current.x - event.clientX);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
      onDoubleClick={() => gridRef.current?.style.removeProperty("--chat-width")}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 50 : 10;
        const width = event.currentTarget.parentElement!.getBoundingClientRect().width;
        if (event.key === "ArrowLeft") resize(width + step);
        else if (event.key === "ArrowRight") resize(width - step);
        else if (event.key === "Home") resize(MIN_CHAT_WIDTH);
        else if (event.key === "End") resize(bounds());
        else return;
        event.preventDefault();
      }}
    />
  );
}
