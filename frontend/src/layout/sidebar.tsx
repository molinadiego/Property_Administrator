import { NavLink } from 'react-router';
import { useTranslation } from 'react-i18next';

import { NAV_ITEMS } from '@/app/nav-items';
import { cn } from '@/lib/utils';

/**
 * Desktop/tablet navigation (≥768): icon-only until 1280, full labels from
 * there on (AC-F0.8).
 */
export function Sidebar() {
  const { t } = useTranslation('nav');
  return (
    <aside className="hidden w-16 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex xl:w-64">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
          HM
        </span>
        <span className="hidden truncate text-sm font-semibold text-sidebar-foreground xl:inline">
          Home Management
        </span>
      </div>
      <nav aria-label={t('primary')} className="flex-1 space-y-1 p-2">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-2 py-2 text-sm',
                'md:justify-center xl:justify-start',
                isActive
                  ? 'bg-accent font-medium text-accent-foreground'
                  : 'text-sidebar-foreground hover:bg-accent/60 hover:text-accent-foreground',
              )
            }
          >
            <item.icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="hidden xl:inline">{t(item.labelKey)}</span>
            <span className="sr-only xl:hidden">{t(item.labelKey)}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
