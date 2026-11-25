import { Badge, cx } from "./ui";
import {
  CARRIER_PATH, CARRIER_STATUS_LABEL, CARRIER_STATUS_TONE, CUSTOMER_PATH, CUSTOMER_PROBLEM, CUSTOMER_STATUS_LABEL,
  CUSTOMER_STATUS_TONE, CUSTOMER_STEP_OF, QUOTE_ORDER_LABEL, QUOTE_ORDER_TONE, TASK_PRIORITY_TONE,
  type CarrierStatus, type CustomerStatus, type QuoteOrderStatus, type TaskPriority,
} from "@/lib/tms";

export function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  return <Badge tone={CUSTOMER_STATUS_TONE[status]}>{CUSTOMER_STATUS_LABEL[status]}</Badge>;
}
export function CarrierStatusBadge({ status }: { status: CarrierStatus }) {
  return <Badge tone={CARRIER_STATUS_TONE[status]}>{CARRIER_STATUS_LABEL[status]}</Badge>;
}
export function QuoteOrderBadge({ status }: { status: QuoteOrderStatus }) {
  return <Badge tone={QUOTE_ORDER_TONE[status]}>{QUOTE_ORDER_LABEL[status]}</Badge>;
}
export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return <Badge tone={TASK_PRIORITY_TONE[priority]} className="capitalize">{priority}</Badge>;
}

/** Horizontal progress bar: completed steps, the current step (with any side state like "Running late"), upcoming steps. */
function Steps<T extends string>({
  path, currentStep, label, current, problem, stopped,
}: {
  path: T[]; currentStep: T | null; label: Record<T, string>; current: string; problem: boolean; stopped: boolean;
}) {
  const idx = currentStep ? path.indexOf(currentStep) : -1;
  return (
    <ol className="flex w-full gap-1" aria-label="Progress">
      {path.map((s, i) => {
        const done = !stopped && i < idx;
        const active = !stopped && i === idx;
        return (
          <li key={s} className="min-w-0 flex-1">
            <div
              className={cx(
                "h-1.5 rounded-full",
                done && "bg-emerald-500",
                active && (problem ? "bg-amber-500" : "bg-brand-600"),
                !done && !active && "bg-slate-200",
              )}
            />
            <p
              className={cx(
                "mt-1 truncate text-[11px] leading-tight",
                active ? "font-semibold text-slate-900" : done ? "text-slate-600" : "text-slate-400",
              )}
              aria-current={active ? "step" : undefined}
              title={label[s]}
            >
              {active && current !== label[s] ? current : label[s]}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

export function CustomerBar({ status, title = "Customer" }: { status: CustomerStatus; title?: string }) {
  const stopped = status === "cancelled" || status === "load_issue";
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
        <CustomerStatusBadge status={status} />
      </div>
      <Steps
        path={CUSTOMER_PATH}
        currentStep={CUSTOMER_STEP_OF[status]}
        label={CUSTOMER_STATUS_LABEL}
        current={CUSTOMER_STATUS_LABEL[status]}
        problem={CUSTOMER_PROBLEM.includes(status)}
        stopped={stopped}
      />
    </div>
  );
}

export function CarrierBar({ status }: { status: CarrierStatus }) {
  const step: CarrierStatus | null = status === "not_assigned" ? null : status === "issue" ? "delivered" : status;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Carrier</p>
        <CarrierStatusBadge status={status} />
      </div>
      <Steps
        path={CARRIER_PATH}
        currentStep={step}
        label={CARRIER_STATUS_LABEL}
        current={CARRIER_STATUS_LABEL[status]}
        problem={status === "issue"}
        stopped={false}
      />
    </div>
  );
}
