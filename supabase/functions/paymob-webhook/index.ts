// Powered by OnSpace.AI
// Supabase Edge Function: paymob-webhook
// Deploy with: supabase functions deploy paymob-webhook --no-verify-jwt
// (Paymob calls this directly, with no Supabase auth header — HMAC is the
// verification instead.)
//
// Set this function's URL as your "Transaction processed callback" in
// Paymob dashboard → Integrations. Secret needed:
//   PAYMOB_HMAC_SECRET — Paymob dashboard → Settings → Payment Integrations → HMAC
//
// TODO(paymob): Paymob's HMAC is computed over a specific, ordered list of
// fields from the callback payload (documented at
// https://docs.paymob.com/docs/calculate-hmac). Confirm the exact field
// order/list against your integration type (card vs wallet) before relying
// on this in production — the concatenation below follows Paymob's
// "Transaction Processed" callback spec at the time this was written.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

async function hmacSha512Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

serve(async (req) => {
  const url = new URL(req.url);
  const receivedHmac = url.searchParams.get('hmac') ?? '';
  const body = await req.json();
  const obj = body.obj ?? body; // Paymob nests the transaction under `obj`

  // TODO(paymob): this field order must match Paymob's docs exactly.
  const orderedFields = [
    obj.amount_cents,
    obj.created_at,
    obj.currency,
    obj.error_occured,
    obj.has_parent_transaction,
    obj.id,
    obj.integration_id,
    obj.is_3d_secure,
    obj.is_auth,
    obj.is_capture,
    obj.is_refunded,
    obj.is_standalone_payment,
    obj.is_voided,
    obj.order?.id,
    obj.owner,
    obj.pending,
    obj.source_data?.pan,
    obj.source_data?.sub_type,
    obj.source_data?.type,
    obj.success,
  ];
  const message = orderedFields.map((v) => (v === undefined || v === null ? '' : String(v))).join('');
  const computedHmac = await hmacSha512Hex(Deno.env.get('PAYMOB_HMAC_SECRET')!, message);

  if (computedHmac !== receivedHmac) {
    return new Response('invalid hmac', { status: 401 });
  }

  const paymentId = obj.extras?.payment_id ?? obj.special_reference ?? obj.order?.merchant_order_id;
  if (!paymentId) return new Response('missing payment reference', { status: 400 });

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const status = obj.success ? 'succeeded' : 'failed';
  const cardLast4 = obj.source_data?.pan?.slice(-4) ?? '0000';

  await supabaseAdmin
    .from('payments')
    .update({ status, provider_ref: String(obj.id), card_last4: cardLast4 })
    .eq('id', paymentId);

  return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } });
});
