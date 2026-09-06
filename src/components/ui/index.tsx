"use client";

import { AlertTriangle, Check, Copy, Loader2, X } from "lucide-react";
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { copyText } from "@/lib/client";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ---------------- Buttons ---------------- */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

const variantClass: Record<Variant, string> = {
  primary: "bg-teal-600 text-white hover:bg-teal-700 border-teal-700 disabled:bg-teal-600/50",
  secondary: "bg-surface text-text hover:bg-surface-2 border-line-strong",
  ghost: "bg-transparent text-text hover:bg-surface-2 border-transparent",
  danger: "bg-danger-600 text-white hover:bg-danger-700 border-danger-700",
};
const sizeClass: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[13px] gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, icon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center rounded-md border font-medium whitespace-nowrap select-none",
        "disabled:opacity-60 disabled:cursor-not-allowed transition-colors",
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  tone?: "default" | "danger";
}

export function IconButton({ label, tone = "default", className, children, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex size-7 items-center justify-center rounded-md border border-transparent transition-colors",
        tone === "danger" ? "text-danger-600 hover:bg-danger-50" : "text-text-muted hover:bg-surface-2 hover:text-text",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function CopyButton({ text, label = "Copy link", size = "sm" }: { text: string; label?: string; size?: Size }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size={size}
      icon={done ? <Check className="size-3.5 text-ok-600" /> : <Copy className="size-3.5" />}
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }
      }}
    >
      {done ? "Copied" : label}
    </Button>
  );
}

/* ---------------- Form controls ---------------- */

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...rest }, ref) {
    return <input ref={ref} className={cx("ctl", invalid && "is-invalid", className)} {...rest} />;
  },
);

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx("ctl pr-8", className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx("ctl min-h-20", className)} {...rest} />;
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={cx("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-text">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[12.5px] text-danger-600">{error}</p>
      ) : hint ? (
        <p className="text-[12.5px] text-text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Checkbox({
  label,
  description,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={rest.id ?? id} className={cx("flex items-start gap-2.5 cursor-pointer", className)}>
      <input id={rest.id ?? id} type="checkbox" className="mt-0.5 size-4 accent-teal-600" {...rest} />
      <span className="text-sm leading-5">
        <span className="text-text">{label}</span>
        {description ? <span className="block text-[12.5px] text-text-muted">{description}</span> : null}
      </span>
    </label>
  );
}

/* ---------------- Feedback ---------------- */

type Tone = "neutral" | "ok" | "warn" | "danger" | "info" | "teal";

const toneClass: Record<Tone, string> = {
  neutral: "bg-surface-2 text-text-muted border-line",
  ok: "bg-ok-50 text-ok-600 border-ok-600/20",
  warn: "bg-warn-50 text-warn-600 border-warn-600/20",
  danger: "bg-danger-50 text-danger-600 border-danger-600/20",
  info: "bg-info-50 text-info-600 border-info-600/20",
  teal: "bg-teal-50 text-teal-800 border-teal-600/20",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded border px-1.5 py-px text-[11.5px] font-medium leading-4 whitespace-nowrap",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Alert({ tone = "info", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <div className={cx("rounded-md border px-3 py-2.5 text-sm flex gap-2", toneClass[tone], className)}>
      {tone === "danger" || tone === "warn" ? <AlertTriangle className="size-4 shrink-0 mt-0.5" /> : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("size-5 animate-spin text-text-muted", className)} aria-label="Loading" />;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-text-muted p-6 text-sm">
      <Spinner /> {label}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="border border-dashed rounded-md p-8 text-center">
      <p className="font-medium">{title}</p>
      {description ? <p className="text-text-muted text-sm mt-1 max-w-md mx-auto">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div>
        <h1 className="text-lg font-semibold leading-tight">{title}</h1>
        {description ? <p className="text-text-muted text-sm mt-1">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({
  title,
  actions,
  children,
  className,
  padded = true,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={cx("bg-surface border rounded-md", className)}>
      {title || actions ? (
        <header className="flex items-center justify-between gap-3 px-4 h-11 border-b">
          <h2 className="text-sm font-semibold">{title}</h2>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={padded ? "p-4" : ""}>{children}</div>
    </section>
  );
}

export function Pagination({
  total,
  limit,
  offset,
  onChange,
}: {
  total: number;
  limit: number;
  offset: number;
  onChange: (offset: number) => void;
}) {
  if (total <= limit) return null;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.ceil(total / limit);
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 border-t text-[13px] text-text-muted">
      <span>
        {offset + 1}–{Math.min(offset + limit, total)} of {total}
      </span>
      <div className="flex items-center gap-1.5">
        <Button size="sm" disabled={page <= 1} onClick={() => onChange(Math.max(0, offset - limit))}>
          Previous
        </Button>
        <span className="px-1">
          {page} / {pages}
        </span>
        <Button size="sm" disabled={page >= pages} onClick={() => onChange(offset + limit)}>
          Next
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Modal ---------------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/50 p-4 sm:p-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        className={cx("w-full bg-surface rounded-lg shadow-2xl border mt-4 sm:mt-10", width)}
      >
        <header className="flex items-center justify-between gap-3 px-5 h-12 border-b">
          <h2 className="font-semibold text-[15px] truncate">{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </header>
        <div className="px-5 py-4">{children}</div>
        {footer ? <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t bg-surface-2 rounded-b-lg">{footer}</footer> : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  danger,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width="max-w-md"
      footer={
        <>
          <Button onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-text">{message}</div>
    </Modal>
  );
}

/* ---------------- Toasts ---------------- */

interface Toast {
  id: number;
  message: string;
  tone: "ok" | "danger" | "info";
}

const ToastContext = createContext<{ toast: (message: string, tone?: Toast["tone"]) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const toast = useCallback((message: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), tone === "danger" ? 6000 : 3200);
  }, []);
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-[min(92vw,380px)]" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={cx(
              "rounded-md border px-3.5 py-2.5 text-sm shadow-lg bg-surface flex gap-2 items-start",
              t.tone === "ok" && "border-ok-600/30",
              t.tone === "danger" && "border-danger-600/40",
              t.tone === "info" && "border-info-600/30",
            )}
          >
            {t.tone === "ok" ? (
              <Check className="size-4 text-ok-600 shrink-0 mt-0.5" />
            ) : t.tone === "danger" ? (
              <AlertTriangle className="size-4 text-danger-600 shrink-0 mt-0.5" />
            ) : null}
            <span className="min-w-0 break-words">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const v = useContext(ToastContext);
  if (!v) throw new Error("useToast must be used inside ToastProvider");
  return v;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}
