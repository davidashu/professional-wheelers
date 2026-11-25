import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-accent-600 text-white hover:bg-accent-700 shadow-sm disabled:bg-accent-600/60",
  secondary: "bg-white text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 shadow-sm",
  danger: "bg-white text-red-700 ring-1 ring-inset ring-red-300 hover:bg-red-50",
  ghost: "text-slate-700 hover:bg-slate-100",
};
const sizes: Record<Size, string> = {
  sm: "px-2.5 py-1.5 text-sm",
  md: "px-3.5 py-2 text-sm",
  lg: "px-5 py-3 text-base",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold transition-colors disabled:cursor-not-allowed",
    variants[variant],
    sizes[size],
    extra,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export type Tone = "gray" | "blue" | "amber" | "violet" | "green" | "red" | "teal" | "slate";
const tones: Record<Tone, string> = {
  gray: "bg-slate-100 text-slate-700 ring-slate-200",
  slate: "bg-slate-800 text-white ring-slate-800",
  blue: "bg-blue-50 text-blue-800 ring-blue-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  violet: "bg-violet-50 text-violet-800 ring-violet-200",
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  red: "bg-red-50 text-red-800 ring-red-200",
  teal: "bg-teal-50 text-teal-800 ring-teal-200",
};

export function Badge({ tone = "gray", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Card({ children, className, ...rest }: ComponentProps<"section">) {
  return (
    <section className={cx("rounded-xl bg-white shadow-xs ring-1 ring-slate-200", className)} {...rest}>
      {children}
    </section>
  );
}

export function CardHeader({ title, action, description }: { title: ReactNode; action?: ReactNode; description?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="heading-display text-2xl text-ink sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="px-6 py-10 text-center">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Alert({ tone = "error", title, children }: { tone?: "error" | "success" | "info" | "warning"; title?: string; children?: ReactNode }) {
  const styles = {
    error: "bg-red-50 text-red-800 ring-red-200",
    success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    info: "bg-blue-50 text-blue-800 ring-blue-200",
    warning: "bg-amber-50 text-amber-900 ring-amber-200",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-md px-4 py-3 text-sm ring-1 ring-inset", styles)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-1" : undefined}>{children}</div>}
    </div>
  );
}

export const inputClass =
  "block w-full rounded-md border-0 bg-white px-3 py-2 text-base text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-brand-500 sm:text-sm aria-[invalid=true]:ring-red-500";

export function Label({ htmlFor, children, optional }: { htmlFor: string; children: ReactNode; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-800">
      {children}
      {optional && <span className="ml-1 font-normal text-slate-500">(optional)</span>}
    </label>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-sm text-red-700">
      {message}
    </p>
  );
}

export function DefinitionList({ items }: { items: Array<[ReactNode, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-[max-content_1fr]">
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-sm text-slate-500">{k}</dt>
          <dd className="text-sm text-slate-900">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export const tableClass = "min-w-full divide-y divide-slate-200 text-sm";
export const thClass = "px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500";
export const tdClass = "px-4 py-3 align-top text-slate-700";
