// Powered by OnSpace.AI
import { useCallback, useEffect, useState } from 'react';
import { detectCurrentLocation } from '@/services/locationService';
import { APP_CONFIG } from '@/constants/config';
import type { GeoLocation } from '@/services/types';

export function useLocation() {
  const [location, setLocation] = useState<GeoLocation>(APP_CONFIG.defaultLocation);
  const [detecting, setDetecting] = useState(false);

  const detect = useCallback(async () => {
    setDetecting(true);
    const loc = await detectCurrentLocation();
    setLocation(loc);
    setDetecting(false);
  }, []);

  useEffect(() => {
    detect();
  }, [detect]);

  return { location, detecting, detect, setLocation };
}
