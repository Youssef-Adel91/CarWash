// Powered by OnSpace.AI
// Saved addresses service — lets customers store favourite locations
// (home, office, etc.) so they don't have to pin a map every time they book.
import { getSupabaseClient } from '@/template';
import type { SavedAddress } from './types';

const supabase = getSupabaseClient();

function mapRow(row: any): SavedAddress {
  return {
    id: row.id,
    userId: row.user_id,
    label: row.label,
    lat: Number(row.lat),
    lng: Number(row.lng),
    address: row.address,
    isDefault: row.is_default ?? false,
    createdAt: row.created_at,
  };
}

export async function getSavedAddresses(userId: string): Promise<SavedAddress[]> {
  const { data, error } = await supabase
    .from('saved_addresses')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []).map(mapRow);
}

export async function addAddress(params: {
  userId: string;
  label: string;
  lat: number;
  lng: number;
  address: string;
  makeDefault?: boolean;
}): Promise<SavedAddress | null> {
  const { userId, label, lat, lng, address, makeDefault } = params;

  if (makeDefault) {
    await supabase
      .from('saved_addresses')
      .update({ is_default: false })
      .eq('user_id', userId);
  }

  const { data, error } = await supabase
    .from('saved_addresses')
    .insert({ user_id: userId, label, lat, lng, address, is_default: makeDefault ?? false })
    .select()
    .single();
  if (error || !data) return null;
  return mapRow(data);
}

export async function removeAddress(id: string, userId: string): Promise<void> {
  await supabase
    .from('saved_addresses')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
}

export async function setDefaultAddress(id: string, userId: string): Promise<void> {
  await supabase
    .from('saved_addresses')
    .update({ is_default: false })
    .eq('user_id', userId);
  await supabase
    .from('saved_addresses')
    .update({ is_default: true })
    .eq('id', id)
    .eq('user_id', userId);
}
