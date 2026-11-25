"use client";

import { useEffect, useRef } from "react";
import { cx } from "./ui";

export type ChatItem = {
  id: string;
  mine: boolean;
  author: string;
  body: string;
  createdAt: string;
  reference?: string | null;
  /** small status under my own messages, e.g. "Seen" */
  status?: string | null;
};

const timeFmt = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles",
});

/** Conversation bubbles, newest at the bottom, scrolled to the latest message. */
export function ChatThread({ items, emptyTitle, emptyBody, className }: { items: ChatItem[]; emptyTitle: string; emptyBody?: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const last = items.at(-1)?.id;
  useEffect(() => {
    // Scroll only the message box, never the page.
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [last]);

  if (items.length === 0) {
    return (
      <div className={cx("px-6 py-10 text-center", className)}>
        <p className="text-sm font-semibold text-slate-900">{emptyTitle}</p>
        {emptyBody && <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{emptyBody}</p>}
      </div>
    );
  }
  return (
    <div ref={box} className={cx("max-h-[60vh] min-h-48 overflow-y-auto px-4 py-4", className)} role="log" aria-live="polite" aria-label="Messages">
      <ul className="space-y-3">
        {items.map((m) => (
          <li key={m.id} className={cx("flex flex-col", m.mine ? "items-end" : "items-start")} data-testid="chat-message">
            <p className="mb-1 text-xs text-slate-500">
              <span className="font-medium text-slate-700">{m.author}</span> · {timeFmt.format(new Date(m.createdAt))}
              {m.reference && <span className="ml-1 font-mono">· {m.reference}</span>}
            </p>
            <div
              className={cx(
                "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm sm:max-w-[70%]",
                m.mine ? "rounded-br-sm bg-brand-700 text-white" : "rounded-bl-sm bg-slate-100 text-slate-900",
              )}
            >
              {m.body}
            </div>
            {m.status && <p className="mt-0.5 text-[11px] text-slate-400">{m.status}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
