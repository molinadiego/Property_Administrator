import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';

import { useLogout } from '@/auth/session';
import { Button, type ButtonProps } from '@/components/ui/button';

/**
 * Ends the session (best-effort POST /auth/logout, local cleanup always) and
 * lands on /login — including on a double logout (spec F0 §11).
 */
export function LogoutButton({ variant = 'ghost', size = 'icon', withText }: { variant?: ButtonProps['variant']; size?: ButtonProps['size']; withText?: boolean }) {
  const { t } = useTranslation('common');
  const logout = useLogout();
  const navigate = useNavigate();
  const label = t('action.logout');

  return (
    <Button
      variant={variant}
      size={withText ? 'default' : size}
      disabled={logout.isPending}
      aria-label={withText ? undefined : label}
      title={label}
      onClick={() => {
        void logout.mutateAsync().finally(() => navigate('/login', { replace: true }));
      }}
    >
      <LogOut aria-hidden="true" />
      {withText ? label : null}
    </Button>
  );
}
