import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router';

import { useActiveCompany } from '@/companies/active-company';
import { cn } from '@/lib/utils';

/**
 * Catalogs shell (spec F3-D3, `/app/catalogs/*`): section links under the
 * active space, same pattern as Ajustes→Miembros (F1-D7). «Clientes» only
 * renders for `own_business` spaces (§2.3); the server enforces it anyway
 * (§16.1) — the link is convenience, never the check.
 */
export function CatalogsLayout() {
  const { t } = useTranslation(['catalogs', 'nav']);
  const { active } = useActiveCompany();

  const links = [
    { to: '/app/catalogs/properties', label: t('catalogs:nav.properties') },
    ...(active?.companyType === 'own_business'
      ? [{ to: '/app/catalogs/clients', label: t('catalogs:nav.clients') }]
      : []),
    { to: '/app/catalogs/relations', label: t('catalogs:nav.relations') },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-foreground">{t('nav:catalogs')}</h1>
      </header>
      <nav aria-label={t('nav:catalogs')}>
        <ul className="flex flex-wrap gap-2">
          {links.map((link) => (
            <li key={link.to}>
              <NavLink
                to={link.to}
                className={({ isActive }) =>
                  cn(
                    'inline-flex rounded-md px-3 py-2 text-sm',
                    isActive
                      ? 'bg-accent font-medium text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                  )
                }
              >
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </div>
  );
}
