# SplashGo — Multi-tenant SaaS: what changed & how to finish setup

This adds the multi-tenant SaaS layer on top of the original demo: real
car-wash companies (tenants) with their own workers and admins, a worker
app mode, live GPS tracking, and a payment-gateway abstraction ready for
Paymob.

## 1. Run the database migration

Open your Supabase / OnSpace project's SQL editor and run
`supabase/migrations/0001_saas_multitenant.sql` once. It's additive — it
only adds tables/columns/policies, nothing is dropped.

## 2. New app structure

- `app/tenant-select.tsx` — customers pick which car-wash company to order from.
- `app/(worker)/*` — a worker's mode: open job queue (`jobs.tsx`), current
  job with live GPS broadcast (`active.tsx`), `earnings.tsx`, `profile.tsx`.
- `app/(admin)/*` — an owner/admin's mode: `dashboard.tsx`, `orders.tsx`,
  `workers.tsx` (add/remove workers by email), `wash-types.tsx` (pricing
  CRUD), `settings.tsx`.
- `app/(auth)/register-business.tsx` — sign up as a business owner (creates
  the tenant + charges the onboarding fee, same as customer registration).

Which mode a signed-in user lands in is decided by `contexts/TenantContext.tsx`
from their `tenant_members` rows (owner/admin > worker > plain customer).

## 3. Real GPS + maps

`components/feature/LiveMap.tsx` uses `react-native-maps` on iOS/Android
(falls back to the old stylised `MapCanvas` on web, which react-native-maps
doesn't support). For an Android **release** build you need a Google Maps
API key:

1. Get one from the Google Cloud Console (enable "Maps SDK for Android").
2. Put it in `app.json` → `expo.android.config.googleMaps.apiKey`
   (currently a placeholder: `PUT_YOUR_ANDROID_GOOGLE_MAPS_API_KEY_HERE`).

iOS uses Apple Maps under the hood and needs no key.

While a job is active, the worker's app calls `Location.watchPositionAsync`
and pushes updates to the `worker_locations` table
(`services/workerService.ts::pushLocation`); the customer's tracking screen
subscribes to that row over Supabase Realtime.

## 4. Payments — Paymob integration point

Since you're doing the Paymob integration yourself, here's exactly where it
plugs in:

- `constants/config.ts` → `APP_CONFIG.paymentProvider`: `'mock'` (default,
  works out of the box) or `'paymob'`.
- `services/paymentGateway/paymobGateway.ts` — the client-side call; it
  invokes a Supabase edge function rather than talking to Paymob directly
  (your secret key must never ship inside the app).
- `supabase/functions/create-paymob-intention/index.ts` — server-side edge
  function skeleton implementing Paymob's Unified Intention API. Fill in
  your `PAYMOB_SECRET_KEY`, `PAYMOB_PUBLIC_KEY`, `PAYMOB_INTEGRATION_ID` as
  Supabase secrets, double-check the request/response shape against
  Paymob's current docs, and deploy.
- `supabase/functions/paymob-webhook/index.ts` — verifies Paymob's HMAC and
  flips the `payments` row to succeeded/failed. Set `PAYMOB_HMAC_SECRET`
  and register this function's URL as your Paymob "Transaction processed"
  callback. **Double-check the HMAC field order against Paymob's docs** —
  it's the single most common integration bug.
- `components/feature/PaymobCheckoutSheet.tsx` — the WebView that hosts
  Paymob's hosted checkout page once you flip `paymentProvider` to `'paymob'`.

Until you deploy those, leave `paymentProvider: 'mock'` — everything else
(multi-tenancy, worker app, live tracking, admin dashboard) works fully in
that mode so you can test/demo the rest independently of the gateway work.

## 5. Known limitations / next steps

- A user can hold owner/admin/worker roles in only one "active" tenant at a
  time in this MVP (whichever the `TenantContext` picks first). A role
  switcher UI would be the natural next step if someone needs both hats.
- `services/paymentGateway/mockGateway.ts` still simulates the Visa charge
  instantly — fine for demos, not for production revenue.
- No push notifications yet (new job alerts for workers, status updates for
  customers) — `expo-notifications` is already a dependency if you want to
  wire that up next.
