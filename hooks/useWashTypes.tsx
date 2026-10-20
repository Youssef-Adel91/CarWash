// Powered by OnSpace.AI
// Loads the wash catalog for the customer's selected tenant.
import { useEffect, useState } from 'react';
import { useTenant } from '@/contexts/TenantContext';
import { fetchWashTypes, WASH_TYPES, type WashType } from '@/services/washService';

export function useWashTypes() {
  const { selectedTenant } = useTenant();
  const [washTypes, setWashTypes] = useState<WashType[]>(WASH_TYPES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchWashTypes(selectedTenant?.id)
      .then((list) => {
        if (active) setWashTypes(list);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedTenant?.id]);

  return { washTypes, loading };
}
