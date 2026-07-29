import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { CheckCircle, AlertCircle, AlertTriangle, Info, X, Inbox } from 'lucide-react';

/* ============================================================================
 * Shared UI kit for the Admin Console.
 * Replaces the scattered inline banners, checkbox toggles, chip walls and
 * hand-rolled badges with one consistent set of primitives.
 * ========================================================================== */

/* ────────────────────────────── Toasts ───────────────────────────────────
 * Replaces the `useState + setTimeout` success/error banner pattern that was
 * duplicated ~8 times across AdminPanel. Usage:
 *
 *   const toast = useToast();
 *   toast.success('User Jane Doe created');
 *   toast.error('Upload failed — preview kept so you can retry');
 */

type ToastVariant = 'success' | 'error' | 'warning' | 'info';
interface Toast { id: number; variant: ToastVariant; message: string }

interface ToastApi {
  success: (m: string) => void;
  error: (m: string) => void;
  warning: (m: string) => void;
  info: (m: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const TOAST_STYLE: Record<ToastVariant, { icon: React.ReactNode; bar: string }> = {
  success: { icon: <CheckCircle size={16} />, bar: 'var(--color-success)' },
  error:   { icon: <AlertCircle size={16} />, bar: 'var(--color-danger)' },
  warning: { icon: <AlertTriangle size={16} />, bar: 'var(--color-warning)' },
  info:    { icon: <Info size={16} />, bar: 'var(--color-accent)' },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback(
    (id: number) => setToasts((t) => t.filter((x) => x.id !== id)),
    []
  );

  const push = useCallback(
    (variant: ToastVariant) => (message: string) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t.slice(-3), { id, variant, message }]); // max 4
      setTimeout(() => dismiss(id), variant === 'error' ? 7000 : 4000);
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: push('success'),
      error: push('error'),
      warning: push('warning'),
      info: push('info'),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-[min(380px,calc(100vw-2rem))]"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="flex items-start gap-3 rounded-[var(--radius-md)] border p-3 pr-2 text-sm animate-[toast-in_.18s_ease-out]"
            style={{
              background: 'var(--color-surface)',
              borderColor: 'var(--color-border)',
              boxShadow: 'var(--shadow-lg)',
              borderLeft: `3px solid ${TOAST_STYLE[t.variant].bar}`,
            }}
          >
            <span className="mt-0.5 shrink-0" style={{ color: TOAST_STYLE[t.variant].bar }}>
              {TOAST_STYLE[t.variant].icon}
            </span>
            <span className="flex-1" style={{ color: 'var(--color-text)' }}>
              {t.message}
            </span>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="p-1 rounded hover:opacity-70"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      <style>{`@keyframes toast-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }`}</style>
    </ToastContext.Provider>
  );
}

/* ────────────────────────────── Tab nav ──────────────────────────────────
 * Underline tabs with icons and counts. Replaces the 7-way admin sub-tab
 * buttons; horizontally scrollable so mobile doesn't wrap into two rows.
 */

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
  count?: number;
  alert?: boolean; // e.g. missing reports > 0
}

export function TabNav<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div
      role="tablist"
      className="admin-scroll flex gap-1 overflow-x-auto border-b -mb-px"
      style={{ borderColor: 'var(--color-border)' }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className="relative flex items-center gap-2 whitespace-nowrap px-3.5 py-2.5 text-sm font-medium transition-colors"
            style={{
              color: isActive ? 'var(--color-accent)' : 'var(--color-text-muted)',
              boxShadow: isActive ? 'inset 0 -2px 0 var(--color-accent)' : 'none',
            }}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
                style={{
                  background: tab.alert ? 'var(--color-danger-soft)' : 'var(--color-surface-2)',
                  color: tab.alert ? 'var(--color-danger)' : 'var(--color-text-secondary)',
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ────────────────────────────── Switch ───────────────────────────────────
 * Accessible toggle. Replaces the raw checkboxes in GlobalSettings — a
 * master "Enable Scheduler" kill-switch deserves more than a 16px checkbox.
 */

export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50"
      style={{ background: checked ? 'var(--color-accent)' : 'var(--color-border-strong)' }}
    >
      <span
        className="inline-block h-5 w-5 rounded-full bg-white transition-transform"
        style={{
          transform: checked ? 'translateX(22px)' : 'translateX(2px)',
          boxShadow: 'var(--shadow-sm)',
        }}
      />
    </button>
  );
}

/* ────────────────────────────── Badges ─────────────────────────────────── */

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'accent';

const BADGE: Record<BadgeVariant, { bg: string; fg: string }> = {
  neutral: { bg: 'var(--color-surface-2)', fg: 'var(--color-text-secondary)' },
  success: { bg: 'var(--color-success-soft)', fg: 'var(--color-success)' },
  warning: { bg: 'var(--color-warning-soft)', fg: 'var(--color-warning)' },
  danger:  { bg: 'var(--color-danger-soft)', fg: 'var(--color-danger)' },
  accent:  { bg: 'var(--color-accent-soft)', fg: 'var(--color-accent)' },
};

export function Badge({
  variant = 'neutral',
  dot,
  children,
}: {
  variant?: BadgeVariant;
  dot?: boolean;
  children: React.ReactNode;
}) {
  const s = BADGE[variant];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: s.bg, color: s.fg }}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.fg }} />}
      {children}
    </span>
  );
}

/* ────────────────────────────── Empty state ─────────────────────────────── */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
      <div
        className="mb-1 flex h-11 w-11 items-center justify-center rounded-full"
        style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)' }}
      >
        {icon ?? <Inbox size={20} />}
      </div>
      <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
        {title}
      </p>
      {description && (
        <p className="max-w-sm text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* ────────────────────────────── Skeletons ────────────────────────────────
 * Show these while unsubmittedTeams / emailDeliveryFailures / report configs
 * load, instead of a blank panel.
 */

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div
            className="h-8 w-8 shrink-0 animate-pulse rounded-full"
            style={{ background: 'var(--color-surface-2)' }}
          />
          <div className="flex-1 space-y-2">
            <div
              className="h-3 animate-pulse rounded"
              style={{ background: 'var(--color-surface-2)', width: `${55 + ((i * 17) % 30)}%` }}
            />
            <div
              className="h-3 animate-pulse rounded"
              style={{ background: 'var(--color-surface-2)', width: `${30 + ((i * 11) % 20)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────── Card ────────────────────────────────────── */

export function Card({
  children,
  className = '',
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={`rounded-[var(--radius-lg)] border ${padded ? 'p-5' : ''} ${className}`}
      style={{
        background: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {children}
    </div>
  );
}

/* ────────────────────────────── Relative time ────────────────────────────
 * "3m ago" beats "1/21/2026, 4:32:11 PM" for scanning an activity feed.
 * Full timestamp stays available via title tooltip.
 */

export function timeAgo(iso: string | Date): string {
  const then = typeof iso === 'string' ? new Date(iso) : iso;
  const s = Math.floor((Date.now() - then.getTime()) / 1000);
  if (Number.isNaN(s)) return '';
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return then.toLocaleDateString();
}

export function TimeAgo({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString()}>
      {timeAgo(iso)}
    </time>
  );
}