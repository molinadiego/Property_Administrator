import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';

import type { MembershipViewDto } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useActiveCompany } from '@/companies/active-company';

function membershipLabel(membership: MembershipViewDto): string {
  return membership.companyName;
}

/**
 * Active space selector: with several memberships it is a switch (F0-D1); the
 * change persists the id and invalidates the previous space's queries
 * (AC-F0.5), then returns to the shell root.
 */
export function CompanySwitcher() {
  const { t } = useTranslation('spaces');
  const navigate = useNavigate();
  const { memberships, activeId, setActive } = useActiveCompany();

  if (memberships.length === 0) return null;

  if (memberships.length === 1) {
    return (
      <p className="truncate text-sm font-medium text-foreground">
        {membershipLabel(memberships[0])}
      </p>
    );
  }

  return (
    <Select
      value={activeId ?? ''}
      onValueChange={(companyId) => {
        setActive(companyId);
        navigate('/app');
      }}
    >
      <SelectTrigger className="w-auto max-w-[14rem]" aria-label={t('switch')}>
        <SelectValue placeholder={t('switch')} />
      </SelectTrigger>
      <SelectContent>
        {memberships.map((membership) => (
          <SelectItem key={membership.companyId} value={membership.companyId}>
            {membershipLabel(membership)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function RoleBadge({ role }: { role: MembershipViewDto['role'] }) {
  const { t } = useTranslation('spaces');
  return <Badge variant="secondary">{t(`role.${role}`)}</Badge>;
}

export function ActiveBadge() {
  const { t } = useTranslation('spaces');
  return <Badge variant="success">{t('picker.activeBadge')}</Badge>;
}
