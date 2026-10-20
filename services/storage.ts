// Powered by OnSpace.AI
// Thin AsyncStorage wrapper for small pieces of local UI state (not the
// source of truth — Supabase is — just things like "which tenant did this
// customer last pick" so we don't ask again on every app launch).
import AsyncStorage from '@react-native-async-storage/async-storage';

export const StorageKeys = {
  selectedTenantId: '@splashgo/selectedTenantId',
} as const;

export async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJSON<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Silently ignore write errors in the mocked layer.
  }
}

export async function removeKey(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // ignore
  }
}
