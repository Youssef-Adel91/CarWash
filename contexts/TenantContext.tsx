// Powered by OnSpace.AI
// Decides which "mode" the signed-in user sees: a customer ordering from a
// chosen car-wash company, a worker handling jobs for one tenant, or an
// owner/admin managing one. A user can only be in one active mode at a
// time in this MVP — if they hold an owner/admin membership it wins over
// worker, which wins over the plain customer flow.
import React, { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import * as membershipService from '@/services/membershipService';
import * as tenantService from '@/services/tenantService';
import { StorageKeys, readJSON, writeJSON } from '@/services/storage';
import type { AppMode, Tenant, TenantMembership } from '@/services/types';

type TenantContextType = {
  loading: boolean;
  memberships: TenantMembership[];
  mode: AppMode;
  /** The membership backing an admin/worker mode (undefined for customers). */
  activeMembership?: TenantMembership;
  /** The tenant a customer has chosen to order from (undefined until picked). */
  selectedTenant: Tenant | null;
  selectTenant: (tenantId: string) => Promise<void>;
  clearSelectedTenant: () => Promise<void>;
  refresh: () => Promise<void>;
};

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setMemberships([]);
      setSelectedTenant(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await membershipService.getMyMemberships(user.id);
      setMemberships(list);

      const hasStaffRole = list.some((m) => m.role === 'owner' || m.role === 'admin' || m.role === 'worker');
      if (!hasStaffRole) {
        const savedId = await readJSON<string | null>(StorageKeys.selectedTenantId, null);
        if (savedId) {
          const tenant = await tenantService.getTenantById(savedId);
          setSelectedTenant(tenant);
        } else {
          setSelectedTenant(null);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selectTenant = useCallback(async (tenantId: string) => {
    const tenant = await tenantService.getTenantById(tenantId);
    setSelectedTenant(tenant);
    await writeJSON(StorageKeys.selectedTenantId, tenantId);
  }, []);

  const clearSelectedTenant = useCallback(async () => {
    setSelectedTenant(null);
    await writeJSON(StorageKeys.selectedTenantId, null);
  }, []);

  const activeMembership = useMemo(
    () =>
      memberships.find((m) => m.role === 'owner' || m.role === 'admin') ??
      memberships.find((m) => m.role === 'worker'),
    [memberships],
  );

  const mode: AppMode = useMemo(() => {
    const admin = memberships.find((m) => m.role === 'owner' || m.role === 'admin');
    if (admin) return { kind: 'admin', tenantId: admin.tenantId, role: admin.role as 'owner' | 'admin' };
    const worker = memberships.find((m) => m.role === 'worker');
    if (worker) return { kind: 'worker', tenantId: worker.tenantId };
    return { kind: 'customer' };
  }, [memberships]);

  return (
    <TenantContext.Provider
      value={{ loading, memberships, mode, activeMembership, selectedTenant, selectTenant, clearSelectedTenant, refresh }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const ctx = React.useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used within TenantProvider');
  return ctx;
}
