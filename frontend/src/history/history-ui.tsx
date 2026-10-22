import { useTranslation } from 'react-i18next';

import type { HistoryJobViewDto } from '@/api/types';
import { ErrorBanner, formatDate } from '@/catalogs/ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/**
 * Small shared pieces of the history screens (spec F5 §2): the terminal
 * antecedents of a job (result/reason only — free progress notes never
 * travel, etapa-3 §4.5) and the standard error + retry state.
 */

export function QueryErrorState({
  error,
  fallback,
  onRetry,
}: {
  error: unknown;
  fallback: string;
  onRetry: () => void;
}) {
  const { t } = useTranslation('common');
  return (
    <div className="space-y-2">
      <ErrorBanner error={error} fallback={fallback} />
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        {t('action.retry')}
      </Button>
    </div>
  );
}

/** Job antecedents: terminal result/reason only — free notes never travel (etapa-3 §4.5). */
export function JobAntecedents({
  job,
  compact = false,
}: {
  job: HistoryJobViewDto;
  /** The mine rows already render title + badges above; dates/result only. */
  compact?: boolean;
}) {
  const { t } = useTranslation(['history', 'orders']);
  return (
    <li className="space-y-1 rounded-md bg-secondary/50 p-2 text-xs">
      {compact ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{job.title}</span>
          <Badge variant="outline">{t(`orders:jobStatus.${job.status}`)}</Badge>
        </div>
      )}
      {job.startedAt ? (
        <p className="text-muted-foreground">
          {t('history:job.started', { date: formatDate(job.startedAt) })}
        </p>
      ) : null}
      {job.completedAt ? (
        <p className="text-muted-foreground">
          {t('history:job.completed', { date: formatDate(job.completedAt) })}
        </p>
      ) : null}
      {job.result ? (
        <p>
          <span className="font-medium">{t('history:job.result')}:</span> {job.result}
        </p>
      ) : null}
      {job.reason ? (
        <p>
          <span className="font-medium">{t('history:job.reason')}:</span> {job.reason}
        </p>
      ) : null}
    </li>
  );
}
