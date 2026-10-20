// Powered by OnSpace.AI
// Supabase Edge Function: create-paymob-intention
// Deploy with: supabase functions deploy create-paymob-intention
// Secrets needed (supabase secrets set ...):
//   PAYMOB_SECRET_KEY        — from Paymob dashboard → Settings → Account Info
//   PAYMOB_PUBLIC_KEY        — same page
//   PAYMOB_INTEGRATION_ID    — the card integration id you created in Paymob
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — already injected by Supabase
//
// This is intentionally a thin, well-commented skeleton: fill in the two
// TODOs and it implements Paymob's Unified Intention API
// (https://docs.paymob.com/docs/unified-checkout).
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PAYMOB_BASE = 'https://accept.paymob.com/v1/intention/';

serve(async (req) => {
  try {
    const { amount_egp, kind, user_id, tenant_id, order_id, billing } = await req.json();

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Create a pending payment row first, so we have an id to correlate
    //    with Paymob's webhook later (merchant_order_id below).
    const { data: payment, error: insertError } = await supabaseAdmin
      .from('payments')
      .insert({
        user_id,
        tenant_id,
        order_id,
        kind,
        amount_egp,
        currency: 'EGP',
        status: 'failed', // flipped to 'succeeded' by the webhook only
        provider: 'paymob',
        card_last4: '0000',
      })
      .select()
      .single();
    if (insertError) throw insertError;

    // 2. TODO(paymob): call the Unified Intention API. Amounts are in
    //    piasters (EGP * 100).
    const paymobResponse = await fetch(PAYMOB_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${Deno.env.get('PAYMOB_SECRET_KEY')}`,
      },
      body: JSON.stringify({
        amount: Math.round(amount_egp * 100),
        currency: 'EGP',
        payment_methods: [Number(Deno.env.get('PAYMOB_INTEGRATION_ID'))],
        billing_data: {
          first_name: billing?.first_name ?? 'N/A',
          last_name: billing?.last_name ?? 'N/A',
          email: billing?.email ?? 'na@example.com',
          phone_number: billing?.phone_number ?? '+201000000000',
        },
        extras: { payment_id: payment.id },
        special_reference: payment.id,
      }),
    });

    if (!paymobResponse.ok) {
      const text = await paymobResponse.text();
      throw new Error(`Paymob intention failed: ${text}`);
    }
    const paymobData = await paymobResponse.json();

    // 3. TODO(paymob): the Unified Checkout URL format — confirm against
    //    current Paymob docs, this is the documented shape as of writing.
    const checkoutUrl = `https://accept.paymob.com/unifiedcheckout/?publicKey=${Deno.env.get(
      'PAYMOB_PUBLIC_KEY',
    )}&clientSecret=${paymobData.client_secret}`;

    return new Response(JSON.stringify({ payment_id: payment.id, checkout_url: checkoutUrl }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
