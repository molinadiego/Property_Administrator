import { NavLink } from 'react-router';
import { useTranslation } from 'react-i18next';

import { NAV_ITEMS } from '@/app/nav-items';
import { cn } from '@/lib/utils';

/**
 * Mobile navigation (<768): fixed bottom bar, thumb-reachable, no horizontal
 * scrolling at 360 px (AC-F0.8).
 */
export function BottomNav() {
  const { t } = useTranslation('nav');
  return (
    <nav
      aria-label={t('primary')}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background md:hidden"
    >
      <ul className="grid grid-cols-6">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 px-1 py-2 text-[11px] leading-tight',
                  isActive
                    ? 'font-medium text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              <item.icon className="size-4" aria-hidden="true" />
              {t(item.labelKey)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
