"use client";

import { buttonClass } from "@/components/ui";

export function PrintButton({ label = "Print / save as PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass("secondary", "sm", "print:hidden")}>
      {label}
    </button>
  );
}
