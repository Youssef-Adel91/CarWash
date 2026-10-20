// Powered by OnSpace.AI
// Real Paymob integration scaffold (Egypt — Visa/Mastercard via Paymob's
// Unified Intention API). Fill in the TODOs and deploy the two edge
// functions in supabase/functions/ before flipping
// APP_CONFIG.paymentProvider to 'paymob' in constants/config.ts.
//
// Why this calls an edge function instead of Paymob directly:
// Paymob's secret key must never ship inside the mobile app bundle. The
// app only ever talks to your own Supabase edge function, which holds the
// secret key server-side, creates the "payment intention", and returns a
// client_secret the app turns into a hosted checkout URL.
//
// Flow:
//  1. app calls `charge()` below
//  2. edge function `create-paymob-intention` creates a pending `payments`
//     row (status handled by the webhook, not here) and calls Paymob's
//     POST /v1/intention/ with amount, currency, billing data
//  3. app opens the returned checkout URL in a WebView (see
//     components/PaymobCheckoutSheet.tsx)
//  4. Paymob calls YOUR webhook (`paymob-webhook` edge function) once the
//     card is charged; the webhook verifies the HMAC and flips the
//     `payments` row to succeeded/failed (and the order, if relevant)
//  5. the app is subscribed (Supabase Realtime) to that payment row and
//     reacts as soon as it changes — no polling needed
import { getSupabaseClient } from '@/template';
import type { ChargeParams, ChargeStart, PaymentGateway } from './types';

const supabase = getSupabaseClient();

export const paymobGateway: PaymentGateway = {
  async charge(params: ChargeParams): Promise<ChargeStart> {
    // TODO(paymob): once you've deployed the edge function, this
    // `functions.invoke` call is the only piece that needs to stay in
    // sync with its request/response shape.
    const { data, error } = await supabase.functions.invoke('create-paymob-intention', {
      body: {
        amount_egp: params.amountEgp,
        kind: params.kind,
        user_id: params.userId,
        tenant_id: params.tenantId ?? null,
        order_id: params.orderId ?? null,
        billing: {
          first_name: params.customer.fullName.split(' ')[0] || params.customer.fullName,
          last_name: params.customer.fullName.split(' ').slice(1).join(' ') || 'N/A',
          email: params.customer.email,
          phone_number: params.customer.phone,
        },
      },
    });

    if (error) return { success: false, error: error.message };
    if (!data?.checkout_url || !data?.payment_id) {
      return { success: false, error: 'Paymob did not return a checkout URL. Check the edge function logs.' };
    }

    return { success: true, mode: 'checkout', paymentId: data.payment_id, checkoutUrl: data.checkout_url };
  },
};

/** Subscribes to a single `payments` row so the UI can react the instant
 * the webhook marks it succeeded/failed — call this right after opening
 * the checkout WebView. */
export function subscribeToPaymentStatus(
  paymentId: string,
  onUpdate: (status: 'succeeded' | 'failed') => void,
): () => void {
  const channel = supabase
    .channel(`payment-${paymentId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'payments', filter: `id=eq.${paymentId}` },
      (payload) => {
        const status = (payload.new as any)?.status;
        if (status === 'succeeded' || status === 'failed') onUpdate(status);
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
