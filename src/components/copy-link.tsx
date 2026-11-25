"use client";

import { useState } from "react";
import { buttonClass } from "./ui";

export function CopyLink({ url, label = "Copy customer link" }: { url: string; label?: string }) {
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <input
        readOnly
        value={url}
        aria-label="Customer quote link"
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 rounded-md border-0 bg-slate-50 px-2 py-1.5 font-mono text-xs text-slate-700 ring-1 ring-inset ring-slate-200"
        data-testid="quote-link"
      />
      <button
        type="button"
        className={buttonClass("secondary", "sm")}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied("copied");
          } catch {
            setCopied("failed");
          }
          setTimeout(() => setCopied("idle"), 2500);
        }}
      >
        {copied === "copied" ? "Copied ✓" : copied === "failed" ? "Select and copy" : label}
      </button>
    </div>
  );
}
