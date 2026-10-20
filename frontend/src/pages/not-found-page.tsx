import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** 404 state (spec F0 §7). */
export function NotFoundPage() {
  const { t } = useTranslation(['common', 'errors']);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-xl">{t('common:notFound.title')}</CardTitle>
          <CardDescription>{t('errors:notFound')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link to="/">{t('common:notFound.back')}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
