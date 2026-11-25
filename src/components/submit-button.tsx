"use client";

import { useFormStatus } from "react-dom";
import { buttonClass } from "./ui";
import type { ComponentProps } from "react";

export function SubmitButton({
  children,
  pendingText = "Saving…",
  variant = "primary",
  size = "md",
  className,
  ...rest
}: ComponentProps<"button"> & {
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || rest.disabled}
      aria-disabled={pending}
      className={buttonClass(variant, size, className)}
      {...rest}
    >
      {pending && (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
          <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" />
        </svg>
      )}
      {pending ? pendingText : children}
    </button>
  );
}
