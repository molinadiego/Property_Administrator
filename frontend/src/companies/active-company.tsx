import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';

import type { MembershipViewDto } from '@/api/types';
import { useMe } from '@/auth/session';
import { storage, storageKeys } from '@/lib/storage';

interface ActiveCompanyContextValue {
  memberships: MembershipViewDto[];
  /** The membership to work with, or null when none is active yet. */
  active: MembershipViewDto | null;
  activeId: string | null;
  /** True when the active space comes from persistence/derivation, not yet chosen. */
  setActive: (companyId: string) => void;
}

const ActiveCompanyContext = createContext<ActiveCompanyContextValue | null>(null);

/**
 * Active space resolution (spec F0 F0-D1, AC-F0.5):
 * - persisted id wins when it is still one of the user's memberships;
 * - otherwise, a single membership is auto-selected;
 * - revoked membership (no longer in the list) → cleared, back to the picker.
 *
 * Company-scoped queries must use the `['company', companyId, ...]` prefix so
 * the previous space's queries can be invalidated on switch.
 */
export function ActiveCompanyProvider({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const [overrideId, setOverrideId] = useState<string | null>(null);
  const previousActiveId = useRef<string | null>(null);

  const memberships = useMemo(() => me?.memberships ?? [], [me]);

  const activeId = useMemo(() => {
    if (memberships.length === 0) return null;
    if (overrideId && memberships.some((m) => m.companyId === overrideId)) {
      return overrideId;
    }
    const stored = storage.get(storageKeys.activeCompany);
    if (stored && memberships.some((m) => m.companyId === stored)) return stored;
    return memberships.length === 1 ? memberships[0].companyId : null;
  }, [memberships, overrideId]);

  // Clean up a persisted id that is no longer a membership (spec F0 §11).
  // Derivation already ignores it; this only drops it from storage.
  useEffect(() => {
    if (!me) return;
    const stored = storage.get(storageKeys.activeCompany);
    if (stored && !memberships.some((m) => m.companyId === stored)) {
      storage.remove(storageKeys.activeCompany);
    }
  }, [me, memberships]);

  useEffect(() => {
    previousActiveId.current = activeId;
  }, [activeId]);

  const setActive = useCallback(
    (companyId: string) => {
      const previous = previousActiveId.current;
      storage.set(storageKeys.activeCompany, companyId);
      setOverrideId(companyId);
      if (previous && previous !== companyId) {
        void queryClient.invalidateQueries({
          predicate: (query) =>
            query.queryKey[0] === 'company' && query.queryKey[1] === previous,
        });
      }
    },
    [queryClient],
  );

  const active = useMemo(
    () => memberships.find((m) => m.companyId === activeId) ?? null,
    [memberships, activeId],
  );

  const value = useMemo<ActiveCompanyContextValue>(
    () => ({ memberships, active, activeId, setActive }),
    [memberships, active, activeId, setActive],
  );

  return (
    <ActiveCompanyContext.Provider value={value}>
      {children}
    </ActiveCompanyContext.Provider>
  );
}

export function useActiveCompany(): ActiveCompanyContextValue {
  const context = useContext(ActiveCompanyContext);
  if (!context) {
    throw new Error('useActiveCompany must be used within ActiveCompanyProvider');
  }
  return context;
}
