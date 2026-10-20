import { useTranslation } from 'react-i18next';

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Section placeholder while its stage is not delivered (F0-D6: registered
 * navigation with placeholders, no invented features).
 */
export function ComingSoonStage({ labelKey, stage }: { labelKey: string; stage: string }) {
  const { t } = useTranslation(['nav', 'common']);
  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="text-xl">{t(`nav:${labelKey}`)}</CardTitle>
        <CardDescription>{t('common:stage.soon', { stage })}</CardDescription>
      </CardHeader>
      <div className="space-y-3 px-6 pb-6" aria-hidden="true">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-24 w-full" />
      </div>
    </Card>
  );
}
