// Powered by OnSpace.AI
// Location helper using expo-location with a safe fallback for web/preview.
import * as Location from 'expo-location';
import { APP_CONFIG } from '@/constants/config';
import type { GeoLocation } from './types';

function roundCoord(v: number): number {
  return Math.round(v * 10000) / 10000;
}

export async function detectCurrentLocation(): Promise<GeoLocation> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return APP_CONFIG.defaultLocation;

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const { latitude, longitude } = position.coords;

    let address = 'Your current location';
    try {
      const geo = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (geo && geo[0]) {
        const g = geo[0];
        address = [g.street, g.district, g.city].filter(Boolean).join(', ') || address;
      }
    } catch {
      // reverse geocode may be unavailable; keep generic label.
    }

    return { latitude: roundCoord(latitude), longitude: roundCoord(longitude), address };
  } catch {
    return APP_CONFIG.defaultLocation;
  }
}
