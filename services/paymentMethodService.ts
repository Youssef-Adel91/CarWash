// Powered by OnSpace.AI
// Saved payment methods service — stores ONLY opaque gateway tokens and
// the last 4 digits for display. Full card numbers and CVCs are never
// persisted here (enforced by schema design, not just by convention).
//
// In mock mode a synthetic token 'mock_token_<last4>' is used so the
// full mock→Paymob swap requires zero changes to this file.
import { getSupabaseClient } from '@/template';
import type { PaymentMethod } from './types';

const supabase = getSupabaseClient();

function mapRow(row: any): PaymentMethod {
  return {
    id: row.id,
    userId: row.user_id,
    token: row.token,
    last4: row.last4,
    brand: row.brand ?? 'card',
    expiresAt: row.expires_at ?? undefined,
    isDefault: row.is_default ?? false,
    createdAt: row.created_at,
  };
}

export async function getSavedPaymentMethods(userId: string): Promise<PaymentMethod[]> {
  const { data, error } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []).map(mapRow);
}

/** Add a new tokenized card. In mock mode, pass token = 'mock_token_<last4>'. */
export async function addPaymentMethod(params: {
  userId: string;
  token: string;
  last4: string;
  brand?: string;
  expiresAt?: string;
  makeDefault?: boolean;
}): Promise<PaymentMethod | null> {
  const { userId, token, last4, brand, expiresAt, makeDefault } = params;

  // If this is to be the default, unset any existing default first.
  if (makeDefault) {
    await supabase
      .from('payment_methods')
      .update({ is_default: false })
      .eq('user_id', userId);
  }

  const { data, error } = await supabase
    .from('payment_methods')
    .insert({
      user_id: userId,
      token,
      last4,
      brand: brand ?? 'card',
      expires_at: expiresAt ?? null,
      is_default: makeDefault ?? false,
    })
    .select()
    .single();
  if (error || !data) return null;
  return mapRow(data);
}

export async function removePaymentMethod(id: string, userId: string): Promise<void> {
  await supabase
    .from('payment_methods')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
}

export async function setDefaultPaymentMethod(id: string, userId: string): Promise<void> {
  // Clear existing defaults, then set the chosen one.
  await supabase
    .from('payment_methods')
    .update({ is_default: false })
    .eq('user_id', userId);
  await supabase
    .from('payment_methods')
    .update({ is_default: true })
    .eq('id', id)
    .eq('user_id', userId);
}
