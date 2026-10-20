// Powered by OnSpace.AI
// Default gateway: same simulated behaviour the demo shipped with,
// wrapped behind the PaymentGateway interface so screens don't need to
// know whether they're talking to the mock or to Paymob.
import { getSupabaseClient } from '@/template';
import { validateCard, getCardLast4 } from '@/services/paymentService';
import type { ChargeParams, ChargeStart, PaymentGateway } from './types';

const supabase = getSupabaseClient();

export const mockGateway: PaymentGateway = {
  async charge(params: ChargeParams): Promise<ChargeStart> {
    if (!params.card) return { success: false, error: 'Card details are required.' };
    const validationError = validateCard(params.card);
    if (validationError) return { success: false, error: validationError };

    await new Promise((resolve) => setTimeout(resolve, 1200));

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
        card_last4: getCardLast4(params.card),
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, mode: 'instant', paymentId: data.id, cardLast4: getCardLast4(params.card) };
  },
};
