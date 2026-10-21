import { useTranslation } from 'react-i18next';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Invalid-link screen of the portal (spec F3-D5, §2.2): a 401 (invalid,
 * revoked or expired token) renders this — never a login redirect. The token
 * is the only credential here; there is no session to fall back to.
 */
export function LimitedInvalidLink() {
  const { t } = useTranslation('limited');
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-xl">{t('invalid.title')}</CardTitle>
          <CardDescription>{t('invalid.description')}</CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}

/** Centered public layout of the portal (pattern of the F1 invitation). */
export function LimitedShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation('limited');
  return (
    <div className="min-h-dvh bg-background p-4">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <header>
          <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
        </header>
        {children}
      </div>
    </div>
  );
}
