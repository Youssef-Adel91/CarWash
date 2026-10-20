// Powered by OnSpace.AI
// App-wide configuration constants.

export const APP_CONFIG = {
  name: 'SplashGo',
  currency: 'EGP',
  // NOTE: accounts are free to create — there is no signup/registration
  // fee anymore (see app/(auth)/register.tsx and register-business.tsx).
  // `registrationFee` is kept only as the placeholder default for a
  // future PER-ORDER platform fee/commission ("packages" — not built
  // yet, to be designed once the pricing tiers are decided). It is not
  // read anywhere in the current registration flow.
  registrationFee: 10,
  defaultLocation: {
    latitude: 30.0444,
    longitude: 31.2357,
    address: 'Downtown, Cairo',
  },
  // Simulated timings (ms) for the mocked order lifecycle. Only used while
  // no real worker has accepted the order yet — once accepted, status
  // changes come from the worker app in real time.
  mockTimings: {
    findWorker: 3000,
  },
  // 'mock'   → instant simulated Visa charge (default, safe for demos/dev)
  // 'paymob' → real Paymob checkout — see services/paymentGateway/paymobGateway.ts
  //            and supabase/functions/*. Flip this once your edge functions
  //            and Paymob merchant credentials are live.
  paymentProvider: 'mock' as 'mock' | 'paymob',
} as const;
