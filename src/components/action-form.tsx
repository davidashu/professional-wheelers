"use client";

import { useActionState, useEffect, useRef, useTransition, type ReactNode } from "react";
import { Alert } from "./ui";
import type { ActionResult } from "@/lib/actions";

/**
 * Form wrapper for server actions: shows errors/success, keeps the user's input
 * on error (no automatic reset), and ignores double submits while pending.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  showSuccess = true,
  onSuccess,
  ...rest
}: {
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  children: ReactNode | ((state: { pending: boolean; result: ActionResult }) => ReactNode);
  className?: string;
  resetOnSuccess?: boolean;
  showSuccess?: boolean;
  onSuccess?: (result: NonNullable<ActionResult>) => void;
} & Omit<React.ComponentProps<"form">, "action" | "children" | "onSubmit">) {
  const [result, formAction] = useActionState<ActionResult, FormData>(action, null);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const lastHandled = useRef<ActionResult>(null);

  useEffect(() => {
    if (result && result !== lastHandled.current) {
      lastHandled.current = result;
      if (result.ok) {
        if (resetOnSuccess) ref.current?.reset();
        onSuccess?.(result);
      }
    }
  }, [result, resetOnSuccess, onSuccess]);

  return (
    <form
      ref={ref}
      className={className}
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const fd = new FormData(e.currentTarget, submitter);
        startTransition(() => formAction(fd));
      }}
      {...rest}
    >
      {result && !result.ok && (
        <div className="mb-3">
          <Alert>
            <p>{result.message}</p>
            {result.errors && Object.keys(result.errors).length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {Object.entries(result.errors).map(([k, v]) => (
                  <li key={k}>{v}</li>
                ))}
              </ul>
            )}
          </Alert>
        </div>
      )}
      {result?.ok && showSuccess && result.message && (
        <div className="mb-3">
          <Alert tone="success">{result.message}</Alert>
        </div>
      )}
      <fieldset disabled={pending} className="contents">
        {typeof children === "function" ? children({ pending, result }) : children}
      </fieldset>
    </form>
  );
}

export function PendingLabel({ pending, idle, busy }: { pending: boolean; idle: string; busy: string }) {
  return <>{pending ? busy : idle}</>;
}
