// Powered by OnSpace.AI
// Card validation helpers + payment history reads. The actual charge now
// goes through services/paymentGateway (mock or Paymob) — see that folder.
import { getSupabaseClient } from '@/template';
import type { CardInput, Payment, PaymentKind, PaymentProvider } from './types';

const supabase = getSupabaseClient();

export function validateCard(card: CardInput): string | null {
  const digits = card.number.replace(/\s+/g, '');
  if (digits.length < 15 || digits.length > 16) return 'Card number must be 15-16 digits';
  if (!/^\d+$/.test(digits)) return 'Card number must contain digits only';
  if (!/^\d{2}\s?\/\s?\d{2}$/.test(card.expiry)) return 'Expiry must be in MM/YY format';
  if (card.cvc.length < 3) return 'CVC must be at least 3 digits';
  if (card.name.trim().length < 3) return 'Cardholder name is required';
  return null;
}

export function getCardLast4(card: CardInput): string {
  const digits = card.number.replace(/\s+/g, '');
  return digits.slice(-4);
}

function mapPaymentRow(row: any): Payment {
  return {
    id: row.id,
    userId: row.user_id,
    tenantId: row.tenant_id ?? undefined,
    orderId: row.order_id ?? undefined,
    kind: row.kind as PaymentKind,
    amountEgp: Number(row.amount_egp),
    currency: 'EGP',
    status: row.status === 'failed' ? 'failed' : 'succeeded',
    provider: (row.provider as PaymentProvider) ?? 'mock',
    providerRef: row.provider_ref ?? undefined,
    cardLast4: row.card_last4 ?? '0000',
    createdAt: row.created_at,
  };
}

export async function getPaymentsByUser(userId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []).map(mapPaymentRow);
}

export async function getPaymentsByTenant(tenantId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []).map(mapPaymentRow);
}

// Records an already-authorised charge (used for wash payments via saved
// card in mock mode; Paymob mode records its own row inside the edge
// function instead).
export async function recordPayment(params: {
  userId: string;
  tenantId?: string;
  orderId?: string;
  kind: PaymentKind;
  amountEgp: number;
  cardLast4: string;
}): Promise<Payment | null> {
  const { data, error } = await supabase
    .from('payments')
    .insert({
      user_id: params.userId,
      tenant_id: params.tenantId ?? null,
      order_id: params.orderId ?? null,
      kind: params.kind,
      amount_egp: params.amountEgp,
      currency: 'EGP',
      status: 'succeeded',
      provider: 'mock',
      card_last4: params.cardLast4,
    })
    .select()
    .single();
  if (error) return null;
  return mapPaymentRow(data);
}
