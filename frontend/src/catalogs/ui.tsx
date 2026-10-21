import { useTranslation } from 'react-i18next';

import { ApiError } from '@/api/errors';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney } from '@/lib/money';

/** Shared bits for the catalog and portal screens (spec F3 §9). */

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

/** RFC 7807 `detail` below; the hooks already refresh their own query (F2 §5). */
export function ErrorBanner({ error, fallback }: { error: unknown; fallback: string }) {
  const { t } = useTranslation('errors');
  if (!error) return null;
  const detail =
    error instanceof ApiError
      ? error.detail ?? (error.status === 0 ? t('network') : t('unknown'))
      : fallback;
  return (
    <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
      {detail}
    </p>
  );
}

export function EmptyBox({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
      {text}
    </p>
  );
}

export function ListSkeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-2">
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
    </div>
  );
}

/** Phones textarea (one per line) → the `string[]` the DTOs expect (≤5 × ≤50). */
export function linesToPhones(lines: string): string[] {
  return lines
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** `string[]` → phones textarea content. */
export function phonesToLines(phones: readonly string[] | null | undefined): string {
  return (phones ?? []).join('\n');
}

/** Decimal string → display money (§12); falls back to the raw value, never "null". */
export function invoiceMoney(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return formatMoney(value) ?? value;
}
